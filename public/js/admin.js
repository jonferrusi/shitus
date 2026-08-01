(function () {
  "use strict";

  const { esc, formatDuration, api, loadCommunities, renderCommunitySwitcher } = window.Shiftus;

  let communityId = null;
  let community = null;
  let roles = [];
  let shiftTypes = [];
  let members = [];
  let pollHandles = [];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatElapsed(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  }

  function hourOptions(selectedHour) {
    return Array.from({ length: 24 }, (_, h) => {
      const label = h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;
      return `<option value="${h}"${h === selectedHour ? " selected" : ""}>${label}</option>`;
    }).join("");
  }

  async function loadMe() {
    const res = await api("/api/me");
    if (!res.ok) return null;
    const me = await res.json();
    document.getElementById("avatar").src = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;
    document.getElementById("username").textContent = me.username;
    return me;
  }

  function roleOptions(selectedId) {
    return roles
      .map((r) => `<option value="${r.id}"${r.id === selectedId ? " selected" : ""}>${esc(r.name)}</option>`)
      .join("");
  }

  async function loadRoles() {
    const res = await api(`/api/communities/${communityId}/admin/roles`);
    roles = res.ok ? await res.json() : [];
  }

  async function loadActive() {
    const res = await api(`/api/communities/${communityId}/admin/active`);
    const active = res.ok ? await res.json() : [];
    const body = document.getElementById("active-body");
    const empty = document.getElementById("active-empty");
    if (!active.length) {
      body.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    const now = Math.floor(Date.now() / 1000);
    body.innerHTML = active
      .map((s) => {
        let breakSeconds = s.total_break_seconds || 0;
        if (s.break_start) breakSeconds += now - s.break_start;
        const elapsed = now - s.start_time - breakSeconds;
        const status = s.break_start ? ' <span class="pill neutral">Break</span>' : "";
        return `<tr>
          <td>${esc(s.username || s.discord_id)}${status}</td>
          <td>${esc(s.shift_type_name)}</td>
          <td class="mono">${formatElapsed(elapsed)}</td>
          <td><button class="btn btn-danger" data-force-end="${s.id}">Force End</button></td>
        </tr>`;
      })
      .join("");

    body.querySelectorAll("[data-force-end]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("End this shift now? The member will be DMed.")) return;
        btn.disabled = true;
        await api(`/api/communities/${communityId}/admin/active/${btn.dataset.forceEnd}/force-end`, { method: "POST" });
        await loadActive();
      });
    });
  }

  async function loadRoster() {
    const res = await api(`/api/communities/${communityId}/admin/roster`);
    const body = document.getElementById("roster-body");
    const empty = document.getElementById("roster-empty");
    if (!res.ok) return;
    const { quotaHours, roster } = await res.json();
    const withHours = roster.filter((r) => r.total_seconds > 0);
    if (!withHours.length) {
      body.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    body.innerHTML = withHours
      .map((r) => {
        const hours = r.total_seconds / 3600;
        let quotaCell = "—";
        if (quotaHours != null) {
          quotaCell = `<span class="pill ${r.quota_met ? "good" : "warn"}">${r.quota_met ? "Met" : "Below"}</span> ${(r.quota_seconds / 3600).toFixed(1)}/${quotaHours}h`;
        }
        return `<tr>
          <td>${esc(r.username || r.discord_id)}</td>
          <td>${esc(r.primary_type || "—")}</td>
          <td class="mono">${formatDuration(r.total_seconds)}</td>
          <td>${quotaCell}</td>
        </tr>`;
      })
      .join("");
  }

  async function loadMembers() {
    const res = await api(`/api/communities/${communityId}/admin/members`);
    members = res.ok ? await res.json() : [];
    const options = members.map((m) => `<option value="${m.discord_id}">${esc(m.username)}</option>`).join("");
    document.getElementById("admin-add-member").innerHTML = options;
    document.getElementById("admin-remove-member").innerHTML = options;
    document.getElementById("reminder-send-member").innerHTML = options;
  }

  async function loadShiftTypes() {
    const res = await api(`/api/communities/${communityId}/admin/shifttypes`);
    shiftTypes = res.ok ? await res.json() : [];

    document.getElementById("admin-add-type").innerHTML = shiftTypes
      .filter((t) => t.active)
      .map((t) => `<option value="${t.id}">${esc(t.name)}</option>`)
      .join("");

    const quotaTypeSelect = document.getElementById("quota-type");
    quotaTypeSelect.innerHTML =
      `<option value="">Overall (all types)</option>` +
      shiftTypes.filter((t) => t.active).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");

    const body = document.getElementById("shifttypes-body");
    body.innerHTML = shiftTypes
      .filter((t) => t.active)
      .map(
        (t) => `<tr>
          <td>${esc(t.name)}</td>
          <td>
            <select data-restrict="${esc(t.name)}">
              <option value="">Everyone</option>
              ${roleOptions(t.required_role_id)}
            </select>
          </td>
          <td><button class="btn btn-danger" data-remove-type="${esc(t.name)}">Remove</button></td>
        </tr>`
      )
      .join("");

    body.querySelectorAll("[data-restrict]").forEach((select) => {
      select.addEventListener("change", async () => {
        await api(`/api/communities/${communityId}/admin/shifttypes/${encodeURIComponent(select.dataset.restrict)}/restrict`, {
          method: "POST",
          body: JSON.stringify({ roleId: select.value || null }),
        });
      });
    });

    body.querySelectorAll("[data-remove-type]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api(`/api/communities/${communityId}/admin/shifttypes/${encodeURIComponent(btn.dataset.removeType)}`, {
          method: "DELETE",
        });
        await Promise.all([loadShiftTypes(), loadQuotas()]);
      });
    });

    document.getElementById("shifttype-role").innerHTML = `<option value="">Everyone</option>${roleOptions()}`;
  }

  const PERIOD_LABEL = { weekly: "Weekly", biweekly: "Biweekly", monthly: "Monthly" };

  async function loadQuotas() {
    const res = await api(`/api/communities/${communityId}/admin/quotas`);
    const quotas = res.ok ? await res.json() : [];
    const body = document.getElementById("quotas-body");
    body.innerHTML = quotas
      .map(
        (q) => `<tr>
          <td>${esc(q.shift_type_name ?? "Overall")}</td>
          <td class="mono">${q.hours_required}h</td>
          <td>${PERIOD_LABEL[q.period] || "Weekly"}</td>
          <td><button class="btn btn-danger" data-remove-quota="${q.shift_type_id ?? "overall"}">Remove</button></td>
        </tr>`
      )
      .join("");

    body.querySelectorAll("[data-remove-quota]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api(`/api/communities/${communityId}/admin/quotas/${btn.dataset.removeQuota}`, { method: "DELETE" });
        await loadQuotas();
      });
    });
  }

  async function loadPermissions() {
    const res = await api(`/api/communities/${communityId}/admin/permissions`);
    if (!res.ok) return;
    const { admin, add_time } = await res.json();

    function renderList(containerId, roleIds, type) {
      const container = document.getElementById(containerId);
      if (!roleIds.length) {
        container.innerHTML = `<span class="empty" style="padding:4px 0;">No roles granted</span>`;
        return;
      }
      container.innerHTML = roleIds
        .map((id) => {
          const role = roles.find((r) => r.id === id);
          return `<span class="pill neutral" style="margin:0 6px 6px 0; display:inline-flex; align-items:center; gap:6px;">
            ${esc(role ? role.name : id)}
            <button data-revoke="${id}" data-type="${type}" style="all:unset;cursor:pointer;color:var(--warn);">×</button>
          </span>`;
        })
        .join("");
      container.querySelectorAll("[data-revoke]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await api(`/api/communities/${communityId}/admin/permissions`, {
            method: "DELETE",
            body: JSON.stringify({ roleId: btn.dataset.revoke, type: btn.dataset.type }),
          });
          await loadPermissions();
        });
      });
    }

    renderList("perm-admin-list", admin, "admin");
    renderList("perm-addtime-list", add_time, "add_time");

    document.getElementById("perm-role").innerHTML = roleOptions();
  }

  // ---------------------------------------------------------------------
  // Week schedule
  // ---------------------------------------------------------------------

  function renderSchedule() {
    document.getElementById("schedule-day").value = String(community.weekStartDay ?? 1);
    document.getElementById("schedule-hour").innerHTML = hourOptions(community.weekStartHour ?? 0);
  }

  function wireSchedule() {
    document.getElementById("schedule-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const weekStartDay = Number(document.getElementById("schedule-day").value);
      const weekStartHour = Number(document.getElementById("schedule-hour").value);
      const msg = document.getElementById("schedule-message");

      const res = await api(`/api/communities/${communityId}/admin/schedule`, {
        method: "POST",
        body: JSON.stringify({ weekStartDay, weekStartHour }),
      });
      msg.style.display = "block";
      msg.style.color = res.ok ? "var(--good)" : "var(--warn)";
      msg.textContent = res.ok ? "Schedule saved." : "Couldn't save schedule.";
    });

    document.getElementById("force-end-week-btn").addEventListener("click", async () => {
      if (!confirm("End the current week now and start a fresh one? This saves a report of the week so far.")) return;
      await api(`/api/communities/${communityId}/admin/schedule/force-end-week`, { method: "POST" });
      await Promise.all([loadRoster(), loadCommunityAndRefresh()]);
    });
  }

  // ---------------------------------------------------------------------
  // Quota reminders
  // ---------------------------------------------------------------------

  function renderReminders() {
    const daySelect = document.getElementById("reminder-day");
    daySelect.value = community.reminderDay == null ? "" : String(community.reminderDay);
    document.getElementById("reminder-hour").innerHTML = hourOptions(community.reminderHour ?? 0);
    document.getElementById("reminder-threshold").value = community.reminderThresholdHours ?? "";
  }

  function wireReminders() {
    document.getElementById("reminders-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const dayVal = document.getElementById("reminder-day").value;
      const reminderHour = Number(document.getElementById("reminder-hour").value);
      const reminderThresholdHours = Number(document.getElementById("reminder-threshold").value || 0);
      const msg = document.getElementById("reminders-message");

      const res = await api(`/api/communities/${communityId}/admin/reminders`, {
        method: "POST",
        body: JSON.stringify({ reminderDay: dayVal === "" ? null : Number(dayVal), reminderHour, reminderThresholdHours }),
      });
      msg.style.display = "block";
      msg.style.color = res.ok ? "var(--good)" : "var(--warn)";
      msg.textContent = res.ok ? "Reminder settings saved." : "Couldn't save reminder settings.";
    });

    document.getElementById("reminder-send-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const discordId = document.getElementById("reminder-send-member").value;
      const msg = document.getElementById("reminder-send-message");

      const res = await api(`/api/communities/${communityId}/admin/reminders/send`, {
        method: "POST",
        body: JSON.stringify({ discordId }),
      });
      const body = await res.json().catch(() => ({}));
      msg.style.display = "block";
      if (res.ok && body.sent) {
        msg.style.color = "var(--good)";
        msg.textContent = "Reminder sent.";
      } else {
        msg.style.color = "var(--warn)";
        msg.textContent = "Nothing to remind — they may not have an overall quota, or already met it.";
      }
    });
  }

  // ---------------------------------------------------------------------
  // On-shift roles
  // ---------------------------------------------------------------------

  function renderRoleConfig() {
    document.getElementById("role-onshift").innerHTML = `<option value="">None</option>${roleOptions(community.onShiftRoleId)}`;
    document.getElementById("role-supervisor").innerHTML = `<option value="">None</option>${roleOptions(community.supervisorCheckRoleId)}`;
    document.getElementById("role-activesupervisor").innerHTML = `<option value="">None</option>${roleOptions(community.activeSupervisorRoleId)}`;
    document.getElementById("role-loa").innerHTML = `<option value="">None</option>${roleOptions(community.loaRoleId)}`;
  }

  function wireRoleConfig() {
    document.getElementById("role-config-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("role-config-message");
      const res = await api(`/api/communities/${communityId}/admin/role-config`, {
        method: "POST",
        body: JSON.stringify({
          onShiftRoleId: document.getElementById("role-onshift").value || null,
          supervisorCheckRoleId: document.getElementById("role-supervisor").value || null,
          activeSupervisorRoleId: document.getElementById("role-activesupervisor").value || null,
          loaRoleId: document.getElementById("role-loa").value || null,
        }),
      });
      msg.style.display = "block";
      msg.style.color = res.ok ? "var(--good)" : "var(--warn)";
      msg.textContent = res.ok ? "Roles saved." : "Couldn't save roles.";
    });
  }

  // ---------------------------------------------------------------------
  // LOA requests
  // ---------------------------------------------------------------------

  function showLoaTab(tab) {
    document.getElementById("loa-tab-pending").className = tab === "pending" ? "btn" : "btn btn-ghost";
    document.getElementById("loa-tab-history").className = tab === "history" ? "btn" : "btn btn-ghost";
    document.getElementById("loa-pending-view").style.display = tab === "pending" ? "" : "none";
    document.getElementById("loa-history-view").style.display = tab === "history" ? "" : "none";
  }

  async function loadLoaPending() {
    const res = await api(`/api/communities/${communityId}/admin/loa/pending`);
    const requests = res.ok ? await res.json() : [];
    const body = document.getElementById("loa-pending-body");
    const empty = document.getElementById("loa-pending-empty");

    if (!requests.length) {
      body.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    body.innerHTML = requests
      .map((r) => {
        const member = members.find((m) => m.discord_id === r.discord_id);
        return `<tr>
          <td>${esc(member ? member.username : r.discord_id)}</td>
          <td>${esc(r.reason)}</td>
          <td class="mono">${r.duration_days}</td>
          <td>${new Date(r.submitted_at * 1000).toLocaleDateString()}</td>
          <td>
            <button class="btn" data-approve="${r.id}" style="color:var(--good);">Approve</button>
            <button class="btn btn-danger" data-deny="${r.id}">Deny</button>
          </td>
        </tr>`;
      })
      .join("");

    body.querySelectorAll("[data-approve]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const res = await api(`/api/communities/${communityId}/admin/loa/${btn.dataset.approve}/approve`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        const warning = document.getElementById("loa-warning");
        if (body.warning) {
          warning.style.display = "block";
          warning.textContent = body.warning;
        } else {
          warning.style.display = "none";
        }
        await loadLoaPending();
      });
    });

    body.querySelectorAll("[data-deny]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await api(`/api/communities/${communityId}/admin/loa/${btn.dataset.deny}/deny`, { method: "POST" });
        await loadLoaPending();
      });
    });
  }

  async function loadLoaHistory() {
    const res = await api(`/api/communities/${communityId}/admin/loa/history`);
    const requests = res.ok ? await res.json() : [];
    const body = document.getElementById("loa-history-body");
    const empty = document.getElementById("loa-history-empty");

    if (!requests.length) {
      body.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    body.innerHTML = requests
      .map((r) => {
        const member = members.find((m) => m.discord_id === r.discord_id);
        const reviewer = members.find((m) => m.discord_id === r.reviewer_id);
        return `<tr>
          <td>${esc(member ? member.username : r.discord_id)}</td>
          <td><span class="pill ${r.status === "approved" ? "good" : "warn"}">${esc(r.status)}</span></td>
          <td>${esc(reviewer ? reviewer.username : r.reviewer_id || "—")}</td>
          <td>${r.reviewed_at ? new Date(r.reviewed_at * 1000).toLocaleDateString() : "—"}</td>
        </tr>`;
      })
      .join("");
  }

  function wireLoa() {
    document.getElementById("loa-tab-pending").addEventListener("click", () => {
      showLoaTab("pending");
      loadLoaPending();
    });
    document.getElementById("loa-tab-history").addEventListener("click", () => {
      showLoaTab("history");
      loadLoaHistory();
    });
  }

  // ---------------------------------------------------------------------
  // Weekly reports
  // ---------------------------------------------------------------------

  function formatWeekLabel(weekStart) {
    return new Date(weekStart * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  async function loadReportWeekOptions(selectWeekStart) {
    const select = document.getElementById("report-week-select");
    const [savedRes, currentRes] = await Promise.all([
      api(`/api/communities/${communityId}/admin/reports`),
      api(`/api/communities/${communityId}/admin/reports/current`),
    ]);
    const saved = savedRes.ok ? await savedRes.json() : [];
    const current = currentRes.ok ? await currentRes.json() : null;

    const weekStarts = new Set(saved.map((r) => r.week_start));
    const options = saved.map((r) => ({ weekStart: r.week_start, label: formatWeekLabel(r.week_start) }));
    if (current && !weekStarts.has(current.weekStart)) {
      options.unshift({ weekStart: current.weekStart, label: `${formatWeekLabel(current.weekStart)} (in progress)` });
    }

    select.innerHTML = options.map((o) => `<option value="${o.weekStart}">${o.label}</option>`).join("");
    const target = selectWeekStart ?? (current ? current.weekStart : options[0]?.weekStart);
    if (target != null) select.value = String(target);
    return target;
  }

  function renderReport(report) {
    const summary = document.getElementById("report-summary");
    const { data } = report;
    summary.innerHTML = `
      <div style="display:flex; gap:32px; flex-wrap:wrap;">
        <div><div class="ticket-label">Total Hours</div><div class="ticket-type" style="font-size:18px;">${formatDuration(data.totalSeconds)}</div></div>
        <div><div class="ticket-label">Active Members</div><div class="ticket-type" style="font-size:18px;">${data.activeMembers}</div></div>
        ${
          data.quotaHours != null
            ? `<div><div class="ticket-label">Met Quota</div><div class="ticket-type" style="font-size:18px;">${data.metQuota} / ${data.activeMembers}</div></div>`
            : ""
        }
      </div>
    `;

    const withHours = data.roster.filter((r) => r.total_seconds > 0);
    const body = document.getElementById("report-body");
    const empty = document.getElementById("report-empty");
    if (!withHours.length) {
      body.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    body.innerHTML = withHours
      .map((r) => {
        const hours = r.total_seconds / 3600;
        let quotaCell = "—";
        if (data.quotaHours != null) {
          const met = hours >= data.quotaHours;
          quotaCell = `<span class="pill ${met ? "good" : "warn"}">${met ? "Met" : "Below"}</span> ${hours.toFixed(1)}/${data.quotaHours}h`;
        }
        return `<tr>
          <td>${esc(r.username || r.discord_id)}</td>
          <td>${esc(r.primary_type || "—")}</td>
          <td class="mono">${formatDuration(r.total_seconds)}</td>
          <td>${quotaCell}</td>
        </tr>`;
      })
      .join("");
  }

  async function loadReportForWeek(weekStart) {
    const res = await api(`/api/communities/${communityId}/admin/reports/${weekStart}`);
    if (!res.ok) return;
    renderReport(await res.json());
  }

  function wireReports() {
    document.getElementById("report-week-select").addEventListener("change", (e) => {
      loadReportForWeek(e.target.value);
    });

    document.getElementById("report-jump-btn").addEventListener("click", async () => {
      const date = document.getElementById("report-jump-date").value;
      if (!date) return;
      const res = await api(`/api/communities/${communityId}/admin/reports/for-date/${date}`);
      if (!res.ok) return;
      const { weekStart } = await res.json();
      await loadReportWeekOptions(weekStart);
      await loadReportForWeek(weekStart);
    });

    document.getElementById("report-regenerate-btn").addEventListener("click", async () => {
      const weekStart = document.getElementById("report-week-select").value;
      if (!weekStart) return;
      const res = await api(`/api/communities/${communityId}/admin/reports/${weekStart}/regenerate`, { method: "POST" });
      if (res.ok) renderReport(await res.json());
    });
  }

  async function loadReports() {
    const weekStart = await loadReportWeekOptions();
    if (weekStart != null) await loadReportForWeek(weekStart);
  }

  // ---------------------------------------------------------------------

  function wireForms() {
    document.getElementById("admin-add-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const discordId = document.getElementById("admin-add-member").value;
      const shiftTypeId = Number(document.getElementById("admin-add-type").value);
      const date = document.getElementById("admin-add-date").value;
      const hours = Number(document.getElementById("admin-add-hours").value);
      const msg = document.getElementById("admin-add-message");

      const res = await api(`/api/communities/${communityId}/admin/shifts/manual`, {
        method: "POST",
        body: JSON.stringify({ discordId, shiftTypeId, date, hours }),
      });

      msg.style.display = "block";
      if (res.ok) {
        msg.style.color = "var(--good)";
        msg.textContent = "Time added.";
        e.target.reset();
        await loadRoster();
      } else {
        const body = await res.json().catch(() => ({}));
        msg.style.color = "var(--warn)";
        msg.textContent = `Couldn't add time (${body.error || "unknown error"}).`;
      }
    });

    document.getElementById("admin-remove-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const discordId = document.getElementById("admin-remove-member").value;
      const hours = Number(document.getElementById("admin-remove-hours").value);
      const msg = document.getElementById("admin-remove-message");

      const res = await api(`/api/communities/${communityId}/admin/shifts/remove`, {
        method: "POST",
        body: JSON.stringify({ discordId, hours }),
      });

      msg.style.display = "block";
      if (res.ok) {
        const body = await res.json();
        msg.style.color = "var(--good)";
        msg.textContent = `Removed ${body.hoursRemoved.toFixed(2)}h.`;
        e.target.reset();
        await loadRoster();
      } else {
        msg.style.color = "var(--warn)";
        msg.textContent = "Couldn't remove time.";
      }
    });

    document.getElementById("shifttype-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("shifttype-name").value.trim();
      const requiredRoleId = document.getElementById("shifttype-role").value || null;
      if (!name) return;
      await api(`/api/communities/${communityId}/admin/shifttypes`, {
        method: "POST",
        body: JSON.stringify({ name, requiredRoleId }),
      });
      e.target.reset();
      await Promise.all([loadShiftTypes(), loadQuotas()]);
    });

    document.getElementById("quota-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const typeVal = document.getElementById("quota-type").value;
      const hours = Number(document.getElementById("quota-hours").value);
      const period = document.getElementById("quota-period").value;
      await api(`/api/communities/${communityId}/admin/quotas`, {
        method: "POST",
        body: JSON.stringify({ shiftTypeId: typeVal ? Number(typeVal) : null, hours, period }),
      });
      e.target.reset();
      await loadQuotas();
    });

    document.getElementById("perm-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const roleId = document.getElementById("perm-role").value;
      const type = document.getElementById("perm-type").value;
      if (!roleId) return;
      await api(`/api/communities/${communityId}/admin/permissions`, {
        method: "POST",
        body: JSON.stringify({ roleId, type }),
      });
      await loadPermissions();
    });

    document.getElementById("logout").addEventListener("click", async () => {
      await fetch("/auth/logout", { method: "POST" });
      location.href = "/";
    });

    wireSchedule();
    wireReminders();
    wireRoleConfig();
    wireLoa();
    wireReports();
  }

  function stopPolling() {
    pollHandles.forEach(clearInterval);
    pollHandles = [];
  }

  function showState(state) {
    document.getElementById("denied").style.display = state === "denied" ? "block" : "none";
    document.getElementById("no-community").style.display = state === "no-community" ? "block" : "none";
    document.getElementById("admin-content").style.display = state === "ok" ? "" : "none";
  }

  function renderBillingBanner(subscriptionStatus) {
    const banner = document.getElementById("billing-banner");
    const text = document.getElementById("billing-banner-text");
    if (subscriptionStatus === "active") {
      banner.style.display = "none";
      return;
    }
    banner.style.display = "";
    text.textContent =
      subscriptionStatus === "past_due"
        ? "This community's subscription payment is past due — bot features will be disabled soon unless it's resolved."
        : "This community doesn't have an active subscription — bot features (clocking on, logging time) are disabled.";
  }

  function wireBilling() {
    document.getElementById("billing-subscribe-btn").addEventListener("click", async () => {
      const res = await api(`/api/communities/${communityId}/billing/checkout`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) {
        location.href = body.url;
      } else {
        alert("Couldn't start checkout. Billing may not be configured yet.");
      }
    });

    const params = new URLSearchParams(location.search);
    if (params.get("stripe") === "success") {
      alert("Thanks! Your subscription is being activated — this can take a few seconds to show up.");
    }
  }

  async function loadCommunityAndRefresh() {
    stopPolling();
    if (!communityId) {
      document.getElementById("billing-banner").style.display = "none";
      showState("no-community");
      return;
    }

    const detailRes = await api(`/api/communities/${communityId}`);
    if (!detailRes.ok) {
      document.getElementById("billing-banner").style.display = "none";
      showState("no-community");
      return;
    }
    community = await detailRes.json();
    if (!community.isAdmin) {
      document.getElementById("billing-banner").style.display = "none";
      showState("denied");
      return;
    }

    renderBillingBanner(community.subscriptionStatus);
    showState("ok");
    await loadRoles();
    await Promise.all([loadActive(), loadRoster(), loadMembers(), loadShiftTypes(), loadQuotas(), loadPermissions()]);
    renderSchedule();
    renderReminders();
    renderRoleConfig();
    showLoaTab("pending");
    await loadLoaPending();
    await loadReports();

    pollHandles.push(setInterval(loadActive, 15000));
    pollHandles.push(setInterval(loadRoster, 60000));
  }

  async function init() {
    const me = await loadMe();
    if (!me) return;

    const communities = await loadCommunities();
    const select = document.getElementById("community-select");

    if (!communities.length) {
      showState("no-community");
      return;
    }

    communityId = renderCommunitySwitcher(select, communities, async (newId) => {
      communityId = newId;
      await loadCommunityAndRefresh();
    });

    wireForms();
    wireBilling();
    await loadCommunityAndRefresh();
  }

  init();
})();
