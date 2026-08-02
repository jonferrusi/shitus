const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const db = require("../db");
const { baseEmbed, formatDuration } = require("../format");

const SELECT_ID = "shiftleaderboard-select";
const OVERALL_VALUE = "overall";

function buildSelectRow(selectedValue) {
  const types = db.listShiftTypes();
  const menu = new StringSelectMenuBuilder()
    .setCustomId(SELECT_ID)
    .setPlaceholder("Choose a shift type…")
    .addOptions(
      [{ id: OVERALL_VALUE, name: "Overall (all shift types)" }, ...types].map((t) => ({
        label: t.name,
        value: String(t.id),
        default: selectedValue !== undefined && String(t.id) === String(selectedValue),
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildLeaderboardEmbed(client, shiftTypeId, typeName) {
  const weekStart = db.currentWeekStart();
  const rows = db.weeklyLeaderboard(shiftTypeId, weekStart);
  const quota = db.listQuotas().find((q) => q.shift_type_id === shiftTypeId);
  const quotaHours = quota?.hours_required ?? null;

  const embed = baseEmbed(client)
    .setTitle(`Weekly Leaderboard — ${typeName}`)
    .setFooter({ text: quotaHours ? `Quota: ${quotaHours}h / week` : "No quota set for this type" })
    .setTimestamp();

  if (rows.length === 0) {
    embed.setDescription("No one has logged time here yet this week.");
    return embed;
  }

  const lines = rows.map((r, i) => {
    const hours = r.total_seconds / 3600;
    let dot = "⚪";
    if (quotaHours != null) dot = hours >= quotaHours ? "🟢" : "🔴";
    const passed = quotaHours != null && hours >= quotaHours ? " — quota passed" : "";
    return `**${i + 1}.** ${dot} ${r.username} — **${formatDuration(r.total_seconds)}**${passed}`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shiftleaderboard")
    .setDescription("See who has the most shift hours this week"),

  async execute(interaction) {
    const row = buildSelectRow();
    await interaction.reply({
      content: "Pick a shift type to see this week's leaderboard:",
      components: [row],
    });
  },

  // Called from bot.js when someone picks an option from the dropdown
  async handleSelect(interaction) {
    const value = interaction.values[0];
    const shiftTypeId = value === OVERALL_VALUE ? null : Number(value);
    const typeName =
      value === OVERALL_VALUE
        ? "Overall"
        : db.listShiftTypes({ activeOnly: false }).find((t) => String(t.id) === value)?.name ?? "Unknown";

    const embed = buildLeaderboardEmbed(interaction.client, shiftTypeId, typeName);
    const row = buildSelectRow(value);

    await interaction.update({ content: "", embeds: [embed], components: [row] });
  },
};
