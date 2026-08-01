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
    const { commands: commandModules } = require("./commands");
    const commands = commandModules.map((c) => c.data.toJSON());

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

/** Adds a role to a guild member. Returns false (non-throwing) on failure — e.g. the bot's
 * highest role is ranked below the target role, or it lacks Manage Roles. */
async function addMemberRole(guildId, userId, roleId) {
  const res = await fetch(`${API}/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) console.warn(`[addMemberRole] guild=${guildId} user=${userId} role=${roleId}: ${res.status}`);
  return res.ok;
}

/** Removes a role from a guild member. Same non-throwing failure behavior as addMemberRole. */
async function removeMemberRole(guildId, userId, roleId) {
  const res = await fetch(`${API}/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) console.warn(`[removeMemberRole] guild=${guildId} user=${userId} role=${roleId}: ${res.status}`);
  return res.ok;
}

/** Renames a member's server nickname. */
async function setMemberNickname(guildId, userId, nickname) {
  const res = await fetch(`${API}/guilds/${guildId}/members/${userId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nick: nickname }),
  });
  if (!res.ok) console.warn(`[setMemberNickname] guild=${guildId} user=${userId}: ${res.status}`);
  return res.ok;
}

/** Sends a DM to a Discord user via the bot (opens/reuses a DM channel first). */
async function sendDM(userId, content) {
  const openRes = await fetch(`${API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!openRes.ok) {
    console.warn(`[sendDM] couldn't open DM channel with ${userId}: ${openRes.status}`);
    return false;
  }
  const channel = await openRes.json();

  const msgRes = await fetch(`${API}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(content),
  });
  if (!msgRes.ok) console.warn(`[sendDM] couldn't message ${userId}: ${msgRes.status}`);
  return msgRes.ok;
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
  addMemberRole,
  removeMemberRole,
  setMemberNickname,
  sendDM,
  isAdminMember,
  canAddTimeMember,
};
