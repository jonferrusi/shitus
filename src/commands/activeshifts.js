const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("../db");
const { requireCommunityAdmin } = require("../communityContext");
const { forceEndShift } = require("../shiftActions");
const { baseEmbed, formatDuration, GOLD } = require("../format");

const PREFIX = "af"; // "active shifts"
const MAX_BUTTONS = 25; // Discord's per-message component limit

function endButtonId(shiftId) {
  return `${PREFIX}:end:${shiftId}`;
}

function isActiveShiftsComponent(customId) {
  return customId.startsWith(`${PREFIX}:`);
}

function buildView(client, community) {
  const active = db.listAllActiveShifts(community.id);
  const now = Math.floor(Date.now() / 1000);

  const embed = baseEmbed(client, GOLD)
    .setTitle("Active Shifts")
    .setFooter({ text: `${active.length} on shift  ·  Shiftus` })
    .setTimestamp();

  if (active.length === 0) {
    embed.setDescription("Nobody is currently on shift.");
    return { embeds: [embed], components: [] };
  }

  embed.setDescription(
    active
      .map((s) => {
        let breakSeconds = s.total_break_seconds || 0;
        if (s.break_start) breakSeconds += now - s.break_start;
        const elapsed = now - s.start_time - breakSeconds;
        const status = s.break_start ? " · on break" : "";
        return `**${s.username ?? s.discord_id}** — ${s.shift_type_name} — ${formatDuration(elapsed)}${status}`;
      })
      .join("\n")
  );

  const buttons = active.slice(0, MAX_BUTTONS).map((s) =>
    new ButtonBuilder()
      .setCustomId(endButtonId(s.id))
      .setLabel(`End: ${s.username ?? s.discord_id}`.slice(0, 80))
      .setStyle(ButtonStyle.Danger)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  return { embeds: [embed], components: rows };
}

module.exports = {
  isActiveShiftsComponent,

  data: new SlashCommandBuilder()
    .setName("activeshifts")
    .setDescription("Admin: view everyone currently on shift"),

  async execute(interaction) {
    const community = await requireCommunityAdmin(interaction);
    if (!community) return;

    await interaction.reply(buildView(interaction.client, community));
  },

  async handleComponent(interaction) {
    const community = await requireCommunityAdmin(interaction);
    if (!community) return;

    const [, action, shiftIdRaw] = interaction.customId.split(":");
    if (action !== "end") return;

    const shift = db.getShiftById(Number(shiftIdRaw));
    if (!shift || shift.community_id !== community.id || shift.end_time !== null) {
      await interaction.reply({ content: "That shift has already ended.", ephemeral: true });
      return interaction.message.edit(buildView(interaction.client, community)).catch(() => {});
    }

    const duration = await forceEndShift(community, shift, interaction.user.username);

    await interaction.reply({
      content: `Ended **${shift.username ?? shift.discord_id}**'s **${shift.shift_type_name}** shift (${formatDuration(duration)}). They've been notified by DM.`,
      ephemeral: true,
    });
    await interaction.message.edit(buildView(interaction.client, community));
  },
};
