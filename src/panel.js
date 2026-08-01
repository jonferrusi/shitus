const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const db = require("./db");
const { baseEmbed, formatDuration } = require("./format");

const PREFIX = "sm"; // "shift manage"

function actionId(action, userId) {
  return `${PREFIX}:${action}:${userId}`;
}

function parseActionId(customId) {
  const [, action, userId] = customId.split(":");
  return { action, userId };
}

function isPanelComponent(customId) {
  return customId.startsWith(`${PREFIX}:`);
}

// --------------------------------------------------------------------------
// Building the panel for a given state
// --------------------------------------------------------------------------

function weeklySummaryFields(discordId) {
  const totals = db.weeklyTotalsByType(discordId);
  const quotas = db.listQuotas();
  const quotaByType = new Map(quotas.map((q) => [q.shift_type_id, q.hours_required]));

  return totals.map((t) => {
    const required = quotaByType.get(t.shift_type_id);
    const hours = t.total_seconds / 3600;
    let value = formatDuration(t.total_seconds);
    if (required) {
      value += ` / ${required}h`;
      value += hours >= required ? " ✅ passed" : "";
    }
    return { name: t.shift_type_name, value, inline: true };
  });
}

function startRow(userId) {
  const button = new ButtonBuilder()
    .setCustomId(actionId("start", userId))
    .setLabel("Start Shift")
    .setStyle(ButtonStyle.Success);
  return new ActionRowBuilder().addComponents(button);
}

function typeSelectRow(userId, allowedTypes) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(actionId("type", userId))
    .setPlaceholder("What kind of shift would you like to start?")
    .addOptions(allowedTypes.map((t) => ({ label: t.name, value: String(t.id) })));
  return new ActionRowBuilder().addComponents(menu);
}

function onShiftRow(userId, onBreak) {
  const breakButton = onBreak
    ? new ButtonBuilder()
        .setCustomId(actionId("endbreak", userId))
        .setLabel("End Break")
        .setStyle(ButtonStyle.Primary)
    : new ButtonBuilder()
        .setCustomId(actionId("startbreak", userId))
        .setLabel("Start Break")
        .setStyle(ButtonStyle.Secondary);

  const endShiftButton = new ButtonBuilder()
    .setCustomId(actionId("end", userId))
    .setLabel("End Shift")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(breakButton, endShiftButton);
}

/** The "not on shift" panel — just a Start Shift button. */
function idlePanel(client, discordId, username, note) {
  const embed = baseEmbed(client)
    .setTitle("Shift Manager")
    .setDescription(`${note ? `${note}\n\n` : ""}🔴 **${username}** is not on shift.`)
    .addFields(weeklySummaryFields(discordId))
    .setFooter({ text: "Click Start Shift to begin" })
    .setTimestamp();

  return { embeds: [embed], components: [startRow(discordId)] };
}

/** The "pick a shift type" panel, shown right after Start Shift is clicked. */
function typeChooserPanel(client, discordId, username, allowedTypes) {
  const embed = baseEmbed(client)
    .setTitle("Shift Manager")
    .setDescription(
      allowedTypes.length
        ? `**${username}**, what kind of shift would you like to start?`
        : `**${username}**, none of your roles are set up to start a shift here. Ask an admin to check \`/admin shifttype list\`.`
    )
    .setTimestamp();

  return {
    embeds: [embed],
    components: allowedTypes.length ? [typeSelectRow(discordId, allowedTypes)] : [],
  };
}

/** The "on shift" (or "on break") panel, with break + end shift controls. */
function onShiftPanel(client, discordId, username, active) {
  const shiftType = db
    .listShiftTypes({ activeOnly: false })
    .find((t) => t.id === active.shift_type_id);
  const onBreak = !!active.break_start;

  const embed = baseEmbed(client)
    .setTitle("Shift Manager")
    .setDescription(
      onBreak
        ? `☕ **${username}** is on break during a **${shiftType?.name ?? "shift"}** (started <t:${active.start_time}:t>).`
        : `🟢 **${username}** is on **${shiftType?.name ?? "shift"}**, started <t:${active.start_time}:t>.`
    )
    .addFields(weeklySummaryFields(discordId))
    .setFooter({ text: onBreak ? "Hit End Break to get back to counting" : "Counting toward this week's total" })
    .setTimestamp();

  return { embeds: [embed], components: [onShiftRow(discordId, onBreak)] };
}

/** Picks whichever panel matches the user's current DB state. Used as the default view. */
function currentPanel(client, discordId, username, note) {
  const active = db.getActiveShift(discordId);
  if (!active) return idlePanel(client, discordId, username, note);
  return onShiftPanel(client, discordId, username, active);
}

// --------------------------------------------------------------------------
// Handling clicks
// --------------------------------------------------------------------------

async function handleComponent(interaction) {
  const { action, userId } = parseActionId(interaction.customId);

  if (interaction.user.id !== userId) {
    return interaction.reply({
      content: "This isn't your shift panel — run `/shift manage` yourself to get your own.",
      ephemeral: true,
    });
  }

  db.upsertUser({
    discord_id: interaction.user.id,
    username: interaction.user.username,
    avatar: interaction.user.avatar,
  });

  const username = interaction.user.username;
  const active = db.getActiveShift(userId);
  const client = interaction.client;
  const memberRoleIds = interaction.member ? [...interaction.member.roles.cache.keys()] : [];

  switch (action) {
    case "start": {
      // Already on shift (e.g. double click) — just show the real state instead.
      if (active) return interaction.update(onShiftPanel(client, userId, username, active));
      const allowedTypes = db.listShiftTypesForRoles(memberRoleIds);
      return interaction.update(typeChooserPanel(client, userId, username, allowedTypes));
    }

    case "type": {
      if (active) return interaction.update(onShiftPanel(client, userId, username, active));
      const shiftTypeId = Number(interaction.values[0]);
      const shiftType = db.listShiftTypes({ activeOnly: false }).find((t) => t.id === shiftTypeId);
      if (shiftType?.required_role_id && !memberRoleIds.includes(shiftType.required_role_id)) {
        return interaction.reply({
          content: `You need the <@&${shiftType.required_role_id}> role to start that shift.`,
          ephemeral: true,
        });
      }
      db.clockOn(userId, shiftTypeId);
      const fresh = db.getActiveShift(userId);
      return interaction.update(onShiftPanel(client, userId, username, fresh));
    }

    case "startbreak": {
      if (!active) return interaction.update(idlePanel(client, userId, username));
      db.startBreak(active.id);
      const fresh = db.getActiveShift(userId);
      return interaction.update(onShiftPanel(client, userId, username, fresh));
    }

    case "endbreak": {
      if (!active) return interaction.update(idlePanel(client, userId, username));
      db.endBreak(active.id);
      const fresh = db.getActiveShift(userId);
      return interaction.update(onShiftPanel(client, userId, username, fresh));
    }

    case "end": {
      if (!active) return interaction.update(idlePanel(client, userId, username));
      const duration = db.clockOff(active.id);
      const shiftType = db
        .listShiftTypes({ activeOnly: false })
        .find((t) => t.id === active.shift_type_id);
      const note = `Logged **${formatDuration(duration)}** on **${shiftType?.name ?? "shift"}**.`;
      return interaction.update(idlePanel(client, userId, username, note));
    }

    default:
      return;
  }
}

module.exports = { isPanelComponent, currentPanel, handleComponent };
