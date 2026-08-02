const { SlashCommandBuilder } = require("discord.js");
const db = require("../db");
const { baseEmbed, formatDuration } = require("../format");
const panel = require("../panel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shift")
    .setDescription("Clock on/off and check your shift status")
    .addSubcommand((sub) =>
      sub
        .setName("on")
        .setDescription("Clock on to a shift")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("The type of shift you're starting")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("off").setDescription("Clock off your current shift")
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("See your current shift and weekly progress")
    )
    .addSubcommand((sub) =>
      sub.setName("manage").setDescription("Open an interactive panel to start/end shifts and breaks")
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const roleIds = interaction.member ? [...interaction.member.roles.cache.keys()] : [];
    const types = db.listShiftTypesForRoles(roleIds);
    const filtered = types
      .filter((t) => t.name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(
      filtered.map((t) => ({ name: t.name, value: t.name }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    db.upsertUser({
      discord_id: interaction.user.id,
      username: interaction.user.username,
      avatar: interaction.user.avatar,
    });

    if (sub === "on") return handleOn(interaction);
    if (sub === "off") return handleOff(interaction);
    if (sub === "status") return handleStatus(interaction);
    if (sub === "manage") return handleManage(interaction);
  },
};

async function handleManage(interaction) {
  // A normal (non-ephemeral) reply, so this is a real message the bot posts
  // in the channel and keeps editing in place as buttons/dropdowns are used.
  const view = panel.currentPanel(interaction.client, interaction.user.id, interaction.user.username);
  return interaction.reply(view);
}

async function handleOn(interaction) {
  const typeName = interaction.options.getString("type", true);
  const shiftType = db.getShiftTypeByName(typeName);

  if (!shiftType) {
    return interaction.reply({
      content: `I don't recognize the shift type **${typeName}**. Use the autocomplete list, or ask an admin to add it with \`/admin shifttype add\`.`,
      ephemeral: true,
    });
  }

  if (shiftType.required_role_id && !interaction.member.roles.cache.has(shiftType.required_role_id)) {
    return interaction.reply({
      content: `You need the <@&${shiftType.required_role_id}> role to start a **${shiftType.name}** shift.`,
      ephemeral: true,
    });
  }

  const active = db.getActiveShift(interaction.user.id);
  if (active) {
    return interaction.reply({
      content: `You're already clocked on to a shift. Use \`/shift off\` first.`,
      ephemeral: true,
    });
  }

  db.clockOn(interaction.user.id, shiftType.id);

  const embed = baseEmbed(interaction.client)
    .setTitle("Clocked On")
    .setDescription(`You're now on **${shiftType.name}**.`)
    .setFooter({ text: "Remember to /shift off when you're done" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

async function handleOff(interaction) {
  const active = db.getActiveShift(interaction.user.id);
  if (!active) {
    return interaction.reply({
      content: "You're not currently on a shift.",
      ephemeral: true,
    });
  }

  const duration = db.clockOff(active.id);
  const totals = db.weeklyTotalsByType(interaction.user.id);
  const quotas = db.listQuotas();
  const quotaByType = new Map(quotas.map((q) => [q.shift_type_id, q.hours_required]));
  const shiftType = db
    .listShiftTypes({ activeOnly: false })
    .find((t) => t.id === active.shift_type_id);

  const embed = baseEmbed(interaction.client)
    .setTitle("Clocked Off")
    .setDescription(
      `Logged **${formatDuration(duration)}** on **${shiftType?.name ?? "shift"}**.`
    )
    .addFields(
      totals.map((t) => {
        const required = quotaByType.get(t.shift_type_id);
        const hours = t.total_seconds / 3600;
        let value = formatDuration(t.total_seconds);
        if (required) {
          value += ` / ${required}h`;
          value += hours >= required ? " ✅ quota passed" : "";
        }
        return { name: t.shift_type_name, value, inline: true };
      })
    )
    .setFooter({ text: "This week's totals shown above" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

async function handleStatus(interaction) {
  const active = db.getActiveShift(interaction.user.id);
  const totals = db.weeklyTotalsByType(interaction.user.id);
  const quotas = db.listQuotas();

  const quotaByType = new Map(quotas.map((q) => [q.shift_type_id, q.hours_required]));
  const overallQuota = quotaByType.get(null);

  const embed = baseEmbed(interaction.client)
    .setTitle("Shift Status")
    .setDescription(
      active
        ? `🟢 On shift: **${
            db.listShiftTypes({ activeOnly: false }).find((t) => t.id === active.shift_type_id)
              ?.name
          }** since <t:${active.start_time}:t>`
        : "🔴 Not currently on shift"
    );

  let totalSeconds = 0;
  for (const t of totals) {
    totalSeconds += t.total_seconds;
    const required = quotaByType.get(t.shift_type_id);
    const hours = t.total_seconds / 3600;
    let label = formatDuration(t.total_seconds);
    if (required) {
      label += ` / ${required}h`;
      label += hours >= required ? " ✅ passed" : " ❌ short";
    }
    embed.addFields({ name: t.shift_type_name, value: label, inline: true });
  }

  if (overallQuota) {
    const overallHours = totalSeconds / 3600;
    embed.addFields({
      name: "Weekly quota (overall)",
      value: `${formatDuration(totalSeconds)} / ${overallQuota}h${
        overallHours >= overallQuota ? " ✅ passed" : ""
      }`,
    });
  }

  embed.setFooter({ text: "Full history is on the dashboard website" }).setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}
