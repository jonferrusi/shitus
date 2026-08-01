const db = require("./db");
const discordApi = require("./discordApi");
const { formatDuration } = require("./format");

/** Whether a member (given their current role IDs) counts as a supervisor for this community. */
function isSupervisor(community, memberRoleIds) {
  return !!community.supervisor_check_role_id && memberRoleIds.includes(community.supervisor_check_role_id);
}

/**
 * Assigns/removes a community's configured on-shift roles for one member.
 * Best-effort and non-blocking — role config is optional, and failures
 * (missing Manage Roles, role hierarchy) are logged, not thrown, so they
 * never stop a shift from actually starting/ending.
 */
async function syncOnShiftRoles(community, discordId, memberRoleIds, onShift) {
  const { guild_id: guildId, on_shift_role_id: onShiftRoleId, active_supervisor_role_id: activeSupervisorRoleId } = community;

  if (onShift) {
    if (onShiftRoleId) await discordApi.addMemberRole(guildId, discordId, onShiftRoleId);
    if (activeSupervisorRoleId && isSupervisor(community, memberRoleIds)) {
      await discordApi.addMemberRole(guildId, discordId, activeSupervisorRoleId);
    }
  } else {
    // Always remove both on clock-off, regardless of current roles — cheap,
    // idempotent, and guarantees no on-shift role survives a forced end.
    if (onShiftRoleId) await discordApi.removeMemberRole(guildId, discordId, onShiftRoleId);
    if (activeSupervisorRoleId) await discordApi.removeMemberRole(guildId, discordId, activeSupervisorRoleId);
  }
}

/**
 * Ends someone else's active shift (admin "Force End", from either the bot's
 * /activeshifts command or the admin panel): closes the shift, removes
 * on-shift roles, and DMs the member explaining what happened and by whom.
 * Returns the shift's duration in seconds.
 */
async function forceEndShift(community, shift, endedByLabel) {
  const duration = db.clockOff(shift.id);

  const member = await discordApi.getGuildMember(community.guild_id, shift.discord_id);
  await syncOnShiftRoles(community, shift.discord_id, member?.roles || [], false);

  await discordApi.sendDM(shift.discord_id, {
    embeds: [
      {
        title: "Your shift was ended",
        description:
          `Your **${shift.shift_type_name}** shift in **${community.name}** was force-ended by **${endedByLabel}**.\n\n` +
          `Total duration: **${formatDuration(duration)}**.`,
        color: 0xc9605a,
      },
    ],
  });

  return duration;
}

module.exports = { isSupervisor, syncOnShiftRoles, forceEndShift };
