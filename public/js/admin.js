(function () {
  "use strict";

  const { esc, formatDuration, avatarUrl, api } = window.DutyLog;

  let cachedRoles = [];

  async function loadMe() {
    const res = await api("/api/me");
    const me = await res.json();
    document.getElementById("avatar").src = avatarUrl(me);
    document.getElementById("username").textContent = me.username;
    return me;
  }

  function roleName(id) {
    return cachedRoles.find((r) => r.id === id)?.name ?? "Unknown role";
  }

  async function loadRoles() {
    const res = await api("/api/admin/roles");
    cachedRoles = await res.json();

    const options = cachedRoles.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("");
    document.getElementById("shifttype-role").innerHTML = `<option value="">Anyone can start it</option>${options}`;
    document.getElementById("admin-role-select").innerHTML = options;
    document.getElementById("addtime-role-select").innerHTML = options;
  }

  async function loadRoster() {
    const res = await api("/api/admin/roster");
    const data = await res.json();
    const body = document.getElementById("roster-body");
    const empty = document.getElementById("roster-empty");

    if (data.roster.length === 0) {
      body.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    body.innerHTML = data.roster
      .map((person) => {
        const hours = person.total_seconds / 3600;
        const met = data.quotaHours ? hours >= data.quotaHours : null;
        const quotaCell =
          data.quotaHours == null
            ? `<span class="pill neutral">No quota set</span>`
            : met
            ? `<span class="pill good">Met (${data.quotaHours}h)</span>`
            : `<span class="pill warn">${(data.quotaHours - hours).toFixed(1)}h short</span>`;
        return `<tr>
          <td style="display:flex; align-items:center; gap:10px;">
            <img class="avatar" style="width:22px;height:22px;" src="${avatarUrl(person)}" alt="" />
            ${esc(person.username)}
          </td>
          <td class="mono">${formatDuration(person.total_seconds)}</td>
          <td>${quotaCell}</td>
        </tr>`;
      })
      .join("");
  }

  async function loadShiftTypes() {
    const res = await api("/api/admin/shifttypes");
    const shiftTypes = await res.json();
    const body = document.getElementById("shifttypes-body");
    body.innerHTML = "";

    for (const t of shiftTypes) {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.textContent = t.name;

      const restrictTd = document.createElement("td");
      const select = document.createElement("select");
      select.className = "restrict-select";
      const anyOpt = document.createElement("option");
      anyOpt.value = "";
      anyOpt.textContent = "Anyone";
      select.appendChild(anyOpt);
      for (const r of cachedRoles) {
        const opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = r.name;
        opt.selected = r.id === t.required_role_id;
        select.appendChild(opt);
      }
      select.addEventListener("change", (e) => onRestrictShiftType(t.name, e.target.value));
      restrictTd.appendChild(select);

      const removeTd = document.createElement("td");
      removeTd.style.textAlign = "right";
      const removeBtn = document.createElement("button");
      removeBtn.className = "btn btn-ghost btn-danger";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => onRemoveShiftType(t.name));
      removeTd.appendChild(removeBtn);

      tr.append(nameTd, restrictTd, removeTd);
      body.appendChild(tr);
    }

    const quotaTypeSelect = document.getElementById("quota-type");
    quotaTypeSelect.innerHTML =
      `<option value="">Overall (all shift types)</option>` +
      shiftTypes.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  }

  async function loadQuotas() {
    const res = await api("/api/admin/quotas");
    const quotas = await res.json();
    document.getElementById("quotas-body").innerHTML = quotas
      .map((q) => `<tr><td>${esc(q.shift_type_name ?? "Overall")}</td><td class="mono">${q.hours_required}h</td></tr>`)
      .join("");
  }

  async function loadPermissions() {
    const res = await api("/api/admin/permissions");
    const data = await res.json();
    renderPermissionList("admin-roles-list", data.admin, "admin");
    renderPermissionList("addtime-roles-list", data.add_time, "add_time");
  }

  function renderPermissionList(containerId, roleIds, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    if (!roleIds || roleIds.length === 0) {
      const empty = document.createElement("span");
      empty.style.cssText = "font-size:13px; color: var(--muted);";
      empty.textContent = "No roles granted here yet.";
      container.appendChild(empty);
      return;
    }
    for (const roleId of roleIds) {
      const pill = document.createElement("span");
      pill.className = "pill neutral";
      pill.style.cssText = "margin-right:8px; margin-bottom:8px; display:inline-flex; align-items:center; gap:6px;";
      pill.append(document.createTextNode(roleName(roleId) + " "));

      const removeBtn = document.createElement("button");
      removeBtn.style.cssText = "background:none;border:none;color:inherit;cursor:pointer;font-weight:700;padding:0;";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => onRevokePermission(roleId, type));
      pill.appendChild(removeBtn);

      container.appendChild(pill);
    }
  }

  async function onAddShiftType(e) {
    e.preventDefault();
    const input = document.getElementById("shifttype-name");
    const roleSelect = document.getElementById("shifttype-role");
    const name = input.value.trim();
    if (!name) return;

    await api("/api/admin/shifttypes", {
      method: "POST",
      body: JSON.stringify({ name, requiredRoleId: roleSelect.value || null }),
    });
    input.value = "";
    roleSelect.value = "";
    await loadShiftTypes();
  }

  async function onRemoveShiftType(name) {
    if (!confirm(`Remove shift type "${name}"? Past shifts logged under it are kept.`)) return;
    await api(`/api/admin/shifttypes/${encodeURIComponent(name)}`, { method: "DELETE" });
    await Promise.all([loadShiftTypes(), loadQuotas(), loadRoster()]);
  }

  async function onRestrictShiftType(name, roleId) {
    await api(`/api/admin/shifttypes/${encodeURIComponent(name)}/restrict`, {
      method: "POST",
      body: JSON.stringify({ roleId: roleId || null }),
    });
  }

  async function onSetQuota(e) {
    e.preventDefault();
    const typeSelect = document.getElementById("quota-type");
    const hoursInput = document.getElementById("quota-hours");
    const shiftTypeId = typeSelect.value ? Number(typeSelect.value) : null;
    const hours = Number(hoursInput.value);
    if (Number.isNaN(hours)) return;

    await api("/api/admin/quotas", {
      method: "POST",
      body: JSON.stringify({ shiftTypeId, hours }),
    });
    hoursInput.value = "";
    await Promise.all([loadQuotas(), loadRoster()]);
  }

  async function onGrantPermission(type) {
    const select = document.getElementById(type === "admin" ? "admin-role-select" : "addtime-role-select");
    const roleId = select.value;
    if (!roleId) return;

    await api("/api/admin/permissions", {
      method: "POST",
      body: JSON.stringify({ roleId, type }),
    });
    await loadPermissions();
  }

  async function onRevokePermission(roleId, type) {
    await api("/api/admin/permissions", {
      method: "DELETE",
      body: JSON.stringify({ roleId, type }),
    });
    await loadPermissions();
  }

  function wireLogout() {
    document.getElementById("logout").addEventListener("click", async () => {
      await fetch("/auth/logout", { method: "POST" });
      location.href = "/";
    });
  }

  async function init() {
    wireLogout();
    const me = await loadMe();

    if (!me.isAdmin) {
      document.getElementById("denied").style.display = "block";
      return;
    }
    document.getElementById("admin-content").style.display = "block";

    await loadRoles();
    await Promise.all([loadRoster(), loadShiftTypes(), loadQuotas(), loadPermissions()]);

    document.getElementById("shifttype-form").addEventListener("submit", onAddShiftType);
    document.getElementById("quota-form").addEventListener("submit", onSetQuota);
    document.getElementById("admin-role-add").addEventListener("click", () => onGrantPermission("admin"));
    document.getElementById("addtime-role-add").addEventListener("click", () => onGrantPermission("add_time"));
  }

  init();
})();
