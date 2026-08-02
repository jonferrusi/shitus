const { EmbedBuilder } = require("discord.js");

const ACCENT = 0xd9a441; // amber, matches the dashboard

/** Starting point for every embed: consistent color + a small branded author line. */
function baseEmbed(client) {
  const embed = new EmbedBuilder().setColor(ACCENT);
  if (client?.user) {
    embed.setAuthor({ name: "Duty Log", iconURL: client.user.displayAvatarURL() });
  }
  return embed;
}

/** Format a duration given in seconds as "Xh Ym". */
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

module.exports = { ACCENT, baseEmbed, formatDuration };
