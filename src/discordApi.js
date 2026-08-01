const { REST, Routes } = require("discord.js");
const db = require("./db");

const API = "https://discord.com/api/v10";
const MANAGE_GUILD = 0x20n;

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
  });

  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json(); // { access_token, token_type, ... }
}

async function getUser(accessToken) {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Fetching user failed: ${res.status}`);
  return res.json(); // { id, username, avatar, ... }
}

/** Every guild (Discord server) the logged-in user belongs to, with their permissions in each. */
async function getUserGuilds(accessToken) {
  const res = await fetch(`${API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Fetching user guilds failed: ${res.status}`);
  return res.json(); // [{ id, name, icon, owner, permissions, ... }]
}

/** Whether the user can manage the given guild (owner, or has the Manage Server permission). */
function canManageGuild(guild) {
  if (guild.owner) return true;
  try {
    return (BigInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

/** Uses the BOT token (not the user's) to check the user's roles in a specific guild. */
async function getGuildMember(guildId, discordUserId) {
  const res = await fetch(`${API}/guilds/${guildId}/members/${discordUserId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) return null; // not in the guild, or bot lacks access
  return res.json(); // { roles: [...], nick, ... }
}

/** Basic guild info (name/icon/owner) via the bot token. */
async function getGuild(guildId) {
  const res = await fetch(`${API}/guilds/${guildId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** All roles in a guild — used to populate role pickers in the admin UI. */
async function getGuildRoles(guildId) {
  const res = await fetch(`${API}/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) return [];
  const roles = await res.json();
  return roles
    .filter((r) => r.name !== "@everyone")
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));
}

/**
 * Register Shiftus's slash commands to one specific guild, so they're
 * available instantly there (guild-scoped commands propagate immediately,
 * vs. up to an hour for global ones). Best-effort: fails silently (returns
 * false) if the bot hasn't been invited to that guild yet — the guild owner
 * can re-run this later by re-saving their community settings.
 */
async function deployCommandsToGuild(guildId) {
  try {
    const shift = require("./commands/shift");
    const admin = require("./commands/admin");
    const leaderboard = require("./commands/leaderboard");
    const commands = [shift.data.toJSON(), admin.data.toJSON(), leaderboard.data.toJSON()];

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId), {
      body: commands,
    });
    return true;
  } catch (err) {
    console.warn(`[deployCommandsToGuild] ${guildId}: ${err.message}`);
    return false;
  }
}

function memberHasAnyRole(member, roleIds) {
  if (!member || !roleIds || roleIds.size === 0) return false;
  return member.roles.some((r) => roleIds.has(r));
}

function isAdminMember(communityId, member) {
  return memberHasAnyRole(member, db.effectiveRoleIds(communityId, "admin"));
}

/** Admins can always add time by hand too, on top of whoever holds the add_time permission. */
function canAddTimeMember(communityId, member) {
  return isAdminMember(communityId, member) || memberHasAnyRole(member, db.effectiveRoleIds(communityId, "add_time"));
}

module.exports = {
  exchangeCode,
  getUser,
  getUserGuilds,
  canManageGuild,
  getGuildMember,
  getGuild,
  getGuildRoles,
  deployCommandsToGuild,
  isAdminMember,
  canAddTimeMember,
};
