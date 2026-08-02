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

/** Wraps an async route handler so a rejected promise becomes a 500 instead of hanging the request. */
function ah(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

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

app.get(
  "/auth/callback",
  ah(async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect("/?error=missing_code");

    try {
      const token = await discordApi.exchangeCode(code);
      const user = await discordApi.getUser(token.access_token);
      const member = await discordApi.getGuildMember(user.id);

      if (!member) {
        return res.redirect("/?error=not_in_server");
      }

      await db.upsertUser({ discord_id: user.id, username: user.username, avatar: user.avatar });

      req.session.user = {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        roles: member.roles, // array of role ID strings, used for shift-type restrictions
        isAdmin: await discordApi.isAdminMember(member),
        canAddTime: await discordApi.canAddTimeMember(member),
      };

      res.redirect("/dashboard.html");
    } catch (err) {
      console.error(err);
      res.redirect("/?error=login_failed");
    }
  })
);

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

app.get(
  "/api/summary",
  requireAuth,
  ah(async (req, res) => {
    const discordId = req.session.user.id;
    const active = await db.getActiveShift(discordId);
    const activeType = active
      ? (await db.listShiftTypes({ activeOnly: false })).find((t) => t.id === active.shift_type_id)
      : null;
    const totals = await db.weeklyTotalsByType(discordId);
    const allTimeTotals = await db.allTimeTotalsByType(discordId);
    const quotas = await db.listQuotas();

    res.json({
      active: active ? { ...active, shift_type_name: activeType?.name } : null,
      weekStart: db.currentWeekStart(),
      totals,
      allTimeTotals,
      quotas,
    });
  })
);

app.get(
  "/api/history",
  requireAuth,
  ah(async (req, res) => {
    res.json(await db.getShiftHistory(req.session.user.id, 50));
  })
);

app.get(
  "/api/shifttypes",
  requireAuth,
  ah(async (req, res) => {
    res.json(await db.listShiftTypes());
  })
);

app.get(
  "/api/shifttypes/mine",
  requireAuth,
  ah(async (req, res) => {
    res.json(await db.listShiftTypesForRoles(req.session.user.roles || []));
  })
);

app.post(
  "/api/shifts/manual",
  requireCanAddTime,
  ah(async (req, res) => {
    const { shiftTypeId, date, hours } = req.body;

    const shiftType = (await db.listShiftTypes()).find((t) => t.id === Number(shiftTypeId));
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

    await db.addManualShift(req.session.user.id, shiftType.id, date, hoursNum);
    res.json({ ok: true });
  })
);

// ---- Live shift controls: same clock as /shift manage in Discord ----------
app.post(
  "/api/shift/start",
  requireAuth,
  ah(async (req, res) => {
    const discordId = req.session.user.id;
    if (await db.getActiveShift(discordId)) {
      return res.status(409).json({ error: "already_on_shift" });
    }

    const shiftType = (await db.listShiftTypes()).find((t) => t.id === Number(req.body.shiftTypeId));
    if (!shiftType) return res.status(400).json({ error: "invalid_shift_type" });

    if (shiftType.required_role_id && !(req.session.user.roles || []).includes(shiftType.required_role_id)) {
      return res.status(403).json({ error: "role_required" });
    }

    await db.clockOn(discordId, shiftType.id);
    res.json({ ok: true });
  })
);

app.post(
  "/api/shift/end",
  requireAuth,
  ah(async (req, res) => {
    const active = await db.getActiveShift(req.session.user.id);
    if (!active) return res.status(409).json({ error: "not_on_shift" });

    const duration = await db.clockOff(active.id);
    res.json({ ok: true, durationSeconds: duration });
  })
);

app.post(
  "/api/shift/break/start",
  requireAuth,
  ah(async (req, res) => {
    const active = await db.getActiveShift(req.session.user.id);
    if (!active) return res.status(409).json({ error: "not_on_shift" });
    if (active.break_start) return res.status(409).json({ error: "already_on_break" });

    await db.startBreak(active.id);
    res.json({ ok: true });
  })
);

app.post(
  "/api/shift/break/end",
  requireAuth,
  ah(async (req, res) => {
    const active = await db.getActiveShift(req.session.user.id);
    if (!active) return res.status(409).json({ error: "not_on_shift" });
    if (!active.break_start) return res.status(409).json({ error: "not_on_break" });

    await db.endBreak(active.id);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------
app.get(
  "/api/admin/roster",
  requireAdmin,
  ah(async (req, res) => {
    const weekStart = db.currentWeekStart();
    const roster = await db.rosterWeeklyTotals(weekStart);
    const overallQuota = (await db.listQuotas()).find((q) => q.shift_type_id === null);
    res.json({ weekStart, quotaHours: overallQuota?.hours_required ?? null, roster });
  })
);

app.get(
  "/api/admin/shifttypes",
  requireAdmin,
  ah(async (req, res) => {
    res.json(await db.listShiftTypes());
  })
);

app.post(
  "/api/admin/shifttypes",
  requireAdmin,
  ah(async (req, res) => {
    const { name, requiredRoleId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "name_required" });
    await db.addShiftType(name.trim(), requiredRoleId || null);
    res.json({ ok: true });
  })
);

app.delete(
  "/api/admin/shifttypes/:name",
  requireAdmin,
  ah(async (req, res) => {
    const result = await db.removeShiftType(req.params.name);
    if (result.changes === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  })
);

app.post(
  "/api/admin/shifttypes/:name/restrict",
  requireAdmin,
  ah(async (req, res) => {
    const result = await db.setShiftTypeRequiredRole(req.params.name, req.body.roleId || null);
    if (result.changes === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/roles",
  requireAdmin,
  ah(async (req, res) => {
    res.json(await discordApi.getGuildRoles());
  })
);

app.get(
  "/api/admin/permissions",
  requireAdmin,
  ah(async (req, res) => {
    res.json({
      admin: await db.listRolePermissions("admin"),
      add_time: await db.listRolePermissions("add_time"),
    });
  })
);

app.post(
  "/api/admin/permissions",
  requireAdmin,
  ah(async (req, res) => {
    const { roleId, type } = req.body;
    if (!roleId || !["admin", "add_time"].includes(type)) {
      return res.status(400).json({ error: "invalid_request" });
    }
    await db.addRolePermission(roleId, type);
    res.json({ ok: true });
  })
);

app.delete(
  "/api/admin/permissions",
  requireAdmin,
  ah(async (req, res) => {
    const { roleId, type } = req.body;
    if (!roleId || !["admin", "add_time"].includes(type)) {
      return res.status(400).json({ error: "invalid_request" });
    }
    await db.removeRolePermission(roleId, type);
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/quotas",
  requireAdmin,
  ah(async (req, res) => {
    res.json(await db.listQuotas());
  })
);

app.post(
  "/api/admin/quotas",
  requireAdmin,
  ah(async (req, res) => {
    const { shiftTypeId, hours } = req.body;
    if (typeof hours !== "number" || hours < 0) return res.status(400).json({ error: "invalid_hours" });
    await db.setQuota(shiftTypeId ?? null, hours);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Static site
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "..", "public")));

// Last-resort error handler for anything ah() caught (mainly DB errors).
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "internal_error" });
});

const port = process.env.PORT || 3000;
db.init()
  .then(() => {
    app.listen(port, () => {
      console.log(`Dashboard running at http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize the database:", err);
    process.exit(1);
  });
