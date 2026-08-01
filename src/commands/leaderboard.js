const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");
const db = require("../db");
const { requireCommunity } = require("../communityContext");
const { baseEmbed, formatDuration, progressBar, GOLD, SPACER } = require("../format");

const SELECT_ID    = "shiftleaderboard-select";
const OVERALL_VALUE = "overall";

const MEDALS = ["🥇", "🥈", "🥉"];

function buildSelectRow(community, selectedValue) {
  const types = db.listShiftTypes(community.id);
  const menu  = new StringSelectMenuBuilder()
    .setCustomId(SELECT_ID)
    .setPlaceholder("Choose a shift type…")
    .addOptions(
      [{ id: OVERALL_VALUE, name: "Overall (all shift types)" }, ...types].map((t) => ({
        label:   t.name,
        value:   String(t.id),
        default: selectedValue !== undefined && String(t.id) === String(selectedValue),
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildLeaderboardEmbed(client, community, shiftTypeId, typeName) {
  const weekStart  = db.currentWeekStart(community);
  const rows       = db.weeklyLeaderboard(community.id, shiftTypeId, weekStart);
  const quota      = db.listQuotas(community.id).find((q) => q.shift_type_id === shiftTypeId);
  const quotaHours = quota?.hours_required ?? null;

  const embed = baseEmbed(client, GOLD)
    .setTitle(`Weekly Leaderboard  ·  ${typeName}`)
    .setFooter({ text: quotaHours ? `Quota: ${quotaHours}h / week  ·  Shiftus` : "No quota set  ·  Shiftus" })
    .setTimestamp();

  if (rows.length === 0) {
    embed.setDescription(
      "No shifts logged here yet this week.\n" +
      "Use `/shift on` to get on the board!"
    );
    return embed;
  }

  // Top 3 as description block, rest as a compact list below
  const top    = rows.slice(0, 3);
  const rest   = rows.slice(3);

  const topLines = top.map((r, i) => {
    const medal = MEDALS[i];
    const hours = r.total_seconds / 3600;
    const met   = quotaHours != null && hours >= quotaHours;
    const icon  = quotaHours != null ? (met ? " ✅" : "") : "";

    const bar   = quotaHours != null
      ? `\n> ${progressBar(r.total_seconds, quotaHours, 10)}`
      : `  ·  **${formatDuration(r.total_seconds)}**`;

    return `${medal}  **${r.username}**  (${formatDuration(r.total_seconds)})${icon}${bar}`;
  });

  embed.setDescription(topLines.join("\n\n"));

  if (rest.length > 0) {
    const restLines = rest.map((r, i) => {
      const pos   = i + 4;
      const hours = r.total_seconds / 3600;
      const met   = quotaHours != null && hours >= quotaHours;
      const icon  = quotaHours != null ? (met ? " ✅" : "") : "";
      return `**${pos}.** ${r.username}  —  ${formatDuration(r.total_seconds)}${icon}`;
    });

    embed.addFields(
      SPACER,
      { name: "Also on the board", value: restLines.join("\n"), inline: false }
    );
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See who has the most shift hours this week")
    .addStringOption((o) =>
      o.setName("type").setDescription("Shift type to filter by (leave blank for overall)").setRequired(false).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const community = require("../communityContext").getCommunity(interaction);
    if (!community) return interaction.respond([]);

    const focused = interaction.options.getFocused().toLowerCase();
    const types = db.listShiftTypes(community.id);
    const filtered = types.filter((t) => t.name.toLowerCase().includes(focused)).slice(0, 25);
    await interaction.respond(filtered.map((t) => ({ name: t.name, value: t.name })));
  },

  async execute(interaction) {
    const community = await requireCommunity(interaction);
    if (!community) return;

    const typeName = interaction.options.getString("type");
    if (typeName) {
      const shiftType = db.listShiftTypes(community.id).find((t) => t.name.toLowerCase() === typeName.toLowerCase());
      if (!shiftType) {
        return interaction.reply({ content: `Couldn't find a shift type named **${typeName}**.`, ephemeral: true });
      }
      const embed = buildLeaderboardEmbed(interaction.client, community, shiftType.id, shiftType.name);
      const row = buildSelectRow(community, String(shiftType.id));
      return interaction.reply({ embeds: [embed], components: [row] });
    }

    const row = buildSelectRow(community);
    const embed = baseEmbed(interaction.client, GOLD)
      .setTitle("Weekly Leaderboard")
      .setDescription("Select a shift type below to see this week's rankings.");

    await interaction.reply({ embeds: [embed], components: [row] });
  },

  async handleSelect(interaction) {
    const community = await requireCommunity(interaction);
    if (!community) return;

    const value       = interaction.values[0];
    const shiftTypeId = value === OVERALL_VALUE ? null : Number(value);
    const typeName    = value === OVERALL_VALUE
      ? "Overall"
      : db.listShiftTypes(community.id, { activeOnly: false }).find((t) => String(t.id) === value)?.name ?? "Unknown";

    const embed = buildLeaderboardEmbed(interaction.client, community, shiftTypeId, typeName);
    const row   = buildSelectRow(community, value);

    await interaction.update({ embeds: [embed], components: [row] });
  },
};
