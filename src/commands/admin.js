const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../db");
const { baseEmbed } = require("../format");

function isAdmin(interaction) {
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const adminRoleIds = db.effectiveRoleIds("admin");
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
            .setDescription("Revoke a role's admin or add-time permission (only removes in-app grants, not .env)")
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
    const focused = interaction.options.getFocused().toLowerCase();
    const types = db.listShiftTypes();
    const filtered = types.filter((t) => t.name.toLowerCase().includes(focused)).slice(0, 25);
    await interaction.respond(filtered.map((t) => ({ name: t.name, value: t.name })));
  },

  async execute(interaction) {
    if (!isAdmin(interaction)) {
      return interaction.reply({
        content: "You don't have permission to use admin commands.",
        ephemeral: true,
      });
    }

    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    if (group === "shifttype") {
      if (sub === "add") return shiftTypeAdd(interaction);
      if (sub === "remove") return shiftTypeRemove(interaction);
      if (sub === "restrict") return shiftTypeRestrict(interaction);
      if (sub === "list") return shiftTypeList(interaction);
    }

    if (group === "quota") {
      if (sub === "set") return quotaSet(interaction);
      if (sub === "list") return quotaList(interaction);
    }

    if (group === "permissions") {
      if (sub === "add") return permissionsAdd(interaction);
      if (sub === "remove") return permissionsRemove(interaction);
      if (sub === "list") return permissionsList(interaction);
    }
  },
};

async function shiftTypeAdd(interaction) {
  const name = interaction.options.getString("name", true).trim();
  const role = interaction.options.getRole("role");
  db.addShiftType(name, role?.id ?? null);
  return interaction.reply({
    content: role
      ? `Added shift type **${name}**, restricted to the **${role.name}** role.`
      : `Added shift type **${name}**. Anyone can start it.`,
  });
}

async function shiftTypeRemove(interaction) {
  const name = interaction.options.getString("name", true).trim();
  const result = db.removeShiftType(name);
  if (result.changes === 0) {
    return interaction.reply({ content: `No shift type named **${name}** found.`, ephemeral: true });
  }
  return interaction.reply({ content: `Deactivated shift type **${name}**. Past shifts logged under it are kept.` });
}

async function shiftTypeRestrict(interaction) {
  const name = interaction.options.getString("name", true).trim();
  const role = interaction.options.getRole("role");
  const shiftType = db.getShiftTypeByName(name);
  if (!shiftType) {
    return interaction.reply({ content: `No shift type named **${name}** found.`, ephemeral: true });
  }

  db.setShiftTypeRequiredRole(name, role?.id ?? null);
  return interaction.reply({
    content: role
      ? `**${shiftType.name}** can now only be started by members with the **${role.name}** role.`
      : `**${shiftType.name}** is no longer restricted — anyone can start it.`,
  });
}

async function shiftTypeList(interaction) {
  const types = db.listShiftTypes();
  const embed = baseEmbed(interaction.client)
    .setTitle("Shift Types")
    .setDescription(
      types.length
        ? types
            .map((t) => `• ${t.name}${t.required_role_id ? ` — <@&${t.required_role_id}> only` : ""}`)
            .join("\n")
        : "No shift types configured yet."
    );
  return interaction.reply({ embeds: [embed] });
}

async function quotaSet(interaction) {
  const hours = interaction.options.getNumber("hours", true);
  const typeName = interaction.options.getString("type");

  let shiftTypeId = null;
  if (typeName) {
    const shiftType = db.getShiftTypeByName(typeName);
    if (!shiftType) {
      return interaction.reply({ content: `No shift type named **${typeName}** found.`, ephemeral: true });
    }
    shiftTypeId = shiftType.id;
  }

  db.setQuota(shiftTypeId, hours);
  return interaction.reply({
    content: `Weekly quota for **${typeName ?? "overall (all shift types combined)"}** set to **${hours}h**.`,
  });
}

async function quotaList(interaction) {
  const quotas = db.listQuotas();
  const embed = baseEmbed(interaction.client)
    .setTitle("Weekly Quotas")
    .setDescription(
      quotas.length
        ? quotas.map((q) => `• ${q.shift_type_name ?? "Overall"}: **${q.hours_required}h**`).join("\n")
        : "No quotas configured yet."
    );
  return interaction.reply({ embeds: [embed] });
}

async function permissionsAdd(interaction) {
  const role = interaction.options.getRole("role", true);
  const type = interaction.options.getString("type", true);
  db.addRolePermission(role.id, type);
  return interaction.reply({
    content: `**${role.name}** now has **${type === "admin" ? "Admin" : "Add Time"}** permission.`,
  });
}

async function permissionsRemove(interaction) {
  const role = interaction.options.getRole("role", true);
  const type = interaction.options.getString("type", true);
  db.removeRolePermission(role.id, type);
  return interaction.reply({
    content: `Removed **${type === "admin" ? "Admin" : "Add Time"}** permission from **${role.name}** (this only affects in-app grants — if that role is also listed in the .env file, it'll still have access from there).`,
  });
}

async function permissionsList(interaction) {
  const adminRoles = db.listRolePermissions("admin");
  const addTimeRoles = db.listRolePermissions("add_time");

  const embed = baseEmbed(interaction.client)
    .setTitle("Permissions")
    .addFields(
      {
        name: "Admin (granted in-app)",
        value: adminRoles.length ? adminRoles.map((id) => `<@&${id}>`).join("\n") : "None",
      },
      {
        name: "Add Time (granted in-app)",
        value: addTimeRoles.length ? addTimeRoles.map((id) => `<@&${id}>`).join("\n") : "None",
      }
    )
    .setFooter({ text: "Roles listed in the .env file also count, but aren't shown here." });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}
