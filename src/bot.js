require("dotenv").config();
const { Client, GatewayIntentBits, Collection } = require("discord.js");

const shift = require("./commands/shift");
const admin = require("./commands/admin");
const leaderboard = require("./commands/leaderboard");
const panel = require("./panel");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
client.commands.set(shift.data.name, shift);
client.commands.set(admin.data.name, admin);
client.commands.set(leaderboard.data.name, leaderboard);

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.autocomplete(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "shiftleaderboard-select") {
      await leaderboard.handleSelect(interaction);
      return;
    }

    if (
      (interaction.isButton() || interaction.isStringSelectMenu()) &&
      panel.isPanelComponent(interaction.customId)
    ) {
      await panel.handleComponent(interaction);
      return;
    }
  } catch (error) {
    console.error(error);
    const payload = { content: "Something went wrong running that command.", ephemeral: true };
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply(payload);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
