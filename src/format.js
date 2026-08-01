const { EmbedBuilder } = require("discord.js");

const BLUE   = 0x1B96FF; // Shiftus brand blue
const GREEN  = 0x5FAE7A; // success / quota met
const GOLD   = 0xD9A441; // leaderboard
const GRAY   = 0x36393F; // off shift / neutral
const RED    = 0xC9605A; // error / warning

// Keep ACCENT for legacy references
const ACCENT = BLUE;

/** Starting point for every embed — consistent branding. */
function baseEmbed(client, color = BLUE) {
  const embed = new EmbedBuilder().setColor(color);
  if (client?.user) {
    embed.setAuthor({ name: "Shiftus", iconURL: client.user.displayAvatarURL() });
  }
  return embed;
}

/** Format a duration given in seconds as "Xh Ym" or "Ym". */
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/**
 * Render a clean progress bar.
 * Example:  `██████░░░░`  60%  ·  6.0 / 10h
 */
function progressBar(currentSeconds, requiredHours, width = 10) {
  const currentHours = currentSeconds / 3600;
  const pct = requiredHours > 0 ? Math.min(1, currentHours / requiredHours) : 0;
  const filled = Math.round(pct * width);
  const empty  = width - filled;
  const bar    = "█".repeat(filled) + "░".repeat(empty);
  const pctStr = String(Math.round(pct * 100)).padStart(3) + "%";
  return `\`${bar}\`  ${pctStr}  ·  ${currentHours.toFixed(1)} / ${requiredHours}h`;
}

/** A blank field used as a visual spacer between sections. */
const SPACER = { name: "\u200b", value: "\u200b", inline: false };

module.exports = { ACCENT, BLUE, GREEN, GOLD, GRAY, RED, SPACER, baseEmbed, formatDuration, progressBar };
