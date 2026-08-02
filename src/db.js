const path = require("path");
const { createClient } = require("@libsql/client");

// Points at a free hosted Turso database when TURSO_DATABASE_URL is set
// (e.g. deployed on Render, where local disk doesn't survive restarts), and
// falls back to a local SQLite file for local development.
const client = process.env.TURSO_DATABASE_URL
  ? createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  : createClient({ url: `file:${path.join(__dirname, "..", "data.sqlite")}` });

async function all(sql, args = []) {
  return (await client.execute({ sql, args })).rows;
}

async function get(sql, args = []) {
  return (await client.execute({ sql, args })).rows[0];
}

async function run(sql, args = []) {
  const res = await client.execute({ sql, args });
  return { changes: res.rowsAffected, lastInsertRowid: Number(res.lastInsertRowid) };
}

// ---------------------------------------------------------------------------
// Schema + migrations — safe to run every time the process starts, since
// every statement here is idempotent (IF NOT EXISTS / OR IGNORE).
// ---------------------------------------------------------------------------
let initPromise = null;

function init() {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

async function doInit() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id  TEXT PRIMARY KEY,
      username    TEXT NOT NULL,
      avatar      TEXT,
      updated_at  INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS shift_types (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL UNIQUE,
      active   INTEGER NOT NULL DEFAULT 1
    )
  `);

  // shift_type_id = NULL means "overall" quota across every shift type combined
  await client.execute(`
    CREATE TABLE IF NOT EXISTS quotas (
      shift_type_id   INTEGER UNIQUE,
      hours_required  REAL NOT NULL,
      FOREIGN KEY (shift_type_id) REFERENCES shift_types(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS shifts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id        TEXT NOT NULL,
      shift_type_id     INTEGER NOT NULL,
      start_time        INTEGER NOT NULL,
      end_time          INTEGER,
      duration_seconds  INTEGER,
      FOREIGN KEY (shift_type_id) REFERENCES shift_types(id)
    )
  `);

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(discord_id)`);

  // Extra admin/add-time roles granted from within the app, on top of
  // whatever's in the .env file, so admins don't need to edit .env or
  // restart anything to change who has access.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id     TEXT NOT NULL,
      permission  TEXT NOT NULL, -- 'admin' or 'add_time'
      PRIMARY KEY (role_id, permission)
    )
  `);

  // Migration: restrict a shift type to one Discord role (e.g. only people
  // with the Supervisor role can start a Supervisory Shift). NULL = anyone.
  const shiftTypeColumns = await all("PRAGMA table_info(shift_types)");
  if (!shiftTypeColumns.some((c) => c.name === "required_role_id")) {
    await client.execute(`ALTER TABLE shift_types ADD COLUMN required_role_id TEXT`);
  }

  // Migration: older databases won't have this column yet. 'clock' = logged via
  // /shift on and off, 'manual' = added by hand on the website.
  const shiftColumns = await all("PRAGMA table_info(shifts)");
  if (!shiftColumns.some((c) => c.name === "source")) {
    await client.execute(`ALTER TABLE shifts ADD COLUMN source TEXT NOT NULL DEFAULT 'clock'`);
  }
  // Migration: break tracking for the /shift manage panel.
  if (!shiftColumns.some((c) => c.name === "break_start")) {
    await client.execute(`ALTER TABLE shifts ADD COLUMN break_start INTEGER`);
  }
  if (!shiftColumns.some((c) => c.name === "total_break_seconds")) {
    await client.execute(`ALTER TABLE shifts ADD COLUMN total_break_seconds INTEGER NOT NULL DEFAULT 0`);
  }

  // Seed a couple of sensible default shift types the first time the DB is created
  for (const name of ["Normal Patrol", "Supervisory Shift"]) {
    await run("INSERT OR IGNORE INTO shift_types (name) VALUES (?)", [name]);
  }
}

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
async function upsertUser({ discord_id, username, avatar }) {
  await run(
    `INSERT INTO users (discord_id, username, avatar, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET
       username = excluded.username,
       avatar = excluded.avatar,
       updated_at = excluded.updated_at`,
    [discord_id, username, avatar, Math.floor(Date.now() / 1000)]
  );
}

// ---------------------------------------------------------------------------
// Shift types
// ---------------------------------------------------------------------------
async function listShiftTypes({ activeOnly = true } = {}) {
  return all(`SELECT * FROM shift_types ${activeOnly ? "WHERE active = 1" : ""} ORDER BY name`);
}

async function getShiftTypeByName(name) {
  return get("SELECT * FROM shift_types WHERE lower(name) = lower(?) AND active = 1", [name]);
}

async function addShiftType(name, requiredRoleId = null) {
  return run(
    `INSERT INTO shift_types (name, active, required_role_id) VALUES (?, 1, ?)
     ON CONFLICT(name) DO UPDATE SET active = 1, required_role_id = excluded.required_role_id`,
    [name, requiredRoleId]
  );
}

async function removeShiftType(name) {
  return run("UPDATE shift_types SET active = 0 WHERE lower(name) = lower(?)", [name]);
}

/** Restrict (or, with roleId=null, un-restrict) an existing shift type to one role. */
async function setShiftTypeRequiredRole(name, roleId) {
  return run("UPDATE shift_types SET required_role_id = ? WHERE lower(name) = lower(?)", [roleId, name]);
}

/** Shift types a member (given their Discord role IDs) is allowed to start. */
async function listShiftTypesForRoles(roleIds) {
  const types = await listShiftTypes();
  return types.filter((t) => !t.required_role_id || roleIds.includes(t.required_role_id));
}

// ---------------------------------------------------------------------------
// Role permissions (admin / add_time), on top of whatever's in .env
// ---------------------------------------------------------------------------
async function addRolePermission(roleId, permission) {
  return run("INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)", [roleId, permission]);
}

async function removeRolePermission(roleId, permission) {
  return run("DELETE FROM role_permissions WHERE role_id = ? AND permission = ?", [roleId, permission]);
}

async function listRolePermissions(permission) {
  const rows = await all("SELECT role_id FROM role_permissions WHERE permission = ?", [permission]);
  return rows.map((r) => r.role_id);
}

/** Role IDs that grant a permission: whatever's in .env, plus whatever's been added in-app. */
async function effectiveRoleIds(permission) {
  const envVar = permission === "admin" ? "ADMIN_ROLE_IDS" : "ADD_TIME_ROLE_IDS";
  const fromEnv = (process.env[envVar] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...fromEnv, ...(await listRolePermissions(permission))]);
}

// ---------------------------------------------------------------------------
// Quotas
// ---------------------------------------------------------------------------
async function setQuota(shiftTypeId, hours) {
  await run(
    `INSERT INTO quotas (shift_type_id, hours_required) VALUES (?, ?)
     ON CONFLICT(shift_type_id) DO UPDATE SET hours_required = excluded.hours_required`,
    [shiftTypeId, hours]
  );
}

async function listQuotas() {
  return all(
    `SELECT q.hours_required, st.id as shift_type_id, st.name as shift_type_name
     FROM quotas q
     LEFT JOIN shift_types st ON st.id = q.shift_type_id
     ORDER BY st.name IS NULL DESC, st.name`
  );
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------
async function getActiveShift(discordId) {
  return get(
    "SELECT * FROM shifts WHERE discord_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1",
    [discordId]
  );
}

async function clockOn(discordId, shiftTypeId, startTime = Math.floor(Date.now() / 1000)) {
  return run("INSERT INTO shifts (discord_id, shift_type_id, start_time) VALUES (?, ?, ?)", [
    discordId,
    shiftTypeId,
    startTime,
  ]);
}

async function clockOff(shiftId, endTime = Math.floor(Date.now() / 1000)) {
  const shift = await get("SELECT * FROM shifts WHERE id = ?", [shiftId]);

  // If they forgot to end a break, close it out first so it's still excluded.
  let totalBreakSeconds = shift.total_break_seconds || 0;
  if (shift.break_start) {
    totalBreakSeconds += endTime - shift.break_start;
  }

  const duration = Math.max(0, endTime - shift.start_time - totalBreakSeconds);
  await run(
    "UPDATE shifts SET end_time = ?, duration_seconds = ?, break_start = NULL, total_break_seconds = ? WHERE id = ?",
    [endTime, duration, totalBreakSeconds, shiftId]
  );
  return duration;
}

/** Start a break on an active shift. No-op (returns false) if already on break. */
async function startBreak(shiftId, now = Math.floor(Date.now() / 1000)) {
  const shift = await get("SELECT * FROM shifts WHERE id = ?", [shiftId]);
  if (!shift || shift.break_start) return false;
  await run("UPDATE shifts SET break_start = ? WHERE id = ?", [now, shiftId]);
  return true;
}

/** End a break on an active shift, folding the elapsed time into total_break_seconds. */
async function endBreak(shiftId, now = Math.floor(Date.now() / 1000)) {
  const shift = await get("SELECT * FROM shifts WHERE id = ?", [shiftId]);
  if (!shift || !shift.break_start) return false;
  const elapsed = now - shift.break_start;
  await run("UPDATE shifts SET break_start = NULL, total_break_seconds = total_break_seconds + ? WHERE id = ?", [
    elapsed,
    shiftId,
  ]);
  return true;
}

/**
 * Add a completed shift entry by hand (from the website), rather than via
 * /shift on and /shift off. `dateStr` is a YYYY-MM-DD string; the entry is
 * anchored at noon that day so it always lands in the correct week bucket.
 */
async function addManualShift(discordId, shiftTypeId, dateStr, hours) {
  const startTime = Math.floor(new Date(`${dateStr}T12:00:00`).getTime() / 1000);
  const durationSeconds = Math.round(hours * 3600);
  const endTime = startTime + durationSeconds;
  return run(
    `INSERT INTO shifts (discord_id, shift_type_id, start_time, end_time, duration_seconds, source)
     VALUES (?, ?, ?, ?, ?, 'manual')`,
    [discordId, shiftTypeId, startTime, endTime, durationSeconds]
  );
}

async function getShiftHistory(discordId, limit = 50) {
  return all(
    `SELECT s.*, st.name as shift_type_name
     FROM shifts s JOIN shift_types st ON st.id = s.shift_type_id
     WHERE s.discord_id = ? AND s.end_time IS NOT NULL
     ORDER BY s.start_time DESC LIMIT ?`,
    [discordId, limit]
  );
}

/** Total completed seconds this week, broken down by shift type, for one user. */
async function weeklyTotalsByType(discordId, weekStart = currentWeekStart()) {
  return all(
    `SELECT st.id as shift_type_id, st.name as shift_type_name,
            COALESCE(SUM(s.duration_seconds), 0) as total_seconds
     FROM shift_types st
     LEFT JOIN shifts s ON s.shift_type_id = st.id
       AND s.discord_id = ? AND s.end_time IS NOT NULL AND s.start_time >= ?
     WHERE st.active = 1
     GROUP BY st.id
     ORDER BY st.name`,
    [discordId, weekStart]
  );
}

/** Total completed seconds of all time, broken down by shift type, for one user. */
async function allTimeTotalsByType(discordId) {
  return all(
    `SELECT st.id as shift_type_id, st.name as shift_type_name,
            COALESCE(SUM(s.duration_seconds), 0) as total_seconds
     FROM shift_types st
     LEFT JOIN shifts s ON s.shift_type_id = st.id
       AND s.discord_id = ? AND s.end_time IS NOT NULL
     WHERE st.active = 1
     GROUP BY st.id
     ORDER BY st.name`,
    [discordId]
  );
}

/**
 * Weekly leaderboard for one shift type (or every type combined, if
 * shiftTypeId is null), highest hours first. Only includes people with time
 * logged this week.
 */
async function weeklyLeaderboard(shiftTypeId, weekStart = currentWeekStart()) {
  if (shiftTypeId == null) {
    return all(
      `SELECT u.discord_id, u.username, u.avatar,
              SUM(s.duration_seconds) as total_seconds
       FROM shifts s JOIN users u ON u.discord_id = s.discord_id
       WHERE s.end_time IS NOT NULL AND s.start_time >= ?
       GROUP BY u.discord_id
       HAVING total_seconds > 0
       ORDER BY total_seconds DESC
       LIMIT 15`,
      [weekStart]
    );
  }
  return all(
    `SELECT u.discord_id, u.username, u.avatar,
            SUM(s.duration_seconds) as total_seconds
     FROM shifts s JOIN users u ON u.discord_id = s.discord_id
     WHERE s.end_time IS NOT NULL AND s.start_time >= ? AND s.shift_type_id = ?
     GROUP BY u.discord_id
     HAVING total_seconds > 0
     ORDER BY total_seconds DESC
     LIMIT 15`,
    [weekStart, shiftTypeId]
  );
}

/** Roster: every known user with their total weekly seconds (all types combined). */
async function rosterWeeklyTotals(weekStart = currentWeekStart()) {
  return all(
    `SELECT u.discord_id, u.username, u.avatar,
            COALESCE(SUM(CASE WHEN s.end_time IS NOT NULL AND s.start_time >= ?
                         THEN s.duration_seconds ELSE 0 END), 0) as total_seconds
     FROM users u
     LEFT JOIN shifts s ON s.discord_id = u.discord_id
     GROUP BY u.discord_id
     ORDER BY total_seconds DESC`,
    [weekStart]
  );
}

module.exports = {
  init,
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
  getActiveShift,
  clockOn,
  clockOff,
  startBreak,
  endBreak,
  addManualShift,
  getShiftHistory,
  weeklyTotalsByType,
  allTimeTotalsByType,
  weeklyLeaderboard,
  rosterWeeklyTotals,
};
