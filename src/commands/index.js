// Single source of truth for "what commands does Shiftus register" — used
// by bot.js (interaction routing), deploy-commands.js (global registration),
// and discordApi.deployCommandsToGuild (instant per-community registration),
// so the three never drift out of sync as commands are added.
const shift = require("./shift");
const admin = require("./admin");
const leaderboard = require("./leaderboard");
const loa = require("./loa");
const activeshifts = require("./activeshifts");

const commands = [shift, admin, leaderboard, loa, activeshifts];

module.exports = { commands };
