(function () {
  "use strict";

  const { esc, formatDuration, formatClock, avatarUrl, api, withButtonDisabled, showMessage } = window.DutyLog;

  let activeShift = null; // raw shift row from /api/summary, or null
  let timerInterval = null;

  async function loadMe() {
    const res = await api("/api/me");
    const me = await res.json();
    document.getElementById("avatar").src = avatarUrl(me);
    document.getElementById("username").textContent = me.username;
    if (me.isAdmin) document.getElementById("admin-link").style.display = "";

    if (me.canAddTime) {
      document.getElementById("log-time-section").style.display = "";
      await populateManualForm();
      document.getElementById("manual-form").addEventListener("submit", onSubmitManual);
    }
  }

  async function populateManualForm() {
    const res = await api("/api/shifttypes/mine");
    const types = await res.json();
    const select = document.getElementById("manual-type");
    select.innerHTML = types.length
      ? types.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")
      : `<option value="">No shift types available to your roles</option>`;
    document.getElementById("manual-date").value = new Date().toISOString().slice(0, 10);
  }

  async function onSubmitManual(e) {
    e.preventDefault();
    const shiftTypeId = Number(document.getElementById("manual-type").value);
    const date = document.getElementById("manual-date").value;
    const hours = Number(document.getElementById("manual-hours").value);
    const msg = document.getElementById("manual-message");

    const res = await api("/api/shifts/manual", {
      method: "POST",
      body: JSON.stringify({ shiftTypeId, date, hours }),
    });

    if (res.ok) {
      showMessage(msg, true, `Added ${hours}h. Your totals below are updated.`);
      document.getElementById("manual-hours").value = "";
      await refreshAll();
    } else {
      const body = await res.json().catch(() => ({}));
      showMessage(
        msg,
        false,
        body.error === "not_allowed"
          ? "You don't have permission to add time."
          : body.error === "role_required"
          ? "You don't have the role required for that shift type."
          : "Couldn't add that entry — check the values and try again."
      );
    }
  }

  // ---------------------------------------------------------------------
  // Ticket + controls
  // ---------------------------------------------------------------------

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function tick() {
    const timer = document.getElementById("ticket-timer");
    if (!timer || !activeShift) return;
    const now = Math.floor(Date.now() / 1000);
    const onBreak = !!activeShift.break_start;
    const workedSeconds = onBreak
      ? activeShift.break_start - activeShift.start_time - activeShift.total_break_seconds
      : now - activeShift.start_time - activeShift.total_break_seconds;
    timer.textContent = formatClock(workedSeconds);
  }

  function renderTicket() {
    const ticket = document.getElementById("ticket");
    const label = document.getElementById("ticket-label");
    const type = document.getElementById("ticket-type");

    stopTimer();
    ticket.classList.remove("on", "break");

    if (!activeShift) {
      label.textContent = "Not on shift";
      type.textContent = "—";
      document.getElementById("ticket-timer").textContent = "00:00:00";
      return;
    }

    const onBreak = !!activeShift.break_start;
    ticket.classList.add(onBreak ? "break" : "on");
    label.textContent = onBreak
      ? "On break since " + new Date(activeShift.break_start * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "On shift since " + new Date(activeShift.start_time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    type.innerHTML = `${esc(activeShift.shift_type_name || "Shift")}${onBreak ? '<span class="break-pill">On Break</span>' : ""}`;

    tick();
    timerInterval = setInterval(tick, 1000);
  }

  async function renderControls() {
    const container = document.getElementById("controls");
    container.innerHTML = "";

    if (!activeShift) {
      const res = await api("/api/shifttypes/mine");
      const types = await res.json();
      if (types.length === 0) {
        container.innerHTML = '<span class="empty" style="padding:0;">None of your roles are set up to start a shift here. Ask an admin.</span>';
        return;
      }

      const select = document.createElement("select");
      select.id = "start-type-select";
      select.innerHTML = types.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");

      const button = document.createElement("button");
      button.className = "btn btn-accent";
      button.textContent = "Start Shift";
      button.addEventListener("click", () => onStartShift(select.value, button));

      container.appendChild(select);
      container.appendChild(button);
      return;
    }

    const onBreak = !!activeShift.break_start;

    const breakBtn = document.createElement("button");
    breakBtn.className = "btn";
    breakBtn.textContent = onBreak ? "End Break" : "Start Break";
    breakBtn.addEventListener("click", () => (onBreak ? onEndBreak(breakBtn) : onStartBreak(breakBtn)));

    const endBtn = document.createElement("button");
    endBtn.className = "btn btn-danger";
    endBtn.textContent = "End Shift";
    endBtn.addEventListener("click", () => onEndShift(endBtn));

    container.appendChild(breakBtn);
    container.appendChild(endBtn);
  }

  async function onStartShift(shiftTypeId, button) {
    await withButtonDisabled(button, async () => {
      const res = await api("/api/shift/start", {
        method: "POST",
        body: JSON.stringify({ shiftTypeId: Number(shiftTypeId) }),
      });
      if (res.ok) {
        await refreshAll();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(
          body.error === "role_required"
            ? "You don't have the role required for that shift type."
            : "Couldn't start that shift — refresh and try again."
        );
      }
    });
  }

  async function onStartBreak(button) {
    await withButtonDisabled(button, async () => {
      const res = await api("/api/shift/break/start", { method: "POST" });
      if (res.ok) await refreshAll();
    });
  }

  async function onEndBreak(button) {
    await withButtonDisabled(button, async () => {
      const res = await api("/api/shift/break/end", { method: "POST" });
      if (res.ok) await refreshAll();
    });
  }

  async function onEndShift(button) {
    await withButtonDisabled(button, async () => {
      const res = await api("/api/shift/end", { method: "POST" });
      if (res.ok) {
        await refreshAll();
      } else {
        alert("Couldn't end that shift — refresh and try again.");
      }
    });
  }

  // ---------------------------------------------------------------------
  // Quotas / all-time / history
  // ---------------------------------------------------------------------

  function renderQuotas(totals, quotas) {
    const container = document.getElementById("quotas");
    container.innerHTML = "";

    if (totals.length === 0) {
      container.innerHTML = '<div class="empty">No shift types configured yet.</div>';
      return;
    }

    const quotaByType = new Map(quotas.map((q) => [q.shift_type_id, q.hours_required]));
    let overallSeconds = 0;

    for (const t of totals) {
      overallSeconds += t.total_seconds;
      container.appendChild(quotaRow(t.shift_type_name, t.total_seconds, quotaByType.get(t.shift_type_id)));
    }

    const overallQuota = quotaByType.get(null);
    if (overallQuota) {
      const divider = document.createElement("div");
      divider.style.cssText = "border-top: 1px solid var(--hairline); margin: 18px 0;";
      container.appendChild(divider);
      container.appendChild(quotaRow("Overall", overallSeconds, overallQuota, true));
    }
  }

  function quotaRow(name, seconds, quotaHours, emphasized) {
    const row = document.createElement("div");
    row.className = "quota-row";

    const hours = seconds / 3600;
    const pct = quotaHours ? Math.min(100, (hours / quotaHours) * 100) : 0;
    const met = quotaHours && hours >= quotaHours;

    row.innerHTML = `
      <div class="quota-row-head">
        <span class="name" style="${emphasized ? "font-family: var(--font-display); text-transform: uppercase; letter-spacing: .03em;" : ""}">${esc(name)}</span>
        <span class="value">
          ${formatDuration(seconds)}${quotaHours ? ` / ${quotaHours}h` : ""}
          ${quotaHours ? `<span class="pill ${met ? "good" : "warn"}" style="margin-left:8px;">${met ? "Quota met" : "Below quota"}</span>` : ""}
        </span>
      </div>
      ${quotaHours ? `<div class="bar-track"><div class="bar-fill ${met ? "met" : ""}" style="width:${pct}%"></div></div>` : ""}
    `;
    return row;
  }

  function renderAllTime(allTimeTotals) {
    const section = document.getElementById("alltime-section");
    const container = document.getElementById("alltime");
    if (!allTimeTotals.length || allTimeTotals.every((t) => t.total_seconds === 0)) {
      section.style.display = "none";
      return;
    }
    section.style.display = "";
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
      .map((h) => {
        const started = new Date(h.start_time * 1000);
        return `<tr>
          <td>${esc(h.shift_type_name)}${h.source === "manual" ? ' <span class="pill neutral">Manual</span>' : ""}</td>
          <td>${started.toLocaleDateString([], { month: "short", day: "numeric" })} · ${started.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
          <td class="mono">${formatDuration(h.duration_seconds)}</td>
        </tr>`;
      })
      .join("");
  }

  async function loadSummary() {
    const res = await api("/api/summary");
    const data = await res.json();
    activeShift = data.active;
    renderTicket();
    await renderControls();
    renderQuotas(data.totals, data.quotas);
    renderAllTime(data.allTimeTotals);
  }

  async function loadHistory() {
    const res = await api("/api/history");
    renderHistory(await res.json());
  }

  async function refreshAll() {
    await Promise.all([loadSummary(), loadHistory()]);
  }

  function wireLogout() {
    document.getElementById("logout").addEventListener("click", async () => {
      await fetch("/auth/logout", { method: "POST" });
      location.href = "/";
    });
  }

  async function init() {
    wireLogout();
    await loadMe();
    await refreshAll();
    setInterval(refreshAll, 30000);
  }

  init();
})();
