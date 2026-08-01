const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "..", "data.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema — multi-tenant: every community (one Discord server linked to
// Shiftus) owns its own shift types, quotas, shifts, and role permissions.
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS communities (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id              TEXT NOT NULL UNIQUE,
    name                  TEXT NOT NULL,
    icon                  TEXT,
    owner_discord_id      TEXT NOT NULL,
    invite_slug           TEXT NOT NULL UNIQUE,
    subscription_status   TEXT NOT NULL DEFAULT 'inactive', -- active | past_due | canceled | inactive
    week_start_day        INTEGER NOT NULL DEFAULT 1,        -- 0=Sunday ... 6=Saturday
    week_start_hour       INTEGER NOT NULL DEFAULT 0,        -- 0-23, UTC
    created_at            INTEGER NOT NULL
  );

  -- Explicit membership, recorded when someone creates or joins a community.
  -- (Discord itself is the source of truth for *current* guild membership —
  -- this table is "who's used Shiftus here", used to populate dropdowns and
  -- the dashboard's community switcher without re-querying Discord for it.)
  CREATE TABLE IF NOT EXISTS community_members (
    community_id  INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    discord_id    TEXT NOT NULL,
    joined_at     INTEGER NOT NULL,
    PRIMARY KEY (community_id, discord_id)
  );

  -- Global cache of Discord profile info (username/avatar aren't per-community).
  CREATE TABLE IF NOT EXISTS users (
    discord_id  TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    avatar      TEXT,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shift_types (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    community_id       INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    active             INTEGER NOT NULL DEFAULT 1,
    required_role_id   TEXT,
    UNIQUE (community_id, name)
  );

  -- shift_type_id = NULL means "overall" quota across every shift type combined.
  CREATE TABLE IF NOT EXISTS quotas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    community_id    INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    shift_type_id   INTEGER REFERENCES shift_types(id) ON DELETE CASCADE,
    hours_required  REAL NOT NULL
  );
  -- Expression index so "overall" (NULL shift_type_id) is unique per community too —
  -- SQLite treats plain UNIQUE(col) as allowing many NULLs, so COALESCE it to 0.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_quotas_unique
    ON quotas (community_id, COALESCE(shift_type_id, 0));

  CREATE TABLE IF NOT EXISTS shifts (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    community_id          INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    discord_id            TEXT NOT NULL,
    shift_type_id         INTEGER NOT NULL REFERENCES shift_types(id),
    start_time            INTEGER NOT NULL,
    end_time              INTEGER,
    duration_seconds      INTEGER,
    source                TEXT NOT NULL DEFAULT 'clock', -- 'clock' or 'manual'
    break_start           INTEGER,
    total_break_seconds   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_shifts_community_user ON shifts(community_id, discord_id);

  -- Extra admin/add-time roles granted from within the app, per community, on
  -- top of whatever's in the .env file (a global fallback across every
  -- community, mainly useful for the platform operator).
  CREATE TABLE IF NOT EXISTS role_permissions (
    community_id  INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    role_id       TEXT NOT NULL,
    permission    TEXT NOT NULL, -- 'admin' or 'add_time'
    PRIMARY KEY (community_id, role_id, permission)
  );
`);

// ---------------------------------------------------------------------------
// Auto-migration — on startup, add any columns/tables introduced by a newer
// version of Shiftus. Existing tables/columns are left untouched.
// ---------------------------------------------------------------------------
function ensureColumn(table, column, ddl) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

ensureColumn("communities", "stripe_customer_id", "stripe_customer_id TEXT");
ensureColumn("communities", "stripe_subscription_id", "stripe_subscription_id TEXT");
ensureColumn("communities", "on_shift_role_id", "on_shift_role_id TEXT");
ensureColumn("communities", "supervisor_check_role_id", "supervisor_check_role_id TEXT");
ensureColumn("communities", "active_supervisor_role_id", "active_supervisor_role_id TEXT");
ensureColumn("communities", "loa_role_id", "loa_role_id TEXT");

db.exec(`
  CREATE TABLE IF NOT EXISTS loa_requests (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    community_id       INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    discord_id         TEXT NOT NULL,
    reason             TEXT NOT NULL,
    duration_days      INTEGER NOT NULL,
    status             TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied
    submitted_at       INTEGER NOT NULL,
    reviewed_at        INTEGER,
    reviewer_id        TEXT,
    original_nickname  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_loa_community ON loa_requests(community_id, status);
`);

// (Later phases add columns/tables here, e.g. reminder settings — via
// ensureColumn(), never by editing the CREATE TABLE statements above once
// real data may exist.)

// ---------------------------------------------------------------------------
// Communities
// ---------------------------------------------------------------------------
function generateInviteSlug() {
  return crypto.randomBytes(6).toString("base64url");
}

function createCommunity({ guildId, name, icon, ownerDiscordId, subscriptionStatus = "inactive" }) {
  const info = db
    .prepare(
      `INSERT INTO communities (guild_id, name, icon, owner_discord_id, invite_slug, subscription_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, name, icon, ownerDiscordId, generateInviteSlug(), subscriptionStatus, Math.floor(Date.now() / 1000));
  return getCommunityById(info.lastInsertRowid);
}

function getCommunityById(id) {
  return db.prepare("SELECT * FROM communities WHERE id = ?").get(id);
}

function getCommunityByGuildId(guildId) {
  return db.prepare("SELECT * FROM communities WHERE guild_id = ?").get(guildId);
}

function getCommunityBySlug(slug) {
  return db.prepare("SELECT * FROM communities WHERE invite_slug = ?").get(slug);
}

function updateCommunityGuildInfo(guildId, { name, icon }) {
  db.prepare("UPDATE communities SET name = ?, icon = ? WHERE guild_id = ?").run(name, icon, guildId);
}

function updateCommunitySchedule(communityId, { weekStartDay, weekStartHour }) {
  db.prepare("UPDATE communities SET week_start_day = ?, week_start_hour = ? WHERE id = ?").run(
    weekStartDay,
    weekStartHour,
    communityId
  );
}

function updateCommunityRoles(communityId, { onShiftRoleId, supervisorCheckRoleId, activeSupervisorRoleId, loaRoleId }) {
  db.prepare(
    `UPDATE communities SET
       on_shift_role_id = ?,
       supervisor_check_role_id = ?,
       active_supervisor_role_id = ?,
       loa_role_id = ?
     WHERE id = ?`
  ).run(onShiftRoleId, supervisorCheckRoleId, activeSupervisorRoleId, loaRoleId, communityId);
}

function setSubscriptionStatus(communityId, status) {
  db.prepare("UPDATE communities SET subscription_status = ? WHERE id = ?").run(status, communityId);
}

function setStripeIds(communityId, { customerId, subscriptionId }) {
  db.prepare("UPDATE communities SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?").run(
    customerId,
    subscriptionId,
    communityId
  );
}

function getCommunityByStripeCustomerId(customerId) {
  return db.prepare("SELECT * FROM communities WHERE stripe_customer_id = ?").get(customerId);
}

function addCommunityMember(communityId, discordId) {
  db.prepare(
    `INSERT OR IGNORE INTO community_members (community_id, discord_id, joined_at) VALUES (?, ?, ?)`
  ).run(communityId, discordId, Math.floor(Date.now() / 1000));
}

function isCommunityMember(communityId, discordId) {
  return !!db
    .prepare("SELECT 1 FROM community_members WHERE community_id = ? AND discord_id = ?")
    .get(communityId, discordId);
}

/** Every community a user has joined or created, most recently joined first. */
function listCommunitiesForMember(discordId) {
  return db
    .prepare(
      `SELECT c.* FROM communities c
       JOIN community_members cm ON cm.community_id = c.id
       WHERE cm.discord_id = ?
       ORDER BY cm.joined_at DESC`
    )
    .all(discordId);
}

// ---------------------------------------------------------------------------
// Week helpers — per-community week boundary
// ---------------------------------------------------------------------------

/** Unix seconds for the start of the current quota week, in UTC. */
function currentWeekStart(community, nowMs = Date.now()) {
  const weekStartDay = community?.week_start_day ?? 1;
  const weekStartHour = community?.week_start_hour ?? 0;

  const now = new Date(nowMs);
  const day = now.getUTCDay(); // 0-6, Sunday=0
  let diff = day - weekStartDay;
  if (diff < 0) diff += 7;
  if (diff === 0 && now.getUTCHours() < weekStartHour) diff = 7;

  const start = new Date(now);
  start.setUTCHours(weekStartHour, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - diff);
  return Math.floor(start.getTime() / 1000);
}

// ---------------------------------------------------------------------------
// Users (global Discord profile cache)
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
function listShiftTypes(communityId, { activeOnly = true } = {}) {
  return db
    .prepare(
      `SELECT * FROM shift_types WHERE community_id = ? ${activeOnly ? "AND active = 1" : ""} ORDER BY name`
    )
    .all(communityId);
}

function getShiftTypeByName(communityId, name) {
  return db
    .prepare(
      "SELECT * FROM shift_types WHERE community_id = ? AND lower(name) = lower(?) AND active = 1"
    )
    .get(communityId, name);
}

function addShiftType(communityId, name, requiredRoleId = null) {
  return db
    .prepare(
      `INSERT INTO shift_types (community_id, name, active, required_role_id) VALUES (?, ?, 1, ?)
       ON CONFLICT(community_id, name) DO UPDATE SET active = 1, required_role_id = excluded.required_role_id`
    )
    .run(communityId, name, requiredRoleId);
}

function removeShiftType(communityId, name) {
  return db
    .prepare("UPDATE shift_types SET active = 0 WHERE community_id = ? AND lower(name) = lower(?)")
    .run(communityId, name);
}

/** Restrict (or, with roleId=null, un-restrict) an existing shift type to one role. */
function setShiftTypeRequiredRole(communityId, name, roleId) {
  return db
    .prepare("UPDATE shift_types SET required_role_id = ? WHERE community_id = ? AND lower(name) = lower(?)")
    .run(roleId, communityId, name);
}

/** Shift types a member (given their Discord role IDs) is allowed to start. */
function listShiftTypesForRoles(communityId, roleIds) {
  return listShiftTypes(communityId).filter(
    (t) => !t.required_role_id || roleIds.includes(t.required_role_id)
  );
}

// ---------------------------------------------------------------------------
// Role permissions (admin / add_time), on top of whatever's in .env
// ---------------------------------------------------------------------------
function addRolePermission(communityId, roleId, permission) {
  return db
    .prepare("INSERT OR IGNORE INTO role_permissions (community_id, role_id, permission) VALUES (?, ?, ?)")
    .run(communityId, roleId, permission);
}

function removeRolePermission(communityId, roleId, permission) {
  return db
    .prepare("DELETE FROM role_permissions WHERE community_id = ? AND role_id = ? AND permission = ?")
    .run(communityId, roleId, permission);
}

function listRolePermissions(communityId, permission) {
  return db
    .prepare("SELECT role_id FROM role_permissions WHERE community_id = ? AND permission = ?")
    .all(communityId, permission)
    .map((r) => r.role_id);
}

/** Role IDs that grant a permission in a community: whatever's in .env (global
 * fallback), plus whatever's been added in-app for that community. */
function effectiveRoleIds(communityId, permission) {
  const envVar = permission === "admin" ? "ADMIN_ROLE_IDS" : "ADD_TIME_ROLE_IDS";
  const fromEnv = (process.env[envVar] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...fromEnv, ...listRolePermissions(communityId, permission)]);
}

// ---------------------------------------------------------------------------
// Quotas
// ---------------------------------------------------------------------------
function setQuota(communityId, shiftTypeId, hours) {
  db.prepare(
    `INSERT INTO quotas (community_id, shift_type_id, hours_required) VALUES (?, ?, ?)
     ON CONFLICT(community_id, COALESCE(shift_type_id, 0)) DO UPDATE SET hours_required = excluded.hours_required`
  ).run(communityId, shiftTypeId, hours);
}

function listQuotas(communityId) {
  return db
    .prepare(
      `SELECT q.shift_type_id, q.hours_required, st.name as shift_type_name
       FROM quotas q
       LEFT JOIN shift_types st ON st.id = q.shift_type_id
       WHERE q.community_id = ?
       ORDER BY st.name IS NULL DESC, st.name`
    )
    .all(communityId);
}

function deleteQuota(communityId, shiftTypeId) {
  db.prepare(`DELETE FROM quotas WHERE community_id = ? AND shift_type_id IS ?`).run(communityId, shiftTypeId);
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------
function getShiftById(id) {
  return db
    .prepare(
      `SELECT s.*, st.name as shift_type_name, u.username, u.avatar FROM shifts s
       JOIN shift_types st ON st.id = s.shift_type_id
       LEFT JOIN users u ON u.discord_id = s.discord_id
       WHERE s.id = ?`
    )
    .get(id);
}

function getActiveShift(communityId, discordId) {
  return db
    .prepare(
      "SELECT * FROM shifts WHERE community_id = ? AND discord_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1"
    )
    .get(communityId, discordId);
}

function clockOn(communityId, discordId, shiftTypeId, startTime = Math.floor(Date.now() / 1000)) {
  return db
    .prepare(
      "INSERT INTO shifts (community_id, discord_id, shift_type_id, start_time) VALUES (?, ?, ?, ?)"
    )
    .run(communityId, discordId, shiftTypeId, startTime);
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
 * anchored at noon UTC that day so it always lands in the correct week bucket.
 */
function addManualShift(communityId, discordId, shiftTypeId, dateStr, hours) {
  const startTime = Math.floor(new Date(`${dateStr}T12:00:00Z`).getTime() / 1000);
  const durationSeconds = Math.round(hours * 3600);
  const endTime = startTime + durationSeconds;
  return db
    .prepare(
      `INSERT INTO shifts (community_id, discord_id, shift_type_id, start_time, end_time, duration_seconds, source)
       VALUES (?, ?, ?, ?, ?, ?, 'manual')`
    )
    .run(communityId, discordId, shiftTypeId, startTime, endTime, durationSeconds);
}

/**
 * Remove up to `hours` of logged time from a member's most recent completed
 * shifts (newest first), stopping once the requested amount is consumed.
 * Shifts are trimmed (duration reduced) or deleted entirely as needed.
 * Returns the number of hours actually removed.
 */
function removeRecentTime(communityId, discordId, hours) {
  let remainingSeconds = Math.round(hours * 3600);
  let removedSeconds = 0;

  const shifts = db
    .prepare(
      `SELECT * FROM shifts WHERE community_id = ? AND discord_id = ? AND end_time IS NOT NULL
       ORDER BY start_time DESC`
    )
    .all(communityId, discordId);

  for (const shift of shifts) {
    if (remainingSeconds <= 0) break;
    const shiftSeconds = shift.duration_seconds || 0;

    if (shiftSeconds <= remainingSeconds) {
      db.prepare("DELETE FROM shifts WHERE id = ?").run(shift.id);
      removedSeconds += shiftSeconds;
      remainingSeconds -= shiftSeconds;
    } else {
      const newDuration = shiftSeconds - remainingSeconds;
      db.prepare("UPDATE shifts SET duration_seconds = ?, end_time = start_time + ? + total_break_seconds WHERE id = ?").run(
        newDuration,
        newDuration,
        shift.id
      );
      removedSeconds += remainingSeconds;
      remainingSeconds = 0;
    }
  }

  return removedSeconds / 3600;
}

function getShiftHistory(communityId, discordId, limit = 50) {
  return db
    .prepare(
      `SELECT s.*, st.name as shift_type_name
       FROM shifts s JOIN shift_types st ON st.id = s.shift_type_id
       WHERE s.community_id = ? AND s.discord_id = ? AND s.end_time IS NOT NULL
       ORDER BY s.start_time DESC LIMIT ?`
    )
    .all(communityId, discordId, limit);
}

/** Total completed seconds this week, broken down by shift type, for one user. */
function weeklyTotalsByType(communityId, discordId, weekStart) {
  return db
    .prepare(
      `SELECT st.id as shift_type_id, st.name as shift_type_name,
              COALESCE(SUM(s.duration_seconds), 0) as total_seconds
       FROM shift_types st
       LEFT JOIN shifts s ON s.shift_type_id = st.id
         AND s.discord_id = ? AND s.end_time IS NOT NULL AND s.start_time >= ?
       WHERE st.community_id = ? AND st.active = 1
       GROUP BY st.id
       ORDER BY st.name`
    )
    .all(discordId, weekStart, communityId);
}

/** Total completed seconds of all time, broken down by shift type, for one user. */
function allTimeTotalsByType(communityId, discordId) {
  return db
    .prepare(
      `SELECT st.id as shift_type_id, st.name as shift_type_name,
              COALESCE(SUM(s.duration_seconds), 0) as total_seconds
       FROM shift_types st
       LEFT JOIN shifts s ON s.shift_type_id = st.id
         AND s.discord_id = ? AND s.end_time IS NOT NULL
       WHERE st.community_id = ? AND st.active = 1
       GROUP BY st.id
       ORDER BY st.name`
    )
    .all(discordId, communityId);
}

/**
 * Weekly leaderboard for one shift type (or every type combined, if
 * shiftTypeId is null), highest hours first. Only includes people with time
 * logged this week.
 */
function weeklyLeaderboard(communityId, shiftTypeId, weekStart) {
  if (shiftTypeId == null) {
    return db
      .prepare(
        `SELECT u.discord_id, u.username, u.avatar,
                SUM(s.duration_seconds) as total_seconds
         FROM shifts s JOIN users u ON u.discord_id = s.discord_id
         WHERE s.community_id = ? AND s.end_time IS NOT NULL AND s.start_time >= ?
         GROUP BY u.discord_id
         HAVING total_seconds > 0
         ORDER BY total_seconds DESC
         LIMIT 15`
      )
      .all(communityId, weekStart);
  }
  return db
    .prepare(
      `SELECT u.discord_id, u.username, u.avatar,
              SUM(s.duration_seconds) as total_seconds
       FROM shifts s JOIN users u ON u.discord_id = s.discord_id
       WHERE s.community_id = ? AND s.end_time IS NOT NULL AND s.start_time >= ? AND s.shift_type_id = ?
       GROUP BY u.discord_id
       HAVING total_seconds > 0
       ORDER BY total_seconds DESC
       LIMIT 15`
    )
    .all(communityId, weekStart, shiftTypeId);
}

/** All currently active (clocked-on) shifts in a community, with user + shift-type info. */
function listAllActiveShifts(communityId) {
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
       WHERE s.community_id = ? AND s.end_time IS NULL
       ORDER BY s.start_time ASC`
    )
    .all(communityId);
}

/** Every member of a community, alphabetical — used to populate the Add Time dropdown. */
function listAllUsers(communityId) {
  return db
    .prepare(
      `SELECT u.discord_id, u.username, u.avatar
       FROM community_members cm
       JOIN users u ON u.discord_id = cm.discord_id
       WHERE cm.community_id = ?
       ORDER BY u.username COLLATE NOCASE ASC`
    )
    .all(communityId);
}

/**
 * Enhanced weekly roster: total seconds this week + the shift type they've
 * logged the most hours under (used as the "Role" column in the admin UI).
 */
function rosterWeeklyData(communityId, weekStart) {
  return db
    .prepare(
      `SELECT
         u.discord_id, u.username, u.avatar,
         COALESCE(SUM(CASE WHEN s.end_time IS NOT NULL AND s.start_time >= ?
                           THEN s.duration_seconds ELSE 0 END), 0) AS total_seconds,
         (SELECT st2.name
          FROM shifts s2
          JOIN shift_types st2 ON st2.id = s2.shift_type_id
          WHERE s2.community_id = cm.community_id
            AND s2.discord_id = u.discord_id
            AND s2.end_time IS NOT NULL
            AND s2.start_time >= ?
          GROUP BY s2.shift_type_id
          ORDER BY SUM(s2.duration_seconds) DESC
          LIMIT 1) AS primary_type
       FROM community_members cm
       JOIN users u ON u.discord_id = cm.discord_id
       LEFT JOIN shifts s ON s.discord_id = u.discord_id AND s.community_id = cm.community_id
       WHERE cm.community_id = ?
       GROUP BY u.discord_id
       ORDER BY total_seconds DESC`
    )
    .all(weekStart, weekStart, communityId);
}

// ---------------------------------------------------------------------------
// LOA (Leave of Absence) requests
// ---------------------------------------------------------------------------
function createLoaRequest(communityId, discordId, reason, durationDays) {
  return db
    .prepare(
      `INSERT INTO loa_requests (community_id, discord_id, reason, duration_days, status, submitted_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`
    )
    .run(communityId, discordId, reason, durationDays, Math.floor(Date.now() / 1000));
}

function getLoaRequest(id) {
  return db.prepare("SELECT * FROM loa_requests WHERE id = ?").get(id);
}

function listPendingLoaRequests(communityId) {
  return db
    .prepare("SELECT * FROM loa_requests WHERE community_id = ? AND status = 'pending' ORDER BY submitted_at ASC")
    .all(communityId);
}

function listLoaHistory(communityId, limit = 50) {
  return db
    .prepare(
      `SELECT * FROM loa_requests WHERE community_id = ? AND status != 'pending'
       ORDER BY reviewed_at DESC LIMIT ?`
    )
    .all(communityId, limit);
}

/** Marks an LOA request reviewed, optionally recording the nickname it should be restored to later. */
function reviewLoaRequest(id, status, reviewerId, originalNickname) {
  db.prepare(
    `UPDATE loa_requests SET status = ?, reviewer_id = ?, reviewed_at = ?, original_nickname = ?
     WHERE id = ?`
  ).run(status, reviewerId, Math.floor(Date.now() / 1000), originalNickname ?? null, id);
}

module.exports = {
  db,
  ensureColumn,
  currentWeekStart,
  // communities
  createCommunity,
  getCommunityById,
  getCommunityByGuildId,
  getCommunityBySlug,
  updateCommunityGuildInfo,
  updateCommunitySchedule,
  updateCommunityRoles,
  setSubscriptionStatus,
  setStripeIds,
  getCommunityByStripeCustomerId,
  addCommunityMember,
  isCommunityMember,
  listCommunitiesForMember,
  // users
  upsertUser,
  // shift types
  listShiftTypes,
  getShiftTypeByName,
  addShiftType,
  removeShiftType,
  setShiftTypeRequiredRole,
  listShiftTypesForRoles,
  // permissions
  addRolePermission,
  removeRolePermission,
  listRolePermissions,
  effectiveRoleIds,
  // quotas
  setQuota,
  listQuotas,
  deleteQuota,
  // shifts
  getShiftById,
  getActiveShift,
  clockOn,
  clockOff,
  startBreak,
  endBreak,
  addManualShift,
  removeRecentTime,
  getShiftHistory,
  listAllActiveShifts,
  listAllUsers,
  rosterWeeklyData,
  weeklyTotalsByType,
  allTimeTotalsByType,
  weeklyLeaderboard,
  // LOA
  createLoaRequest,
  getLoaRequest,
  listPendingLoaRequests,
  listLoaHistory,
  reviewLoaRequest,
};
