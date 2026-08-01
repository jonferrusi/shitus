(function () {
  "use strict";

  const { esc, formatDuration, formatClock, api, setSelectedCommunityId, loadCommunities, renderCommunitySwitcher } =
    window.Shiftus;

  let me = null;
  let communityId = null;
  let myTypes = [];
  let activeShift = null; // raw shift row from /api/summary, or null
  let timerInterval = null;

  async function loadMe() {
    const res = await api("/api/me");
    if (!res.ok) return;
    me = await res.json();
    document.getElementById("avatar").src = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;
    document.getElementById("username").textContent = me.username;
  }

  // ---------------------------------------------------------------------
  // Community switcher + join/create
  // ---------------------------------------------------------------------

  async function refreshCommunitySwitcher() {
    const communities = await loadCommunities();
    const select = document.getElementById("community-select");

    if (!communities.length) {
      document.getElementById("empty-state").style.display = "";
      document.getElementById("app-content").style.display = "none";
      document.getElementById("admin-link").style.display = "none";
      select.innerHTML = "";
      communityId = null;
      return;
    }

    document.getElementById("empty-state").style.display = "none";
    document.getElementById("app-content").style.display = "";

    communityId = renderCommunitySwitcher(select, communities, async (newId) => {
      communityId = newId;
      await loadCommunityAndRefresh();
    });

    await loadCommunityAndRefresh();
  }

  async function loadCommunityAndRefresh() {
    if (!communityId) return;
    const res = await api(`/api/communities/${communityId}`);
    if (!res.ok) return;
    const detail = await res.json();
    document.getElementById("admin-link").style.display = detail.isAdmin ? "" : "none";
    const logSection = document.getElementById("log-time-section");
    if (logSection) logSection.style.display = detail.canAddTime ? "" : "none";

    await loadMyTypes();
    await refreshAll();
  }

  function wireAddCommunityPanel() {
    const btn = document.getElementById("add-community-btn");
    const panel = document.getElementById("add-community-panel");
    btn.addEventListener("click", async () => {
      const showing = panel.style.display !== "none";
      panel.style.display = showing ? "none" : "";
      if (!showing) await loadEligibleGuilds();
    });

    document.getElementById("join-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const slug = document.getElementById("join-slug").value.trim();
      const msg = document.getElementById("join-message");
      const res = await api("/api/communities/join", { method: "POST", body: JSON.stringify({ slug }) });
      const body = await res.json().catch(() => ({}));
      msg.style.display = "block";
      if (res.ok) {
        msg.style.color = "var(--good)";
        msg.textContent = `Joined ${body.name}.`;
        setSelectedCommunityId(body.id);
        e.target.reset();
        await refreshCommunitySwitcher();
      } else {
        msg.style.color = "var(--warn)";
        msg.textContent =
          body.error === "invalid_slug"
            ? "No community found with that invite code."
            : body.error === "not_a_guild_member"
            ? "You need to be a member of that Discord server first."
            : "Couldn't join that community.";
      }
    });
  }

  async function loadEligibleGuilds() {
    const container = document.getElementById("eligible-guilds");
    const res = await api("/api/eligible-guilds");
    const guilds = res.ok ? await res.json() : [];

    if (!guilds.length) {
      container.innerHTML = `<span class="empty" style="padding:4px 0;">No servers found where you have Manage Server access.</span>`;
      return;
    }

    container.innerHTML = guilds
      .map(
        (g) => `<div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0;">
          <span>${esc(g.name)}</span>
          ${
            g.alreadyLinked
              ? `<span class="pill neutral">Already linked</span>`
              : `<button class="btn btn-accent" data-create="${esc(g.id)}">Create</button>`
          }
        </div>`
      )
      .join("");

    container.querySelectorAll("[data-create]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const msg = document.getElementById("create-message");
        const res = await api("/api/communities", {
          method: "POST",
          body: JSON.stringify({ guildId: btn.dataset.create }),
        });
        const body = await res.json().catch(() => ({}));
        msg.style.display = "block";
        if (res.ok) {
          msg.style.color = "var(--good)";
          msg.textContent = `Created ${body.name}.`;
          setSelectedCommunityId(body.id);
          await refreshCommunitySwitcher();
        } else {
          msg.style.color = "var(--warn)";
          msg.textContent = "Couldn't create that community.";
        }
      });
    });
  }

  // ---------------------------------------------------------------------
  // Shift clock
  // ---------------------------------------------------------------------

  async function loadMyTypes() {
    const res = await api(`/api/communities/${communityId}/shifttypes/mine`);
    myTypes = res.ok ? await res.json() : [];
    const select = document.getElementById("manual-type");
    if (select) {
      select.innerHTML = myTypes.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
    }
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function elapsedSeconds() {
    if (!activeShift) return 0;
    const now = Math.floor(Date.now() / 1000);
    let breakSeconds = activeShift.total_break_seconds || 0;
    if (activeShift.break_start) breakSeconds += now - activeShift.break_start;
    return now - activeShift.start_time - breakSeconds;
  }

  function tick() {
    const timerEl = document.getElementById("ticket-timer");
    if (timerEl) timerEl.textContent = formatClock(elapsedSeconds());
  }

  function renderTicket() {
    const ticket = document.getElementById("ticket");
    const label = document.getElementById("ticket-label");
    const type = document.getElementById("ticket-type");

    stopTimer();

    if (!activeShift) {
      ticket.className = "ticket";
      label.textContent = "Not on shift";
      type.textContent = "—";
      document.getElementById("ticket-timer").textContent = "00:00:00";
      return;
    }

    const onBreak = !!activeShift.break_start;
    ticket.className = onBreak ? "ticket break" : "ticket on";
    label.textContent = onBreak ? "On break" : "On shift";
    type.textContent = activeShift.shift_type_name || "Shift";
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function renderControls() {
    const controls = document.getElementById("controls");
    controls.innerHTML = "";

    if (!activeShift) {
      if (myTypes.length === 0) {
        controls.innerHTML = `<span class="empty" style="padding:0;">No shift types are open to you yet.</span>`;
        return;
      }
      if (myTypes.length === 1) {
        const btn = document.createElement("button");
        btn.className = "btn btn-accent";
        btn.textContent = "Start Shift";
        btn.onclick = () => startShift(myTypes[0].id);
        controls.appendChild(btn);
        return;
      }
      const select = document.createElement("select");
      select.id = "start-type-select";
      select.innerHTML = myTypes.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
      const btn = document.createElement("button");
      btn.className = "btn btn-accent";
      btn.textContent = "Start Shift";
      btn.onclick = () => startShift(Number(select.value));
      controls.appendChild(select);
      controls.appendChild(btn);
      return;
    }

    const onBreak = !!activeShift.break_start;
    const breakBtn = document.createElement("button");
    breakBtn.className = "btn";
    breakBtn.textContent = onBreak ? "End Break" : "Start Break";
    breakBtn.onclick = onBreak ? endBreak : startBreak;
    controls.appendChild(breakBtn);

    const endBtn = document.createElement("button");
    endBtn.className = "btn btn-danger";
    endBtn.textContent = "End Shift";
    endBtn.onclick = endShift;
    controls.appendChild(endBtn);
  }

  const PERIOD_LABEL = { weekly: "", biweekly: " (biweekly)", monthly: " (monthly)" };

  function renderQuotas(totals, quotaProgress) {
    const container = document.getElementById("quotas");
    if (!totals.length) {
      container.innerHTML = `<div class="empty">No shift types configured yet.</div>`;
      return;
    }

    const rows = quotaProgress.map((q) =>
      quotaRowHtml((q.shiftTypeName ?? "Overall") + PERIOD_LABEL[q.period], q.seconds, q.hoursRequired)
    );

    // Shift types with no quota of their own still show this week's hours, plain.
    const quotedTypeIds = new Set(quotaProgress.map((q) => q.shiftTypeId));
    for (const t of totals) {
      if (quotedTypeIds.has(t.shift_type_id)) continue;
      rows.push(quotaRowHtml(t.shift_type_name, t.total_seconds, null));
    }

    container.innerHTML = rows.join("");
  }

  function quotaRowHtml(name, seconds, requiredHours) {
    const hours = seconds / 3600;
    if (requiredHours == null) {
      return `<div class="quota-row">
        <div class="quota-row-head"><span class="name">${esc(name)}</span><span class="value">${formatDuration(seconds)}</span></div>
      </div>`;
    }
    const pct = requiredHours > 0 ? Math.min(1, hours / requiredHours) : 0;
    const met = hours >= requiredHours;
    return `<div class="quota-row">
      <div class="quota-row-head">
        <span class="name">${esc(name)}</span>
        <span class="value">${formatDuration(seconds)} / ${requiredHours}h</span>
      </div>
      <div class="bar-track"><div class="bar-fill${met ? " met" : ""}" style="width:${Math.round(pct * 100)}%"></div></div>
    </div>`;
  }

  function renderAllTime(allTimeTotals) {
    const container = document.getElementById("alltime");
    if (!container) return;
    const section = document.getElementById("alltime-section");
    if (!allTimeTotals.length || allTimeTotals.every((t) => t.total_seconds === 0)) {
      if (section) section.style.display = "none";
      return;
    }
    if (section) section.style.display = "";
    container.innerHTML = allTimeTotals
      .map(
        (t) => `<div class="quota-row-head" style="margin-bottom:10px;">
          <span class="name">${esc(t.shift_type_name)}</span>
          <span class="value">${formatDuration(t.total_seconds)}</span>
        </div>`
      )
      .join("");
  }

  function renderHistory(history) {
    const body = document.getElementById("history-body");
    const empty = document.getElementById("history-empty");
    if (!history.length) {
      body.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    body.innerHTML = history
      .map(
        (h) => `<tr>
          <td>${esc(h.shift_type_name)}${h.source === "manual" ? ' <span class="pill neutral">Manual</span>' : ""}</td>
          <td>${new Date(h.start_time * 1000).toLocaleString()}</td>
          <td class="mono">${formatDuration(h.duration_seconds)}</td>
        </tr>`
      )
      .join("");
  }

  async function loadSummary() {
    const res = await api(`/api/communities/${communityId}/summary`);
    if (!res.ok) return;
    const data = await res.json();
    activeShift = data.active;
    renderTicket();
    renderControls();
    renderQuotas(data.totals, data.quotaProgress);
    renderAllTime(data.allTimeTotals);
  }

  async function loadHistory() {
    const res = await api(`/api/communities/${communityId}/history`);
    if (!res.ok) return;
    renderHistory(await res.json());
  }

  async function refreshAll() {
    if (!communityId) return;
    await Promise.all([loadSummary(), loadHistory()]);
  }

  async function startShift(shiftTypeId) {
    const res = await api(`/api/communities/${communityId}/shift/start`, {
      method: "POST",
      body: JSON.stringify({ shiftTypeId }),
    });
    if (res.ok) {
      await refreshAll();
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (body.error === "subscription_required") {
      alert("This community doesn't have an active Shiftus subscription, so clocking on is disabled right now.");
    }
  }

  async function endShift() {
    const res = await api(`/api/communities/${communityId}/shift/end`, { method: "POST" });
    if (res.ok) await refreshAll();
  }

  async function startBreak() {
    const res = await api(`/api/communities/${communityId}/shift/break/start`, { method: "POST" });
    if (res.ok) await refreshAll();
  }

  async function endBreak() {
    const res = await api(`/api/communities/${communityId}/shift/break/end`, { method: "POST" });
    if (res.ok) await refreshAll();
  }

  function wireManualForm() {
    const form = document.getElementById("manual-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const shiftTypeId = Number(document.getElementById("manual-type").value);
      const date = document.getElementById("manual-date").value;
      const hours = Number(document.getElementById("manual-hours").value);
      const msg = document.getElementById("manual-message");

      const res = await api(`/api/communities/${communityId}/shifts/manual`, {
        method: "POST",
        body: JSON.stringify({ shiftTypeId, date, hours }),
      });

      msg.style.display = "block";
      if (res.ok) {
        msg.style.color = "var(--good)";
        msg.textContent = "Time added.";
        form.reset();
        await refreshAll();
      } else {
        const body = await res.json().catch(() => ({}));
        msg.style.color = "var(--warn)";
        msg.textContent = `Couldn't add time (${body.error || "unknown error"}).`;
      }
    });
  }

  function wireLogout() {
    document.getElementById("logout").addEventListener("click", async () => {
      await fetch("/auth/logout", { method: "POST" });
      location.href = "/";
    });
  }

  async function init() {
    await loadMe();
    if (!me) return;
    wireManualForm();
    wireLogout();
    wireAddCommunityPanel();
    await refreshCommunitySwitcher();
    setInterval(refreshAll, 30000);
  }

  init();
})();
