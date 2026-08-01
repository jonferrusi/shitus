const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const db = require("../db");
const { baseEmbed, formatDuration, progressBar, GREEN, RED, GOLD, SPACER } = require("../format");

const SELECT_PREFIX = "shifton"; // "shift on" — distinct from panel.js's "sm:" prefix

function typeSelectId(userId) {
  return `${SELECT_PREFIX}:${userId}`;
}

function isShiftOnSelect(customId) {
  return customId.startsWith(`${SELECT_PREFIX}:`);
}

/** Quota progress lines relevant to a given shift type + the overall quota, for one user. */
function quotaFields(discordId, shiftTypeId) {
  const totals = db.weeklyTotalsByType(discordId);
  const quotas = db.listQuotas();
  const fields = [];

  for (const quota of quotas) {
    // Only show the quota for the shift type just clocked off of, plus the overall quota.
    if (quota.shift_type_id !== null && quota.shift_type_id !== shiftTypeId) continue;

    const seconds = quota.shift_type_id === null
      ? totals.reduce((sum, t) => sum + t.total_seconds, 0)
      : totals.find((t) => t.shift_type_id === quota.shift_type_id)?.total_seconds ?? 0;

    const hours = seconds / 3600;
    const met = hours >= quota.hours_required;
    fields.push({
      name: quota.shift_type_name ?? "Overall",
      value: `${progressBar(seconds, quota.hours_required)}${met ? "  ✅" : ""}`,
      inline: false,
    });
  }

  return fields;
}

async function startShift(interaction, shiftTypeId) {
  const shiftType = db.listShiftTypes({ activeOnly: false }).find((t) => t.id === shiftTypeId);
  if (!shiftType) {
    return interaction.reply({ content: "That shift type doesn't exist anymore.", ephemeral: true });
  }

  const memberRoleIds = interaction.member ? [...interaction.member.roles.cache.keys()] : [];
  if (shiftType.required_role_id && !memberRoleIds.includes(shiftType.required_role_id)) {
    return interaction.reply({
      content: `You need the <@&${shiftType.required_role_id}> role to start that shift.`,
      ephemeral: true,
    });
  }

  db.clockOn(interaction.user.id, shiftType.id);

  const embed = baseEmbed(interaction.client, GREEN)
    .setTitle("Shift Started")
    .setDescription(`🟢 You're clocked on to **${shiftType.name}**.`)
    .setFooter({ text: "Use /shift off when you're done" })
    .setTimestamp();

  const payload = { embeds: [embed], components: [] };
  if (interaction.isStringSelectMenu()) {
    return interaction.update(payload);
  }
  return interaction.reply(payload);
}

module.exports = {
  isShiftOnSelect,

  data: new SlashCommandBuilder()
    .setName("shift")
    .setDescription("Clock on, clock off, and manage your shift")
    .addSubcommand((sub) =>
      sub
        .setName("on")
        .setDescription("Clock on to a shift")
        .addStringOption((o) =>
          o.setName("type").setDescription("Shift type").setRequired(false).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) => sub.setName("off").setDescription("Clock off your current shift"))
    .addSubcommand((sub) => sub.setName("break").setDescription("Start or end a break during your shift"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Check your current shift status")),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const memberRoleIds = interaction.member ? [...interaction.member.roles.cache.keys()] : [];
    const types = db.listShiftTypesForRoles(memberRoleIds);
    const filtered = types.filter((t) => t.name.toLowerCase().includes(focused)).slice(0, 25);
    await interaction.respond(filtered.map((t) => ({ name: t.name, value: t.name })));
  },

  async execute(interaction) {
    db.upsertUser({
      discord_id: interaction.user.id,
      username: interaction.user.username,
      avatar: interaction.user.avatar,
    });

    const sub = interaction.options.getSubcommand();
    const discordId = interaction.user.id;
    const active = db.getActiveShift(discordId);

    if (sub === "on") {
      if (active) {
        return interaction.reply({ content: "You're already on shift — use `/shift off` first.", ephemeral: true });
      }

      const memberRoleIds = interaction.member ? [...interaction.member.roles.cache.keys()] : [];
      const allowedTypes = db.listShiftTypesForRoles(memberRoleIds);

      if (allowedTypes.length === 0) {
        const anyTypes = db.listShiftTypes().length > 0;
        const embed = baseEmbed(interaction.client, RED)
          .setTitle("Can't Clock On")
          .setDescription(
            anyTypes
              ? "None of your roles are set up to start a shift here. Ask an admin to check `/admin shifttype list`."
              : "This server doesn't have any shift types configured yet. Ask an admin to run `/admin shifttype add`."
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const typeName = interaction.options.getString("type");
      if (typeName) {
        const shiftType = allowedTypes.find((t) => t.name.toLowerCase() === typeName.toLowerCase());
        if (!shiftType) {
          return interaction.reply({
            content: `Couldn't find a shift type named **${typeName}** that you're allowed to start.`,
            ephemeral: true,
          });
        }
        return startShift(interaction, shiftType.id);
      }

      if (allowedTypes.length === 1) {
        return startShift(interaction, allowedTypes[0].id);
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId(typeSelectId(discordId))
        .setPlaceholder("What kind of shift would you like to start?")
        .addOptions(allowedTypes.map((t) => ({ label: t.name, value: String(t.id) })));
      const row = new ActionRowBuilder().addComponents(menu);

      const embed = baseEmbed(interaction.client)
        .setTitle("Choose a Shift Type")
        .setDescription("Pick which kind of shift you're starting.");

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (sub === "off") {
      if (!active) {
        return interaction.reply({ content: "You're not on shift right now.", ephemeral: true });
      }

      const shiftType = db.listShiftTypes({ activeOnly: false }).find((t) => t.id === active.shift_type_id);
      const duration = db.clockOff(active.id);

      const fields = quotaFields(discordId, active.shift_type_id);

      const embed = baseEmbed(interaction.client)
        .setTitle("Shift Ended")
        .setDescription(`You were on **${shiftType?.name ?? "shift"}** for **${formatDuration(duration)}**.`)
        .addFields(fields.length ? fields : [{ name: "​", value: "No quota set for this shift type.", inline: false }])
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "break") {
      if (!active) {
        return interaction.reply({ content: "You're not on shift right now.", ephemeral: true });
      }

      if (active.break_start) {
        db.endBreak(active.id);
        const embed = baseEmbed(interaction.client)
          .setTitle("Break Ended")
          .setDescription("Welcome back — your shift is counting again.");
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      db.startBreak(active.id);
      const embed = baseEmbed(interaction.client, GOLD)
        .setTitle("Break Started")
        .setDescription("Enjoy your break. Run `/shift break` again to end it.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "status") {
      if (!active) {
        const embed = baseEmbed(interaction.client)
          .setTitle("Shift Status")
          .setDescription("🔴 You're not on shift right now.");
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const shiftType = db.listShiftTypes({ activeOnly: false }).find((t) => t.id === active.shift_type_id);
      const onBreak = !!active.break_start;
      const fields = quotaFields(discordId, active.shift_type_id);

      const embed = baseEmbed(interaction.client)
        .setTitle("Shift Status")
        .setDescription(
          onBreak
            ? `☕ On break during **${shiftType?.name ?? "shift"}**, started <t:${active.start_time}:t> (<t:${active.start_time}:R>).`
            : `🟢 On **${shiftType?.name ?? "shift"}**, started <t:${active.start_time}:t> (<t:${active.start_time}:R>).`
        )
        .addFields(fields.length ? fields : [SPACER])
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  async handleSelect(interaction) {
    const [, userId] = interaction.customId.split(":");
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: "This isn't your shift prompt — run `/shift on` yourself.", ephemeral: true });
    }
    const shiftTypeId = Number(interaction.values[0]);
    return startShift(interaction, shiftTypeId);
  },
};
