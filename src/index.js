// Starts the Discord bot, the website, and the background scheduler in the
// same program, so there's only one thing to run (npm start).

// Discord API errors (rate limits, interaction race conditions, a DM to a
// user with DMs closed) shouldn't crash the whole process — log and move on.
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});

require("./bot");
require("./server");
require("./scheduler").start();
