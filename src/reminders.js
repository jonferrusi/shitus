const db = require("./db");
const discordApi = require("./discordApi");
const { formatDuration, progressBar } = require("./format");

/**
 * Builds a reminder DM for one member, based on the community's overall
 * quota (there's nothing to remind someone about without one configured).
 * Returns null if there's no overall quota, or if they've already met it.
 */
function buildReminderContent(community, discordId) {
  const progress = db.quotaProgressForMember(community, discordId);
  const overall = progress.find((q) => q.shiftTypeId === null);
  if (!overall || overall.met) return null;

  const hoursLogged = overall.seconds / 3600;
  const hoursNeeded = Math.max(0, overall.hoursRequired - hoursLogged);

  return {
    embeds: [
      {
        title: "Quota Reminder",
        description:
          `You're at **${formatDuration(overall.seconds)}** of your **${overall.hoursRequired}h** goal in **${community.name}**.\n\n` +
          `${progressBar(overall.seconds, overall.hoursRequired)}\n\n` +
          `You need **${hoursNeeded.toFixed(1)}h** more before the week resets. Log a shift soon!`,
        color: 0xd9a441,
      },
    ],
  };
}

/** Sends the reminder DM if the member qualifies. Returns true if one was sent. */
async function sendReminder(community, discordId) {
  const content = buildReminderContent(community, discordId);
  if (!content) return false;
  return discordApi.sendDM(discordId, content);
}

/**
 * Whether a member is behind enough to be included in the automated daily
 * pass — below the community's configured hour threshold. Manual "send one
 * now" from the admin panel skips this and just checks whether the quota's
 * been met, since it's a deliberate one-off action.
 */
function isBelowReminderThreshold(community, discordId) {
  if (community.reminder_threshold_hours == null) return false;
  const progress = db.quotaProgressForMember(community, discordId);
  const overall = progress.find((q) => q.shiftTypeId === null);
  if (!overall) return false;
  return overall.seconds / 3600 < community.reminder_threshold_hours;
}

module.exports = { buildReminderContent, sendReminder, isBelowReminderThreshold };
