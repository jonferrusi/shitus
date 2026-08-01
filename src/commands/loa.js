const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const db = require("../db");
const { requireCommunity } = require("../communityContext");
const { baseEmbed, GREEN, RED } = require("../format");

const MODAL_ID = "loa:request";

function isLoaModal(customId) {
  return customId === MODAL_ID;
}

module.exports = {
  isLoaModal,

  data: new SlashCommandBuilder()
    .setName("loa")
    .setDescription("Leave of Absence requests")
    .addSubcommand((sub) => sub.setName("request").setDescription("Submit a Leave of Absence request")),

  async execute(interaction) {
    const community = await requireCommunity(interaction);
    if (!community) return;

    const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle("Request Leave of Absence");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    const durationInput = new TextInputBuilder()
      .setCustomId("duration")
      .setLabel("Duration (days)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("e.g. 7");

    modal.addComponents(
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(durationInput)
    );

    await interaction.showModal(modal);
  },

  async handleModalSubmit(interaction) {
    const community = await requireCommunity(interaction);
    if (!community) return;

    const reason = interaction.fields.getTextInputValue("reason").trim();
    const durationRaw = interaction.fields.getTextInputValue("duration").trim();
    const durationDays = Number(durationRaw);

    if (!Number.isInteger(durationDays) || durationDays <= 0 || durationDays > 365) {
      const embed = baseEmbed(interaction.client, RED)
        .setTitle("Invalid Duration")
        .setDescription("Duration must be a whole number of days between 1 and 365.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    db.upsertUser({
      discord_id: interaction.user.id,
      username: interaction.user.username,
      avatar: interaction.user.avatar,
    });
    db.addCommunityMember(community.id, interaction.user.id);
    db.createLoaRequest(community.id, interaction.user.id, reason, durationDays);

    const embed = baseEmbed(interaction.client, GREEN)
      .setTitle("Leave of Absence Requested")
      .setDescription(
        `Your request for **${durationDays} day${durationDays === 1 ? "" : "s"}** has been submitted for review.`
      )
      .addFields({ name: "Reason", value: reason, inline: false })
      .setFooter({ text: "An admin will review it from the dashboard" });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
