require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const SqliteSessionStore = require("./sessionStore");

const db = require("./db");
const discordApi = require("./discordApi");
const stripeService = require("./stripe");

const app = express();

// Stripe needs the raw, untouched request body to verify webhook
// signatures, so this route is registered (with its own raw-body parser)
// before the global express.json() middleware below applies to everything else.
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    event = stripeService.constructEvent(req.body, req.headers["stripe-signature"]);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await stripeService.handleWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error("[stripe webhook] handler failed:", err);
    res.status(500).json({ error: "webhook_handler_failed" });
  }
});

app.use(express.json());
app.use(
  session({
    store: new SqliteSessionStore(),
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

// ---------------------------------------------------------------------------
// Auth — Discord OAuth2. Requests "guilds" too (not just "identify") so we
// know every Discord server the person belongs to, for the community
// switcher and for deciding which servers they're eligible to link.
// ---------------------------------------------------------------------------
app.get("/auth/login", (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds",
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

function isPlatformOwner(discordId) {
  return !!process.env.PLATFORM_OWNER_DISCORD_ID && discordId === process.env.PLATFORM_OWNER_DISCORD_ID;
}

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect("/?error=missing_code");

  try {
    const token = await discordApi.exchangeCode(code);
    const user = await discordApi.getUser(token.access_token);
    const guilds = await discordApi.getUserGuilds(token.access_token);

    db.upsertUser({ discord_id: user.id, username: user.username, avatar: user.avatar });

    req.session.user = { id: user.id, username: user.username, avatar: user.avatar };
    // Cache the guild list for the community switcher/create flow — small
    // fields only, refreshed on every login.
    req.session.guilds = guilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      owner: g.owner,
      permissions: g.permissions,
    }));

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

/**
 * Loads the :id community, confirms the caller has joined it (via
 * community_members) and is still actually a member of its Discord guild,
 * and computes fresh admin/add-time status for this one request — nothing
 * about permissions is cached in the session, so a role change in Discord
 * takes effect on the very next request.
 */
async function loadCommunityContext(req, res, next) {
  const community = db.getCommunityById(Number(req.params.id));
  if (!community) return res.status(404).json({ error: "community_not_found" });

  const owner = isPlatformOwner(req.session.user.id);
  const member = await discordApi.getGuildMember(community.guild_id, req.session.user.id);

  if (!member && !owner) return res.status(403).json({ error: "not_a_guild_member" });
  if (!db.isCommunityMember(community.id, req.session.user.id) && !owner) {
    return res.status(403).json({ error: "not_joined" });
  }
  if (owner && !db.isCommunityMember(community.id, req.session.user.id)) {
    db.addCommunityMember(community.id, req.session.user.id);
  }

  // The Discord server owner is always admin here too (checked live — via
  // guild info, not the member object, since the REST "get member" endpoint
  // doesn't expose a computed permissions bitfield the way the OAuth guild
  // list or gateway payloads do), so whoever links a server can immediately
  // grant proper admin roles from the panel instead of being locked out.
  let isServerOwner = false;
  if (member) {
    const guild = await discordApi.getGuild(community.guild_id);
    isServerOwner = guild?.owner_id === req.session.user.id;
  }

  req.community = community;
  req.memberRoles = member ? member.roles : [];
  req.isAdmin = owner || isServerOwner || (!!member && discordApi.isAdminMember(community.id, member));
  req.canAddTime = owner || (!!member && discordApi.canAddTimeMember(community.id, member));
  next();
}

function requireCommunityAdmin(req, res, next) {
  if (!req.isAdmin) return res.status(403).json({ error: "not_admin" });
  next();
}

function requireCommunityCanAddTime(req, res, next) {
  if (!req.canAddTime) return res.status(403).json({ error: "not_allowed" });
  next();
}

/** Gates actual shift-logging actions — not configuration — behind a paid plan. */
function requireActiveSubscription(req, res, next) {
  // Billing isn't configured (e.g. local development) — don't enforce it.
  if (!process.env.STRIPE_SECRET_KEY) return next();
  if (req.community.subscription_status !== "active") {
    return res.status(402).json({ error: "subscription_required" });
  }
  next();
}

const communityRouter = express.Router({ mergeParams: true });
communityRouter.use(requireAuth, loadCommunityContext);

// ---------------------------------------------------------------------------
// Platform-level API
// ---------------------------------------------------------------------------
app.get("/api/me", requireAuth, (req, res) => {
  res.json(req.session.user);
});

app.get("/api/communities", requireAuth, (req, res) => {
  const communities = db.listCommunitiesForMember(req.session.user.id).map((c) => ({
    id: c.id,
    guildId: c.guild_id,
    name: c.name,
    icon: c.icon,
    subscriptionStatus: c.subscription_status,
    isOwner: c.owner_discord_id === req.session.user.id,
  }));
  res.json(communities);
});

/** Guilds the logged-in user can create a Shiftus community from (owner or Manage Server). */
app.get("/api/eligible-guilds", requireAuth, (req, res) => {
  const guilds = (req.session.guilds || []).filter(discordApi.canManageGuild);
  res.json(
    guilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      alreadyLinked: !!db.getCommunityByGuildId(g.id),
    }))
  );
});

app.post("/api/communities", requireAuth, async (req, res) => {
  const { guildId } = req.body;
  const guild = (req.session.guilds || []).find((g) => g.id === guildId);
  if (!guild || !discordApi.canManageGuild(guild)) {
    return res.status(403).json({ error: "not_eligible" });
  }
  if (db.getCommunityByGuildId(guildId)) {
    return res.status(409).json({ error: "already_linked" });
  }

  const community = db.createCommunity({
    guildId,
    name: guild.name,
    icon: guild.icon,
    ownerDiscordId: req.session.user.id,
    subscriptionStatus: isPlatformOwner(req.session.user.id) ? "active" : "inactive",
  });
  db.addCommunityMember(community.id, req.session.user.id);

  const deployed = await discordApi.deployCommandsToGuild(guildId);

  res.json({
    id: community.id,
    guildId: community.guild_id,
    name: community.name,
    icon: community.icon,
    inviteSlug: community.invite_slug,
    subscriptionStatus: community.subscription_status,
    commandsDeployed: deployed,
  });
});

app.post("/api/communities/join", requireAuth, async (req, res) => {
  const { slug } = req.body;
  const community = db.getCommunityBySlug((slug || "").trim());
  if (!community) return res.status(404).json({ error: "invalid_slug" });

  const member = await discordApi.getGuildMember(community.guild_id, req.session.user.id);
  if (!member) return res.status(403).json({ error: "not_a_guild_member" });

  db.addCommunityMember(community.id, req.session.user.id);
  res.json({ id: community.id, name: community.name });
});

// ---------------------------------------------------------------------------
// Community-scoped API
// ---------------------------------------------------------------------------
communityRouter.get("/", (req, res) => {
  res.json({
    id: req.community.id,
    guildId: req.community.guild_id,
    name: req.community.name,
    icon: req.community.icon,
    subscriptionStatus: req.community.subscription_status,
    inviteSlug: req.community.invite_slug,
    isAdmin: req.isAdmin,
    canAddTime: req.canAddTime,
  });
});

communityRouter.get("/summary", (req, res) => {
  const discordId = req.session.user.id;
  const active = db.getActiveShift(req.community.id, discordId);
  const activeType = active
    ? db.listShiftTypes(req.community.id, { activeOnly: false }).find((t) => t.id === active.shift_type_id)
    : null;
  const weekStart = db.currentWeekStart(req.community);
  const totals = db.weeklyTotalsByType(req.community.id, discordId, weekStart);
  const allTimeTotals = db.allTimeTotalsByType(req.community.id, discordId);
  const quotas = db.listQuotas(req.community.id);

  res.json({
    active: active ? { ...active, shift_type_name: activeType?.name } : null,
    weekStart,
    totals,
    allTimeTotals,
    quotas,
  });
});

communityRouter.get("/history", (req, res) => {
  res.json(db.getShiftHistory(req.community.id, req.session.user.id, 50));
});

communityRouter.get("/shifttypes", (req, res) => {
  res.json(db.listShiftTypes(req.community.id));
});

communityRouter.get("/shifttypes/mine", (req, res) => {
  res.json(db.listShiftTypesForRoles(req.community.id, req.memberRoles));
});

communityRouter.post("/shifts/manual", requireCommunityCanAddTime, requireActiveSubscription, (req, res) => {
  const { shiftTypeId, date, hours } = req.body;

  const shiftType = db.listShiftTypes(req.community.id).find((t) => t.id === Number(shiftTypeId));
  if (!shiftType) return res.status(400).json({ error: "invalid_shift_type" });

  if (shiftType.required_role_id && !req.memberRoles.includes(shiftType.required_role_id)) {
    return res.status(403).json({ error: "role_required" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return res.status(400).json({ error: "invalid_date" });

  const hoursNum = Number(hours);
  if (!Number.isFinite(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
    return res.status(400).json({ error: "invalid_hours" });
  }

  db.addManualShift(req.community.id, req.session.user.id, shiftType.id, date, hoursNum);
  res.json({ ok: true });
});

// ---- Live shift controls: same clock as the /shift slash command --------
communityRouter.post("/shift/start", requireActiveSubscription, (req, res) => {
  const discordId = req.session.user.id;
  if (db.getActiveShift(req.community.id, discordId)) {
    return res.status(409).json({ error: "already_on_shift" });
  }

  const shiftType = db.listShiftTypes(req.community.id).find((t) => t.id === Number(req.body.shiftTypeId));
  if (!shiftType) return res.status(400).json({ error: "invalid_shift_type" });

  if (shiftType.required_role_id && !req.memberRoles.includes(shiftType.required_role_id)) {
    return res.status(403).json({ error: "role_required" });
  }

  db.clockOn(req.community.id, discordId, shiftType.id);
  res.json({ ok: true });
});

communityRouter.post("/shift/end", (req, res) => {
  const active = db.getActiveShift(req.community.id, req.session.user.id);
  if (!active) return res.status(409).json({ error: "not_on_shift" });

  const duration = db.clockOff(active.id);
  res.json({ ok: true, durationSeconds: duration });
});

communityRouter.post("/shift/break/start", (req, res) => {
  const active = db.getActiveShift(req.community.id, req.session.user.id);
  if (!active) return res.status(409).json({ error: "not_on_shift" });
  if (active.break_start) return res.status(409).json({ error: "already_on_break" });

  db.startBreak(active.id);
  res.json({ ok: true });
});

communityRouter.post("/shift/break/end", (req, res) => {
  const active = db.getActiveShift(req.community.id, req.session.user.id);
  if (!active) return res.status(409).json({ error: "not_on_shift" });
  if (!active.break_start) return res.status(409).json({ error: "not_on_break" });

  db.endBreak(active.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Community-scoped admin API
// ---------------------------------------------------------------------------
communityRouter.get("/admin/roster", requireCommunityAdmin, (req, res) => {
  const weekStart = db.currentWeekStart(req.community);
  const roster = db.rosterWeeklyData(req.community.id, weekStart);
  const overallQuota = db.listQuotas(req.community.id).find((q) => q.shift_type_id === null);
  res.json({ weekStart, quotaHours: overallQuota?.hours_required ?? null, roster });
});

communityRouter.get("/admin/shifttypes", requireCommunityAdmin, (req, res) => {
  res.json(db.listShiftTypes(req.community.id, { activeOnly: false }));
});

communityRouter.post("/admin/shifttypes", requireCommunityAdmin, (req, res) => {
  const { name, requiredRoleId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name_required" });
  db.addShiftType(req.community.id, name.trim(), requiredRoleId || null);
  res.json({ ok: true });
});

communityRouter.delete("/admin/shifttypes/:name", requireCommunityAdmin, (req, res) => {
  const result = db.removeShiftType(req.community.id, req.params.name);
  if (result.changes === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

communityRouter.post("/admin/shifttypes/:name/restrict", requireCommunityAdmin, (req, res) => {
  const result = db.setShiftTypeRequiredRole(req.community.id, req.params.name, req.body.roleId || null);
  if (result.changes === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

communityRouter.get("/admin/roles", requireCommunityAdmin, async (req, res) => {
  res.json(await discordApi.getGuildRoles(req.community.guild_id));
});

communityRouter.get("/admin/permissions", requireCommunityAdmin, (req, res) => {
  res.json({
    admin: db.listRolePermissions(req.community.id, "admin"),
    add_time: db.listRolePermissions(req.community.id, "add_time"),
  });
});

communityRouter.post("/admin/permissions", requireCommunityAdmin, (req, res) => {
  const { roleId, type } = req.body;
  if (!roleId || !["admin", "add_time"].includes(type)) {
    return res.status(400).json({ error: "invalid_request" });
  }
  db.addRolePermission(req.community.id, roleId, type);
  res.json({ ok: true });
});

communityRouter.delete("/admin/permissions", requireCommunityAdmin, (req, res) => {
  const { roleId, type } = req.body;
  if (!roleId || !["admin", "add_time"].includes(type)) {
    return res.status(400).json({ error: "invalid_request" });
  }
  db.removeRolePermission(req.community.id, roleId, type);
  res.json({ ok: true });
});

communityRouter.get("/admin/quotas", requireCommunityAdmin, (req, res) => {
  res.json(db.listQuotas(req.community.id));
});

communityRouter.post("/admin/quotas", requireCommunityAdmin, (req, res) => {
  const { shiftTypeId, hours } = req.body;
  if (typeof hours !== "number" || hours < 0) return res.status(400).json({ error: "invalid_hours" });
  db.setQuota(req.community.id, shiftTypeId ?? null, hours);
  res.json({ ok: true });
});

communityRouter.delete("/admin/quotas/:shiftTypeId", requireCommunityAdmin, (req, res) => {
  const raw = req.params.shiftTypeId;
  const shiftTypeId = raw === "overall" ? null : Number(raw);
  if (raw !== "overall" && Number.isNaN(shiftTypeId)) return res.status(400).json({ error: "invalid_id" });
  db.deleteQuota(req.community.id, shiftTypeId);
  res.json({ ok: true });
});

communityRouter.get("/admin/active", requireCommunityAdmin, (req, res) => {
  res.json(db.listAllActiveShifts(req.community.id));
});

communityRouter.get("/admin/members", requireCommunityAdmin, (req, res) => {
  res.json(db.listAllUsers(req.community.id));
});

communityRouter.post("/admin/shifts/manual", requireCommunityAdmin, requireActiveSubscription, (req, res) => {
  const { discordId, shiftTypeId, date, hours } = req.body;
  if (!discordId) return res.status(400).json({ error: "discordId_required" });

  const shiftType = db.listShiftTypes(req.community.id, { activeOnly: false }).find((t) => t.id === Number(shiftTypeId));
  if (!shiftType) return res.status(400).json({ error: "invalid_shift_type" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return res.status(400).json({ error: "invalid_date" });

  const hoursNum = Number(hours);
  if (!Number.isFinite(hoursNum) || hoursNum <= 0 || hoursNum > 24) {
    return res.status(400).json({ error: "invalid_hours" });
  }
  if (!db.listAllUsers(req.community.id).find((u) => u.discord_id === discordId)) {
    return res.status(404).json({ error: "user_not_found" });
  }

  db.addManualShift(req.community.id, discordId, shiftType.id, date, hoursNum);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
communityRouter.post("/billing/checkout", requireCommunityAdmin, async (req, res) => {
  if (req.community.subscription_status === "active") {
    return res.status(409).json({ error: "already_active" });
  }
  try {
    const origin = `${req.protocol}://${req.get("host")}`;
    const url = await stripeService.createCheckoutSession(req.community, {
      successUrl: `${origin}/admin.html?stripe=success`,
      cancelUrl: `${origin}/admin.html?stripe=cancel`,
    });
    res.json({ url });
  } catch (err) {
    console.error("[billing/checkout]", err);
    res.status(500).json({ error: "checkout_failed" });
  }
});

app.use("/api/communities/:id", communityRouter);

// ---------------------------------------------------------------------------
// Static site
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "..", "public")));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Dashboard running at http://localhost:${port}`);
});
