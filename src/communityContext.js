const db = require("./db");
const { baseEmbed, RED } = require("./format");

/** The Shiftus community linked to the guild this interaction happened in, or null. */
function getCommunity(interaction) {
  if (!interaction.guildId) return null;
  return db.getCommunityByGuildId(interaction.guildId);
}

const NOT_SET_UP_MESSAGE =
  "This server isn't linked to Shiftus yet. Someone with **Manage Server** needs to sign in at " +
  "the Shiftus dashboard and create a community for this server first.";

/**
 * Resolves the community for this interaction, replying with a friendly
 * "not set up" message and returning null if there isn't one. Use like:
 *
 *   const community = await requireCommunity(interaction);
 *   if (!community) return;
 */
async function requireCommunity(interaction) {
  const community = getCommunity(interaction);
  if (community) return community;

  const embed = baseEmbed(interaction.client, RED).setTitle("Not Set Up").setDescription(NOT_SET_UP_MESSAGE);
  const payload = { embeds: [embed], ephemeral: true };

  if (interaction.isRepliable()) {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
  return null;
}

module.exports = { getCommunity, requireCommunity };
