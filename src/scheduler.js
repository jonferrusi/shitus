// Hourly background job: sends quota reminder DMs and generates the
// previous week's report once a community has rolled into a new week.
// Runs once at startup, then every hour — no cron dependency needed for
// a single fixed interval.
const db = require("./db");
const reminders = require("./reminders");

const HOUR_MS = 60 * 60 * 1000;

function todayDateString(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

async function checkReminders(community, nowMs) {
  if (community.reminder_day === null || community.reminder_day === undefined) return;

  const now = new Date(nowMs);
  if (now.getUTCDay() !== community.reminder_day) return;
  if (now.getUTCHours() !== community.reminder_hour) return;

  const today = todayDateString(nowMs);
  if (community.last_reminder_date === today) return; // already sent once today

  const members = db.listAllUsers(community.id);
  for (const member of members) {
    if (reminders.isBelowReminderThreshold(community, member.discord_id)) {
      await reminders.sendReminder(community, member.discord_id);
    }
  }
  db.setLastReminderDate(community.id, today);
}

function checkWeekRollover(community, nowMs) {
  const weekStart = db.currentWeekStart(community, nowMs);
  const previousWeekStart = weekStart - 7 * 86400;
  if (previousWeekStart <= 0) return;
  if (db.getWeeklyReport(community.id, previousWeekStart)) return; // already saved

  db.generateAndSaveWeeklyReport(community, previousWeekStart);
}

async function runTick(nowMs = Date.now()) {
  for (const community of db.listAllCommunities()) {
    try {
      await checkReminders(community, nowMs);
    } catch (err) {
      console.error(`[scheduler] reminders failed for community ${community.id}:`, err);
    }
    try {
      checkWeekRollover(community, nowMs);
    } catch (err) {
      console.error(`[scheduler] week rollover failed for community ${community.id}:`, err);
    }
  }
}

function start() {
  runTick().catch((err) => console.error("[scheduler] initial tick failed:", err));
  const interval = setInterval(() => {
    runTick().catch((err) => console.error("[scheduler] tick failed:", err));
  }, HOUR_MS);
  interval.unref?.();
  return interval;
}

module.exports = { start, runTick };
