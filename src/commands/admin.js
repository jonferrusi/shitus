const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../db");
const { getCommunity, requireCommunity } = require("../communityContext");
const { baseEmbed, GOLD, GREEN, RED, SPACER } = require("../format");

function isAdmin(interaction, community) {
  if (interaction.user.id === process.env.PLATFORM_OWNER_DISCORD_ID) return true;
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const adminRoleIds = db.effectiveRoleIds(community.id, "admin");
  return interaction.member.roles.cache.some((r) => adminRoleIds.has(r.id));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Manage shift types, quotas, and permissions")
    .addSubcommandGroup((group) =>
      group
        .setName("shifttype")
        .setDescription("Manage shift types")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Add a new shift type")
            .addStringOption((o) => o.setName("name").setDescription("Shift type name").setRequired(true))
            .addRoleOption((o) =>
              o
                .setName("role")
                .setDescription("Only members with this role can start it (leave blank for anyone)")
                .setRequired(false)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Deactivate a shift type")
            .addStringOption((o) => o.setName("name").setDescription("Shift type name").setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName("restrict")
            .setDescription("Change who can start an existing shift type")
            .addStringOption((o) =>
              o.setName("name").setDescription("Shift type name").setRequired(true).setAutocomplete(true)
            )
            .addRoleOption((o) =>
              o
                .setName("role")
                .setDescription("Only members with this role can start it (leave blank to allow anyone)")
                .setRequired(false)
            )
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("List shift types"))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("quota")
        .setDescription("Manage weekly quotas")
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Set a weekly quota (in hours)")
            .addNumberOption((o) => o.setName("hours").setDescription("Hours required per week").setRequired(true))
            .addStringOption((o) =>
              o
                .setName("type")
                .setDescription("Shift type this applies to (leave blank for overall)")
                .setRequired(false)
                .setAutocomplete(true)
            )
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("List current quotas"))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("permissions")
        .setDescription("Manage who can use admin commands or add time on the website")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Grant a role admin or add-time permission")
            .addRoleOption((o) => o.setName("role").setDescription("Role to grant").setRequired(true))
            .addStringOption((o) =>
              o
                .setName("type")
                .setDescription("Which permission to grant")
                .setRequired(true)
                .addChoices(
                  { name: "Admin (manage shift types/quotas, view roster)", value: "admin" },
                  { name: "Add Time (log time by hand on the website)", value: "add_time" }
                )
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Revoke a role's admin or add-time permission")
            .addRoleOption((o) => o.setName("role").setDescription("Role to revoke").setRequired(true))
            .addStringOption((o) =>
              o
                .setName("type")
                .setDescription("Which permission to revoke")
                .setRequired(true)
                .addChoices(
                  { name: "Admin", value: "admin" },
                  { name: "Add Time", value: "add_time" }
                )
            )
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("List which roles have which permissions"))
    ),

  async autocomplete(interaction) {
    const community = getCommunity(interaction);
    if (!community) return interaction.respond([]);

    const focused = interaction.options.getFocused().toLowerCase();
    const types = db.listShiftTypes(community.id);
    const filtered = types.filter((t) => t.name.toLowerCase().includes(focused)).slice(0, 25);
    await interaction.respond(filtered.map((t) => ({ name: t.name, value: t.name })));
  },

  async execute(interaction) {
    const community = await requireCommunity(interaction);
    if (!community) return;

    if (!isAdmin(interaction, community)) {
      const embed = baseEmbed(interaction.client, RED)
        .setTitle("Access Denied")
        .setDescription("You don't have permission to use admin commands.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const group = interaction.options.getSubcommandGroup();
    const sub   = interaction.options.getSubcommand();

    if (group === "shifttype") {
      if (sub === "add")      return shiftTypeAdd(interaction, community);
      if (sub === "remove")   return shiftTypeRemove(interaction, community);
      if (sub === "restrict") return shiftTypeRestrict(interaction, community);
      if (sub === "list")     return shiftTypeList(interaction, community);
    }

    if (group === "quota") {
      if (sub === "set")  return quotaSet(interaction, community);
      if (sub === "list") return quotaList(interaction, community);
    }

    if (group === "permissions") {
      if (sub === "add")    return permissionsAdd(interaction, community);
      if (sub === "remove") return permissionsRemove(interaction, community);
      if (sub === "list")   return permissionsList(interaction, community);
    }
  },
};

// ── Shift Types ───────────────────────────────────────────────────────────────

async function shiftTypeAdd(interaction, community) {
  const name = interaction.options.getString("name", true).trim();
  const role = interaction.options.getRole("role");
  db.addShiftType(community.id, name, role?.id ?? null);

  const embed = baseEmbed(interaction.client, GREEN)
    .setTitle("Shift Type Added")
    .addFields(
      { name: "Name",   value: `\`${name}\``,                                       inline: true },
      { name: "Access", value: role ? `<@&${role.id}>` : "Everyone",                inline: true },
    )
    .setFooter({ text: "Shiftus" });

  return interaction.reply({ embeds: [embed] });
}

async function shiftTypeRemove(interaction, community) {
  const name   = interaction.options.getString("name", true).trim();
  const result = db.removeShiftType(community.id, name);

  if (result.changes === 0) {
    const embed = baseEmbed(interaction.client, RED)
      .setTitle("Not Found")
      .setDescription(`No shift type named **${name}** exists.`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const embed = baseEmbed(interaction.client)
    .setTitle("Shift Type Deactivated")
    .setDescription(`**${name}** has been deactivated. Past shifts logged under it are preserved.`)
    .setFooter({ text: "Shiftus" });

  return interaction.reply({ embeds: [embed] });
}

async function shiftTypeRestrict(interaction, community) {
  const name      = interaction.options.getString("name", true).trim();
  const role      = interaction.options.getRole("role");
  const shiftType = db.getShiftTypeByName(community.id, name);

  if (!shiftType) {
    const embed = baseEmbed(interaction.client, RED)
      .setTitle("Not Found")
      .setDescription(`No shift type named **${name}** found.`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  db.setShiftTypeRequiredRole(community.id, name, role?.id ?? null);

  const embed = baseEmbed(interaction.client, GREEN)
    .setTitle("Shift Type Updated")
    .addFields(
      { name: "Shift Type", value: `\`${shiftType.name}\``,                       inline: true },
      { name: "Access",     value: role ? `<@&${role.id}>` : "Everyone",           inline: true },
    )
    .setFooter({ text: "Shiftus" });

  return interaction.reply({ embeds: [embed] });
}

async function shiftTypeList(interaction, community) {
  const types = db.listShiftTypes(community.id);

  const embed = baseEmbed(interaction.client)
    .setTitle("Shift Types")
    .setFooter({ text: `${types.length} type${types.length !== 1 ? "s" : ""}  ·  Shiftus` });

  if (types.length === 0) {
    embed.setDescription("No shift types configured yet.\nUse `/admin shifttype add` to create one.");
    return interaction.reply({ embeds: [embed] });
  }

  embed.setDescription(
    types
      .map((t) =>
        t.required_role_id
          ? `🔒  **${t.name}** · restricted to <@&${t.required_role_id}>`
          : `🌐  **${t.name}** · open to everyone`
      )
      .join("\n")
  );

  return interaction.reply({ embeds: [embed] });
}

// ── Quotas ────────────────────────────────────────────────────────────────────

async function quotaSet(interaction, community) {
  const hours    = interaction.options.getNumber("hours", true);
  const typeName = interaction.options.getString("type");

  let shiftTypeId = null;
  if (typeName) {
    const shiftType = db.getShiftTypeByName(community.id, typeName);
    if (!shiftType) {
      const embed = baseEmbed(interaction.client, RED)
        .setTitle("Not Found")
        .setDescription(`No shift type named **${typeName}** found.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    shiftTypeId = shiftType.id;
  }

  db.setQuota(community.id, shiftTypeId, hours);

  const embed = baseEmbed(interaction.client, GREEN)
    .setTitle("Quota Updated")
    .addFields(
      { name: "Applies To", value: typeName ?? "Overall (all shift types)", inline: true },
      { name: "Required",   value: `**${hours}h** per week`,                inline: true },
    )
    .setFooter({ text: "Shiftus" });

  return interaction.reply({ embeds: [embed] });
}

async function quotaList(interaction, community) {
  const quotas = db.listQuotas(community.id);

  const embed = baseEmbed(interaction.client, GOLD)
    .setTitle("Weekly Quotas")
    .setFooter({ text: `${quotas.length} quota${quotas.length !== 1 ? "s" : ""}  ·  Shiftus` });

  if (quotas.length === 0) {
    embed.setDescription("No quotas set yet.\nUse `/admin quota set` to add one.");
    return interaction.reply({ embeds: [embed] });
  }

  embed.setDescription(
    quotas
      .map((q) => `⏱  **${q.shift_type_name ?? "Overall"}** · ${q.hours_required}h / week`)
      .join("\n")
  );

  return interaction.reply({ embeds: [embed] });
}

// ── Permissions ───────────────────────────────────────────────────────────────

async function permissionsAdd(interaction, community) {
  const role = interaction.options.getRole("role", true);
  const type = interaction.options.getString("type", true);
  db.addRolePermission(community.id, role.id, type);

  const label = type === "admin" ? "Admin" : "Add Time";
  const embed = baseEmbed(interaction.client, GREEN)
    .setTitle("Permission Granted")
    .addFields(
      { name: "Role",       value: `<@&${role.id}>`, inline: true },
      { name: "Permission", value: `**${label}**`,   inline: true },
    )
    .setFooter({ text: "Shiftus" });

  return interaction.reply({ embeds: [embed] });
}

async function permissionsRemove(interaction, community) {
  const role = interaction.options.getRole("role", true);
  const type = interaction.options.getString("type", true);
  db.removeRolePermission(community.id, role.id, type);

  const label = type === "admin" ? "Admin" : "Add Time";
  const embed = baseEmbed(interaction.client)
    .setTitle("Permission Revoked")
    .setDescription(`Removed **${label}** from <@&${role.id}>.\n-# If that role is also in the \`.env\` file, it still counts from there.`)
    .setFooter({ text: "Shiftus" });

  return interaction.reply({ embeds: [embed] });
}

async function permissionsList(interaction, community) {
  const adminRoles   = db.listRolePermissions(community.id, "admin");
  const addTimeRoles = db.listRolePermissions(community.id, "add_time");

  const embed = baseEmbed(interaction.client)
    .setTitle("Permissions")
    .addFields(
      {
        name:  "🛡️  Admin",
        value: adminRoles.length
          ? adminRoles.map((id) => `<@&${id}>`).join("  ·  ")
          : "_No roles granted_",
        inline: false,
      },
      SPACER,
      {
        name:  "✍️  Add Time",
        value: addTimeRoles.length
          ? addTimeRoles.map((id) => `<@&${id}>`).join("  ·  ")
          : "_No roles granted_",
        inline: false,
      }
    )
    .setFooter({ text: "Roles set in .env also count but aren't listed here  ·  Shiftus" });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}
