(function () {
  "use strict";

  let me = null;
  let myTypes = [];
  let activeShift = null; // raw shift row from /api/summary, or null
  let timerInterval = null;

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s ?? "";
    return d.innerHTML;
  }

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  }

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.status === 401) {
      location.href = "/";
      throw new Error("not authenticated");
    }
    return res;
  }

  async function loadMe() {
    const res = await api("/api/me");
    if (!res.ok) return;
    me = await res.json();
    document.getElementById("avatar").src = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;
    document.getElementById("username").textContent = me.username;
    if (me.isAdmin) {
      const link = document.getElementById("admin-link");
      if (link) link.style.display = "";
    }
    if (me.canAddTime) {
      const section = document.getElementById("log-time-section");
      if (section) section.style.display = "";
    }
  }

  async function loadMyTypes() {
    const res = await api("/api/shifttypes/mine");
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

  function renderQuotas(totals, quotas) {
    const container = document.getElementById("quotas");
    if (!totals.length) {
      container.innerHTML = `<div class="empty">No shift types configured yet.</div>`;
      return;
    }

    const quotaByType = new Map(quotas.map((q) => [q.shift_type_id, q.hours_required]));
    const overallQuota = quotaByType.get(null);
    const overallSeconds = totals.reduce((sum, t) => sum + t.total_seconds, 0);

    const rows = [];
    if (overallQuota != null) {
      rows.push(quotaRowHtml("Overall", overallSeconds, overallQuota));
    }
    for (const t of totals) {
      const required = quotaByType.get(t.shift_type_id);
      rows.push(quotaRowHtml(t.shift_type_name, t.total_seconds, required));
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
    const res = await api("/api/summary");
    if (!res.ok) return;
    const data = await res.json();
    activeShift = data.active;
    renderTicket();
    renderControls();
    renderQuotas(data.totals, data.quotas);
    renderAllTime(data.allTimeTotals);
  }

  async function loadHistory() {
    const res = await api("/api/history");
    if (!res.ok) return;
    renderHistory(await res.json());
  }

  async function refreshAll() {
    await Promise.all([loadSummary(), loadHistory()]);
  }

  async function startShift(shiftTypeId) {
    const res = await api("/api/shift/start", {
      method: "POST",
      body: JSON.stringify({ shiftTypeId }),
    });
    if (res.ok) await refreshAll();
  }

  async function endShift() {
    const res = await api("/api/shift/end", { method: "POST" });
    if (res.ok) await refreshAll();
  }

  async function startBreak() {
    const res = await api("/api/shift/break/start", { method: "POST" });
    if (res.ok) await refreshAll();
  }

  async function endBreak() {
    const res = await api("/api/shift/break/end", { method: "POST" });
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

      const res = await api("/api/shifts/manual", {
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
    await loadMyTypes();
    wireManualForm();
    wireLogout();
    await refreshAll();
    setInterval(refreshAll, 30000);
  }

  init();
})();
