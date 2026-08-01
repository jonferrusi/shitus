require("dotenv").config();
const { REST, Routes } = require("discord.js");
const shift = require("./commands/shift");
const admin = require("./commands/admin");
const leaderboard = require("./commands/leaderboard");

const commands = [shift.data.toJSON(), admin.data.toJSON(), leaderboard.data.toJSON()];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} global slash commands...`);

    // Global registration: works in every guild the bot is in (or joins
    // later), with no per-guild step needed — but can take up to an hour to
    // propagate. Run this once per deploy. Individual communities also get
    // an instant guild-scoped registration the moment they're created (see
    // discordApi.deployCommandsToGuild), so new servers don't have to wait.
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });

    console.log("Slash commands registered.");
  } catch (error) {
    console.error(error);
  }
})();
