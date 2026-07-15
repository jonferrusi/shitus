const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "..", "data.sqlite"));
db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id  TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    avatar      TEXT,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shift_types (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL UNIQUE,
    active   INTEGER NOT NULL DEFAULT 1
  );

  -- shift_type_id = NULL means "overall" quota across every shift type combined
  CREATE TABLE IF NOT EXISTS quotas (
    shift_type_id   INTEGER UNIQUE,
    hours_required  REAL NOT NULL,
    FOREIGN KEY (shift_type_id) REFERENCES shift_types(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id        TEXT NOT NULL,
    shift_type_id     INTEGER NOT NULL,
    start_time        INTEGER NOT NULL,
    end_time          INTEGER,
    duration_seconds  INTEGER,
    FOREIGN KEY (shift_type_id) REFERENCES shift_types(id)
  );

  CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(discord_id);

  -- Extra admin/add-time roles granted from within the app, on top of
  -- whatever's in the .env file, so admins don't need to edit .env or
  -- restart anything to change who has access.
  CREATE TABLE IF NOT EXISTS role_permissions (
    role_id     TEXT NOT NULL,
    permission  TEXT NOT NULL, -- 'admin' or 'add_time'
    PRIMARY KEY (role_id, permission)
  );
`);

// Migration: restrict a shift type to one Discord role (e.g. only people
// with the Supervisor role can start a Supervisory Shift). NULL = anyone.
const shiftTypeColumns = db.prepare("PRAGMA table_info(shift_types)").all();
if (!shiftTypeColumns.some((c) => c.name === "required_role_id")) {
  db.exec(`ALTER TABLE shift_types ADD COLUMN required_role_id TEXT`);
}

// Migration: older databases won't have this column yet. 'clock' = logged via
// /shift on and off, 'manual' = added by hand on the website.
const shiftColumns = db.prepare("PRAGMA table_info(shifts)").all();
if (!shiftColumns.some((c) => c.name === "source")) {
  db.exec(`ALTER TABLE shifts ADD COLUMN source TEXT NOT NULL DEFAULT 'clock'`);
}
// Migration: break tracking for the /shift manage panel.
if (!shiftColumns.some((c) => c.name === "break_start")) {
  db.exec(`ALTER TABLE shifts ADD COLUMN break_start INTEGER`);
}
if (!shiftColumns.some((c) => c.name === "total_break_seconds")) {
  db.exec(`ALTER TABLE shifts ADD COLUMN total_break_seconds INTEGER NOT NULL DEFAULT 0`);
}

// Seed a couple of sensible default shift types the first time the DB is created
const seedTypes = ["Normal Patrol", "Supervisory Shift"];
const insertType = db.prepare(
  "INSERT OR IGNORE INTO shift_types (name) VALUES (?)"
);
for (const t of seedTypes) insertType.run(t);

// ---------------------------------------------------------------------------
// Week helpers
// ---------------------------------------------------------------------------
const WEEK_START_DAY = Number(process.env.WEEK_START_DAY ?? 1); // 1 = Monday

/** Unix seconds for the start of the current quota week, in server-local time. */
function currentWeekStart(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const day = now.getDay(); // 0-6, Sunday=0
  let diff = day - WEEK_START_DAY;
  if (diff < 0) diff += 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diff);
  return Math.floor(start.getTime() / 1000);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
function upsertUser({ discord_id, username, avatar }) {
  db.prepare(
    `INSERT INTO users (discord_id, username, avatar, updated_at)
     VALUES (@discord_id, @username, @avatar, @now)
     ON CONFLICT(discord_id) DO UPDATE SET
       username = excluded.username,
       avatar = excluded.avatar,
       updated_at = excluded.updated_at`
  ).run({ discord_id, username, avatar, now: Math.floor(Date.now() / 1000) });
}

// ---------------------------------------------------------------------------
// Shift types
// ---------------------------------------------------------------------------
function listShiftTypes({ activeOnly = true } = {}) {
  return db
    .prepare(
      `SELECT * FROM shift_types ${activeOnly ? "WHERE active = 1" : ""} ORDER BY name`
    )
    .all();
}

function getShiftTypeByName(name) {
  return db
    .prepare(
      "SELECT * FROM shift_types WHERE lower(name) = lower(?) AND active = 1"
    )
    .get(name);
}

function addShiftType(name, requiredRoleId = null) {
  return db
    .prepare(
      `INSERT INTO shift_types (name, active, required_role_id) VALUES (?, 1, ?)
       ON CONFLICT(name) DO UPDATE SET active = 1, required_role_id = excluded.required_role_id`
    )
    .run(name, requiredRoleId);
}

function removeShiftType(name) {
  return db.prepare("UPDATE shift_types SET active = 0 WHERE lower(name) = lower(?)").run(name);
}

/** Restrict (or, with roleId=null, un-restrict) an existing shift type to one role. */
function setShiftTypeRequiredRole(name, roleId) {
  return db
    .prepare("UPDATE shift_types SET required_role_id = ? WHERE lower(name) = lower(?)")
    .run(roleId, name);
}

/** Shift types a member (given their Discord role IDs) is allowed to start. */
function listShiftTypesForRoles(roleIds) {
  return listShiftTypes().filter(
    (t) => !t.required_role_id || roleIds.includes(t.required_role_id)
  );
}

// ---------------------------------------------------------------------------
// Role permissions (admin / add_time), on top of whatever's in .env
// ---------------------------------------------------------------------------
function addRolePermission(roleId, permission) {
  return db
    .prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)")
    .run(roleId, permission);
}

function removeRolePermission(roleId, permission) {
  return db
    .prepare("DELETE FROM role_permissions WHERE role_id = ? AND permission = ?")
    .run(roleId, permission);
}

function listRolePermissions(permission) {
  return db
    .prepare("SELECT role_id FROM role_permissions WHERE permission = ?")
    .all(permission)
    .map((r) => r.role_id);
}

/** Role IDs that grant a permission: whatever's in .env, plus whatever's been added in-app. */
function effectiveRoleIds(permission) {
  const envVar = permission === "admin" ? "ADMIN_ROLE_IDS" : "ADD_TIME_ROLE_IDS";
  const fromEnv = (process.env[envVar] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...fromEnv, ...listRolePermissions(permission)]);
}

// ---------------------------------------------------------------------------
// Quotas
// ---------------------------------------------------------------------------
function setQuota(shiftTypeId, hours) {
  db.prepare(
    `INSERT INTO quotas (shift_type_id, hours_required) VALUES (?, ?)
     ON CONFLICT(shift_type_id) DO UPDATE SET hours_required = excluded.hours_required`
  ).run(shiftTypeId, hours);
}

function listQuotas() {
  return db
    .prepare(
      `SELECT q.hours_required, st.id as shift_type_id, st.name as shift_type_name
       FROM quotas q
       LEFT JOIN shift_types st ON st.id = q.shift_type_id
       ORDER BY st.name IS NULL DESC, st.name`
    )
    .all();
}

function deleteQuota(shiftTypeId) {
  db.prepare(`DELETE FROM quotas WHERE shift_type_id IS ?`).run(shiftTypeId);
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------
function getActiveShift(discordId) {
  return db
    .prepare(
      "SELECT * FROM shifts WHERE discord_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1"
    )
    .get(discordId);
}

function clockOn(discordId, shiftTypeId, startTime = Math.floor(Date.now() / 1000)) {
  return db
    .prepare(
      "INSERT INTO shifts (discord_id, shift_type_id, start_time) VALUES (?, ?, ?)"
    )
    .run(discordId, shiftTypeId, startTime);
}

function clockOff(shiftId, endTime = Math.floor(Date.now() / 1000)) {
  const shift = db.prepare("SELECT * FROM shifts WHERE id = ?").get(shiftId);

  // If they forgot to end a break, close it out first so it's still excluded.
  let totalBreakSeconds = shift.total_break_seconds || 0;
  if (shift.break_start) {
    totalBreakSeconds += endTime - shift.break_start;
  }

  const duration = Math.max(0, endTime - shift.start_time - totalBreakSeconds);
  db.prepare(
    "UPDATE shifts SET end_time = ?, duration_seconds = ?, break_start = NULL, total_break_seconds = ? WHERE id = ?"
  ).run(endTime, duration, totalBreakSeconds, shiftId);
  return duration;
}

/** Start a break on an active shift. No-op (returns false) if already on break. */
function startBreak(shiftId, now = Math.floor(Date.now() / 1000)) {
  const shift = db.prepare("SELECT * FROM shifts WHERE id = ?").get(shiftId);
  if (!shift || shift.break_start) return false;
  db.prepare("UPDATE shifts SET break_start = ? WHERE id = ?").run(now, shiftId);
  return true;
}

/** End a break on an active shift, folding the elapsed time into total_break_seconds. */
function endBreak(shiftId, now = Math.floor(Date.now() / 1000)) {
  const shift = db.prepare("SELECT * FROM shifts WHERE id = ?").get(shiftId);
  if (!shift || !shift.break_start) return false;
  const elapsed = now - shift.break_start;
  db.prepare(
    "UPDATE shifts SET break_start = NULL, total_break_seconds = total_break_seconds + ? WHERE id = ?"
  ).run(elapsed, shiftId);
  return true;
}

/**
 * Add a completed shift entry by hand (from the website), rather than via
 * /shift on and /shift off. `dateStr` is a YYYY-MM-DD string; the entry is
 * anchored at noon that day so it always lands in the correct week bucket.
 */
function addManualShift(discordId, shiftTypeId, dateStr, hours) {
  const startTime = Math.floor(new Date(`${dateStr}T12:00:00`).getTime() / 1000);
  const durationSeconds = Math.round(hours * 3600);
  const endTime = startTime + durationSeconds;
  return db
    .prepare(
      `INSERT INTO shifts (discord_id, shift_type_id, start_time, end_time, duration_seconds, source)
       VALUES (?, ?, ?, ?, ?, 'manual')`
    )
    .run(discordId, shiftTypeId, startTime, endTime, durationSeconds);
}

function getShiftHistory(discordId, limit = 50) {
  return db
    .prepare(
      `SELECT s.*, st.name as shift_type_name
       FROM shifts s JOIN shift_types st ON st.id = s.shift_type_id
       WHERE s.discord_id = ? AND s.end_time IS NOT NULL
       ORDER BY s.start_time DESC LIMIT ?`
    )
    .all(discordId, limit);
}

/** Total completed seconds this week, broken down by shift type, for one user. */
function weeklyTotalsByType(discordId, weekStart = currentWeekStart()) {
  return db
    .prepare(
      `SELECT st.id as shift_type_id, st.name as shift_type_name,
              COALESCE(SUM(s.duration_seconds), 0) as total_seconds
       FROM shift_types st
       LEFT JOIN shifts s ON s.shift_type_id = st.id
         AND s.discord_id = ? AND s.end_time IS NOT NULL AND s.start_time >= ?
       WHERE st.active = 1
       GROUP BY st.id
       ORDER BY st.name`
    )
    .all(discordId, weekStart);
}

/** Total completed seconds of all time, broken down by shift type, for one user. */
function allTimeTotalsByType(discordId) {
  return db
    .prepare(
      `SELECT st.id as shift_type_id, st.name as shift_type_name,
              COALESCE(SUM(s.duration_seconds), 0) as total_seconds
       FROM shift_types st
       LEFT JOIN shifts s ON s.shift_type_id = st.id
         AND s.discord_id = ? AND s.end_time IS NOT NULL
       WHERE st.active = 1
       GROUP BY st.id
       ORDER BY st.name`
    )
    .all(discordId);
}

/**
 * Weekly leaderboard for one shift type (or every type combined, if
 * shiftTypeId is null), highest hours first. Only includes people with time
 * logged this week.
 */
function weeklyLeaderboard(shiftTypeId, weekStart = currentWeekStart()) {
  if (shiftTypeId == null) {
    return db
      .prepare(
        `SELECT u.discord_id, u.username, u.avatar,
                SUM(s.duration_seconds) as total_seconds
         FROM shifts s JOIN users u ON u.discord_id = s.discord_id
         WHERE s.end_time IS NOT NULL AND s.start_time >= ?
         GROUP BY u.discord_id
         HAVING total_seconds > 0
         ORDER BY total_seconds DESC
         LIMIT 15`
      )
      .all(weekStart);
  }
  return db
    .prepare(
      `SELECT u.discord_id, u.username, u.avatar,
              SUM(s.duration_seconds) as total_seconds
       FROM shifts s JOIN users u ON u.discord_id = s.discord_id
       WHERE s.end_time IS NOT NULL AND s.start_time >= ? AND s.shift_type_id = ?
       GROUP BY u.discord_id
       HAVING total_seconds > 0
       ORDER BY total_seconds DESC
       LIMIT 15`
    )
    .all(weekStart, shiftTypeId);
}

/** Roster: every known user with their total weekly seconds (all types combined). */
function rosterWeeklyTotals(weekStart = currentWeekStart()) {
  return db
    .prepare(
      `SELECT u.discord_id, u.username, u.avatar,
              COALESCE(SUM(CASE WHEN s.end_time IS NOT NULL AND s.start_time >= ?
                           THEN s.duration_seconds ELSE 0 END), 0) as total_seconds
       FROM users u
       LEFT JOIN shifts s ON s.discord_id = u.discord_id
       GROUP BY u.discord_id
       ORDER BY total_seconds DESC`
    )
    .all(weekStart);
}

/** All currently active (clocked-on) shifts with user + shift-type info. */
function listAllActiveShifts() {
  return db
    .prepare(
      `SELECT s.id, s.discord_id, s.shift_type_id, s.start_time,
              COALESCE(s.total_break_seconds, 0) AS total_break_seconds,
              s.break_start,
              st.name AS shift_type_name,
              u.username, u.avatar
       FROM shifts s
       JOIN shift_types st ON st.id = s.shift_type_id
       LEFT JOIN users u ON u.discord_id = s.discord_id
       WHERE s.end_time IS NULL
       ORDER BY s.start_time ASC`
    )
    .all();
}

/** Every registered user, alphabetical — used to populate the Add Time dropdown. */
function listAllUsers() {
  return db
    .prepare("SELECT discord_id, username, avatar FROM users ORDER BY username COLLATE NOCASE ASC")
    .all();
}

/**
 * Enhanced weekly roster: total seconds this week + the shift type they've
 * logged the most hours under (used as the "Role" column in the admin UI).
 */
function rosterWeeklyData(weekStart = currentWeekStart()) {
  return db
    .prepare(
      `SELECT
         u.discord_id, u.username, u.avatar,
         COALESCE(SUM(CASE WHEN s.end_time IS NOT NULL AND s.start_time >= ?
                           THEN s.duration_seconds ELSE 0 END), 0) AS total_seconds,
         (SELECT st2.name
          FROM shifts s2
          JOIN shift_types st2 ON st2.id = s2.shift_type_id
          WHERE s2.discord_id = u.discord_id
            AND s2.end_time IS NOT NULL
            AND s2.start_time >= ?
          GROUP BY s2.shift_type_id
          ORDER BY SUM(s2.duration_seconds) DESC
          LIMIT 1) AS primary_type
       FROM users u
       LEFT JOIN shifts s ON s.discord_id = u.discord_id
       GROUP BY u.discord_id
       ORDER BY total_seconds DESC`
    )
    .all(weekStart, weekStart);
}

module.exports = {
  db,
  currentWeekStart,
  upsertUser,
  listShiftTypes,
  getShiftTypeByName,
  addShiftType,
  removeShiftType,
  setShiftTypeRequiredRole,
  listShiftTypesForRoles,
  addRolePermission,
  removeRolePermission,
  listRolePermissions,
  effectiveRoleIds,
  setQuota,
  listQuotas,
  deleteQuota,
  getActiveShift,
  clockOn,
  clockOff,
  startBreak,
  endBreak,
  addManualShift,
  getShiftHistory,
  listAllActiveShifts,
  listAllUsers,
  rosterWeeklyData,
  weeklyTotalsByType,
  allTimeTotalsByType,
  weeklyLeaderboard,
  rosterWeeklyTotals,
};
