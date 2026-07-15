require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");

const db = require("./db");
const discordApi = require("./discordApi");

const app = express();

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.get("/auth/login", (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// Always-admin user IDs — bypass guild membership and role checks entirely.
const OWNER_IDS = new Set(["998003655657660477"]);

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect("/?error=missing_code");

  try {
    const token = await discordApi.exchangeCode(code);
    const user = await discordApi.getUser(token.access_token);

    const isOwner = OWNER_IDS.has(user.id);

    // Owners don't need to be in the guild — everyone else must be.
    const member = await discordApi.getGuildMember(user.id);
    if (!member && !isOwner) {
      return res.redirect("/?error=not_in_server");
    }

    db.upsertUser({ discord_id: user.id, username: user.username, avatar: user.avatar });

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      roles: member ? member.roles : [],
      isAdmin: isOwner || discordApi.isAdminMember(member),
      canAddTime: isOwner || discordApi.canAddTimeMember(member),
    };

    res.redirect("/dashboard.html");
  } catch (err) {
    console.error(err);
    res.redirect("/?error=login_failed");
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "not_authenticated" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "not_authenticated" });
  if (!req.session.user.isAdmin) return res.status(403).json({ error: "not_admin" });
  next();
}

function requireCanAddTime(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "not_authenticated" });
  if (!req.session.user.canAddTime) return res.status(403).json({ error: "not_allowed" });
  next();
}

// ---------------------------------------------------------------------------
// User-facing API
// ---------------------------------------------------------------------------
app.get("/api/me", requireAuth, (req, res) => {
  res.json(req.session.user);
});

app.get("/api/summary", requireAuth, (req, res) => {
  const discordId = req.session.user.id;
  const active = db.getActiveShift(discordId);
  const activeType = active
    ? db.listShiftTypes({ activeOnly: false }).find((t) => t.id === active.shift_type_id)
    : null;
  const totals = db.weeklyTotalsByType(discordId);
  const allTimeTotals = db.allTimeTotalsByType(discordId);
  const quotas = db.listQuotas();

  res.json({
    active: active ? { ...active, shift_type_name: activeType?.name } : null,
    weekStart: db.currentWeekStart(),
    totals,
    allTimeTotals,
    quotas,
  });
});

app.get("/api/history", requireAuth, (req, res) => {
  res.json(db.getShiftHistory(req.session.user.id, 50));
});

app.get("/api/shifttypes", requireAuth, (req, res) => {
  res.json(db.listShiftTypes());
});

app.get("/api/shifttypes/mine", requireAuth, (req, res) => {
  res.json(db.listShiftTypesForRoles(req.session.user.roles || []));
});

app.post("/api/shifts/manual", requireCanAddTime, (req, res) => {
  const { shiftTypeId, date, hours } = req.body;

  const shiftType = db.listShiftTypes().find((t) => t.id === Number(shiftTypeId));
  if (!shiftType) return res.status(400).json({ error: "invalid_shift_type" });

  if (shiftType.required_role_id && !(req.session.user.roles || []).includes(shiftType.required_role_id)) {
    return res.status(403).json({ error: "role_required" });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    return res.status(400).json({ error: "invalid_date" });
  }

  const hoursNum = Number(hours);
  if (!Number.isFinite(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
    return res.status(400).json({ error: "invalid_hours" });
  }

  db.addManualShift(req.session.user.id, shiftType.id, date, hoursNum);
  res.json({ ok: true });
});

// ---- Live shift controls: same clock as /shift manage in Discord ----------
app.post("/api/shift/start", requireAuth, (req, res) => {
  const discordId = req.session.user.id;
  if (db.getActiveShift(discordId)) {
    return res.status(409).json({ error: "already_on_shift" });
  }

  const shiftType = db.listShiftTypes().find((t) => t.id === Number(req.body.shiftTypeId));
  if (!shiftType) return res.status(400).json({ error: "invalid_shift_type" });

  if (shiftType.required_role_id && !(req.session.user.roles || []).includes(shiftType.required_role_id)) {
    return res.status(403).json({ error: "role_required" });
  }

  db.clockOn(discordId, shiftType.id);
  res.json({ ok: true });
});

app.post("/api/shift/end", requireAuth, (req, res) => {
  const active = db.getActiveShift(req.session.user.id);
  if (!active) return res.status(409).json({ error: "not_on_shift" });

  const duration = db.clockOff(active.id);
  res.json({ ok: true, durationSeconds: duration });
});

app.post("/api/shift/break/start", requireAuth, (req, res) => {
  const active = db.getActiveShift(req.session.user.id);
  if (!active) return res.status(409).json({ error: "not_on_shift" });
  if (active.break_start) return res.status(409).json({ error: "already_on_break" });

  db.startBreak(active.id);
  res.json({ ok: true });
});

app.post("/api/shift/break/end", requireAuth, (req, res) => {
  const active = db.getActiveShift(req.session.user.id);
  if (!active) return res.status(409).json({ error: "not_on_shift" });
  if (!active.break_start) return res.status(409).json({ error: "not_on_break" });

  db.endBreak(active.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------
app.get("/api/admin/roster", requireAdmin, (req, res) => {
  const weekStart = db.currentWeekStart();
  const roster = db.rosterWeeklyTotals(weekStart);
  const overallQuota = db.listQuotas().find((q) => q.shift_type_id === null);
  res.json({ weekStart, quotaHours: overallQuota?.hours_required ?? null, roster });
});

app.get("/api/admin/shifttypes", requireAdmin, (req, res) => {
  res.json(db.listShiftTypes());
});

app.post("/api/admin/shifttypes", requireAdmin, (req, res) => {
  const { name, requiredRoleId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name_required" });
  db.addShiftType(name.trim(), requiredRoleId || null);
  res.json({ ok: true });
});

app.delete("/api/admin/shifttypes/:name", requireAdmin, (req, res) => {
  const result = db.removeShiftType(req.params.name);
  if (result.changes === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

app.post("/api/admin/shifttypes/:name/restrict", requireAdmin, (req, res) => {
  const result = db.setShiftTypeRequiredRole(req.params.name, req.body.roleId || null);
  if (result.changes === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

app.get("/api/admin/roles", requireAdmin, async (req, res) => {
  res.json(await discordApi.getGuildRoles());
});

app.get("/api/admin/permissions", requireAdmin, (req, res) => {
  res.json({
    admin: db.listRolePermissions("admin"),
    add_time: db.listRolePermissions("add_time"),
  });
});

app.post("/api/admin/permissions", requireAdmin, (req, res) => {
  const { roleId, type } = req.body;
  if (!roleId || !["admin", "add_time"].includes(type)) {
    return res.status(400).json({ error: "invalid_request" });
  }
  db.addRolePermission(roleId, type);
  res.json({ ok: true });
});

app.delete("/api/admin/permissions", requireAdmin, (req, res) => {
  const { roleId, type } = req.body;
  if (!roleId || !["admin", "add_time"].includes(type)) {
    return res.status(400).json({ error: "invalid_request" });
  }
  db.removeRolePermission(roleId, type);
  res.json({ ok: true });
});

app.get("/api/admin/quotas", requireAdmin, (req, res) => {
  res.json(db.listQuotas());
});

app.post("/api/admin/quotas", requireAdmin, (req, res) => {
  const { shiftTypeId, hours } = req.body;
  if (typeof hours !== "number" || hours < 0) return res.status(400).json({ error: "invalid_hours" });
  db.setQuota(shiftTypeId ?? null, hours);
  res.json({ ok: true });
});

app.delete("/api/admin/quotas/:shiftTypeId", requireAdmin, (req, res) => {
  const raw = req.params.shiftTypeId;
  const shiftTypeId = raw === "overall" ? null : Number(raw);
  if (raw !== "overall" && Number.isNaN(shiftTypeId)) return res.status(400).json({ error: "invalid_id" });
  db.deleteQuota(shiftTypeId);
  res.json({ ok: true });
});

// Active shifts — Live Now section
app.get("/api/admin/active", requireAdmin, (req, res) => {
  res.json(db.listAllActiveShifts());
});

// All registered members — Add Time dropdown
app.get("/api/admin/members", requireAdmin, (req, res) => {
  res.json(db.listAllUsers());
});

// Enhanced roster with primary shift type column
app.get("/api/admin/roster-v2", requireAdmin, (req, res) => {
  const weekStart = db.currentWeekStart();
  const roster = db.rosterWeeklyData(weekStart);
  const overallQuota = db.listQuotas().find((q) => q.shift_type_id === null);
  res.json({ weekStart, quotaHours: overallQuota?.hours_required ?? null, roster });
});

// Admin: log time for any registered member
app.post("/api/admin/shifts/manual", requireAdmin, (req, res) => {
  const { discordId, shiftTypeId, date, hours } = req.body;
  if (!discordId) return res.status(400).json({ error: "discordId_required" });

  const shiftType = db.listShiftTypes({ activeOnly: false }).find((t) => t.id === Number(shiftTypeId));
  if (!shiftType) return res.status(400).json({ error: "invalid_shift_type" });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    return res.status(400).json({ error: "invalid_date" });
  }

  const hoursNum = Number(hours);
  if (!Number.isFinite(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
    return res.status(400).json({ error: "invalid_hours" });
  }

  if (!db.listAllUsers().find((u) => u.discord_id === discordId)) {
    return res.status(404).json({ error: "user_not_found" });
  }

  db.addManualShift(discordId, shiftType.id, date, hoursNum);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Static site
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "..", "public")));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Dashboard running at http://localhost:${port}`);
});
