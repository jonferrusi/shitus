require("dotenv").config();
const { REST, Routes } = require("discord.js");
const shift = require("./commands/shift");
const admin = require("./commands/admin");
const leaderboard = require("./commands/leaderboard");

const commands = [shift.data.toJSON(), admin.data.toJSON(), leaderboard.data.toJSON()];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash commands...`);

    // Guild-scoped registration shows up instantly (good for one server).
    // Swap to Routes.applicationCommands(clientId) for global commands (takes up to an hour to propagate).
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands }
    );

    console.log("Slash commands registered.");
  } catch (error) {
    console.error(error);
  }
})();
