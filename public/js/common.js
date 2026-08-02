// Shared helpers for dashboard.js and admin.js — loaded before both via a
// plain <script> tag (no bundler here), so everything hangs off `window.DutyLog`.
(function () {
  "use strict";

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

  function avatarUrl(user) {
    const id = user.discord_id || user.id;
    if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) % 5n)}.png`;
    return `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=64`;
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

  /** Disables a button and swaps its label while an async action runs, restoring both after. */
  async function withButtonDisabled(button, fn) {
    if (!button) return fn();
    button.disabled = true;
    const original = button.textContent;
    try {
      await fn();
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function showMessage(el, ok, text) {
    el.style.display = "block";
    el.style.color = ok ? "var(--good)" : "var(--warn)";
    el.textContent = text;
  }

  window.DutyLog = { esc, formatDuration, formatClock, avatarUrl, api, withButtonDisabled, showMessage };
})();
