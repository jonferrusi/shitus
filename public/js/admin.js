(function () {
  "use strict";

  const { esc, formatDuration, api, loadCommunities, renderCommunitySwitcher } = window.Shiftus;

  let communityId = null;
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
        </tr>`;
      })
      .join("");
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
          const met = hours >= quotaHours;
          quotaCell = `<span class="pill ${met ? "good" : "warn"}">${met ? "Met" : "Below"}</span> ${hours.toFixed(1)}/${quotaHours}h`;
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
    const select = document.getElementById("admin-add-member");
    select.innerHTML = members.map((m) => `<option value="${m.discord_id}">${esc(m.username)}</option>`).join("");
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

  async function loadQuotas() {
    const res = await api(`/api/communities/${communityId}/admin/quotas`);
    const quotas = res.ok ? await res.json() : [];
    const body = document.getElementById("quotas-body");
    body.innerHTML = quotas
      .map(
        (q) => `<tr>
          <td>${esc(q.shift_type_name ?? "Overall")}</td>
          <td class="mono">${q.hours_required}h</td>
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
      await api(`/api/communities/${communityId}/admin/quotas`, {
        method: "POST",
        body: JSON.stringify({ shiftTypeId: typeVal ? Number(typeVal) : null, hours }),
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

  async function loadCommunityAndRefresh() {
    stopPolling();
    if (!communityId) {
      showState("no-community");
      return;
    }

    const detailRes = await api(`/api/communities/${communityId}`);
    if (!detailRes.ok) {
      showState("no-community");
      return;
    }
    const detail = await detailRes.json();
    if (!detail.isAdmin) {
      showState("denied");
      return;
    }

    showState("ok");
    await loadRoles();
    await Promise.all([loadActive(), loadRoster(), loadMembers(), loadShiftTypes(), loadQuotas(), loadPermissions()]);

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
    await loadCommunityAndRefresh();
  }

  init();
})();
