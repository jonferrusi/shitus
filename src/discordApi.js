const db = require("./db");

const API = "https://discord.com/api/v10";

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

/** Uses the BOT token (not the user's) to check the user's roles in the configured guild. */
async function getGuildMember(discordUserId) {
  const res = await fetch(
    `${API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordUserId}`,
    { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } }
  );
  if (!res.ok) return null; // not in the guild, or bot lacks access
  return res.json(); // { roles: [...], nick, ... }
}

/** All roles in the configured guild — used to populate role pickers in the admin UI. */
async function getGuildRoles() {
  const res = await fetch(`${API}/guilds/${process.env.DISCORD_GUILD_ID}/roles`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) return [];
  const roles = await res.json();
  return roles
    .filter((r) => r.name !== "@everyone")
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));
}

function memberHasAnyRole(member, roleIds) {
  if (!member || !roleIds || roleIds.size === 0) return false;
  return member.roles.some((r) => roleIds.has(r));
}

function isAdminMember(member) {
  return memberHasAnyRole(member, db.effectiveRoleIds("admin"));
}

/** Admins can always add time by hand too, on top of whoever holds the add_time permission. */
function canAddTimeMember(member) {
  return isAdminMember(member) || memberHasAnyRole(member, db.effectiveRoleIds("add_time"));
}

module.exports = {
  exchangeCode,
  getUser,
  getGuildMember,
  getGuildRoles,
  isAdminMember,
  canAddTimeMember,
};
