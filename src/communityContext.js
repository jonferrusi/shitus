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

const SUBSCRIPTION_REQUIRED_MESSAGE =
  "This community doesn't have an active Shiftus subscription, so clocking on is disabled. " +
  "An admin needs to subscribe from the Admin page on the dashboard.";

/**
 * True if this community is allowed to use shift-logging bot features right
 * now. If not, replies with a friendly explanation and returns false. Billing
 * isn't enforced at all if Stripe isn't configured (e.g. local development).
 *
 *   if (!(await requireActiveSubscription(interaction, community))) return;
 */
async function requireActiveSubscription(interaction, community) {
  if (!process.env.STRIPE_SECRET_KEY) return true;
  if (community.subscription_status === "active") return true;

  const embed = baseEmbed(interaction.client, RED).setTitle("Subscription Required").setDescription(SUBSCRIPTION_REQUIRED_MESSAGE);
  const payload = { embeds: [embed], ephemeral: true };

  if (interaction.isRepliable()) {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
  return false;
}

/** Whether this interaction's member is an admin for the given community. */
function isCommunityAdmin(interaction, community) {
  const { PermissionFlagsBits } = require("discord.js");
  if (interaction.user.id === process.env.PLATFORM_OWNER_DISCORD_ID) return true;
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const adminRoleIds = db.effectiveRoleIds(community.id, "admin");
  return interaction.member.roles.cache.some((r) => adminRoleIds.has(r.id));
}

const ADMIN_REQUIRED_MESSAGE = "You don't have permission to use this command.";

/**
 * Resolves the community and confirms the caller is an admin for it,
 * replying with a friendly denial and returning null otherwise. Use like:
 *
 *   const community = await requireCommunityAdmin(interaction);
 *   if (!community) return;
 */
async function requireCommunityAdmin(interaction) {
  const community = await requireCommunity(interaction);
  if (!community) return null;

  if (!isCommunityAdmin(interaction, community)) {
    const embed = baseEmbed(interaction.client, RED).setTitle("Access Denied").setDescription(ADMIN_REQUIRED_MESSAGE);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return null;
  }
  return community;
}

module.exports = {
  getCommunity,
  requireCommunity,
  requireActiveSubscription,
  isCommunityAdmin,
  requireCommunityAdmin,
};
