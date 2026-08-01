// Shared helpers for dashboard.js and admin.js — loaded before both via a
// plain <script> tag (no bundler here), so everything hangs off `window.Shiftus`.
(function () {
  "use strict";

  const STORAGE_KEY = "shiftus:communityId";

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

  function getSelectedCommunityId() {
    return localStorage.getItem(STORAGE_KEY);
  }

  function setSelectedCommunityId(id) {
    localStorage.setItem(STORAGE_KEY, String(id));
  }

  async function loadCommunities() {
    const res = await api("/api/communities");
    return res.ok ? res.json() : [];
  }

  /**
   * Populates a <select> with the user's communities and returns the id that
   * ends up selected (localStorage's choice if still valid, else the first
   * community). Wires the change handler to persist + call onChange.
   */
  function renderCommunitySwitcher(selectEl, communities, onChange) {
    selectEl.innerHTML = communities
      .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
      .join("");

    const stored = getSelectedCommunityId();
    const validIds = communities.map((c) => String(c.id));
    const selected = validIds.includes(stored) ? stored : validIds[0];

    if (selected) {
      selectEl.value = selected;
      setSelectedCommunityId(selected);
    }

    selectEl.addEventListener("change", () => {
      setSelectedCommunityId(selectEl.value);
      onChange(selectEl.value);
    });

    return selected || null;
  }

  window.Shiftus = {
    esc,
    formatDuration,
    pad2,
    formatClock,
    api,
    getSelectedCommunityId,
    setSelectedCommunityId,
    loadCommunities,
    renderCommunitySwitcher,
  };
})();
