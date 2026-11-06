//! ui.js — R18 UI shell helpers: toasts, grouped nav, dashboard.
//!
//! toast(msg, level) — non-blocking notifications (info/success/warn/error).
//! Dashboard() — populates the overview cards on #panel-dashboard.
//! NavGroup() — collapsible sidebar group headers.

(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ── toasts ──────────────────────────────────────────────────────────

  function toast(msg, level) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
    }
    const el = document.createElement("div");
    el.className = "toast toast-" + (level || "info");
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.classList.add("show"), 10);
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 4200);
    el.onclick = () => el.remove();
  }
  global.toast = toast;

  // ── grouped nav ─────────────────────────────────────────────────────

  /** Toggle a nav group's collapsed state. */
  global.toggleNavGroup = function (headerEl) {
    const group = headerEl.parentElement;
    group.classList.toggle("collapsed");
  };

  // ── dashboard ───────────────────────────────────────────────────────

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /** Refresh the dashboard overview cards. Safe to call pre-WASM. */
  global.refreshDashboard = function () {
    if (typeof Rations === "undefined") return;

    // Identity
    try {
      const pid = Rations.p2pPeerId();
      const hex = Array.from(pid, (b) => b.toString(16).padStart(2, "0")).join("");
      setText("dash-peer-id", hex.slice(0, 16) + "…");
      setText("dash-peer-id-full", hex);
    } catch (_) {
      setText("dash-peer-id", "unavailable");
    }
    try {
      const pk = Rations.phonePublicKey();
      const hex = Array.from(pk, (b) => b.toString(16).padStart(2, "0")).join("");
      setText("dash-phone-pk", hex.slice(0, 16) + "…");
    } catch (_) {
      setText("dash-phone-pk", "not initialized");
    }

    // Connectivity
    try {
      const peers = Rations.p2pPeerCount();
      setText("dash-peers", String(peers));
      setText("dash-relayed", `${Rations.p2pRelayedReceived()} in / ${Rations.p2pRelayedForwarded()} fwd`);
      const connEl = document.getElementById("p2p-connect-url");
      setText("dash-relay", connEl && connEl.value ? connEl.value : "not connected");
    } catch (_) {}

    // Messages
    try {
      const inbox = Rations.phoneInboxCount();
      setText("dash-inbox", String(inbox));
      const calls = Rations.phoneCallsJson() || [];
      const live = calls.filter((c) => c.state === 1 || c.state === 2 || c.state === 0).length;
      setText("dash-calls", String(live));
    } catch (_) {
      setText("dash-inbox", "—");
      setText("dash-calls", "—");
    }

    // Recovery readiness
    const swEl = document.getElementById("dash-sw");
    if (swEl) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          setText("dash-sw", reg ? (reg.active ? "active" : "registered") : "none");
        });
      } else {
        setText("dash-sw", "unsupported");
      }
    }
    try {
      // Estimate collapse plan for this document's serialized size.
      const size = document.documentElement.outerHTML.length;
      const plan = Rations.collapsePlan(size, 0x3f);
      if (plan) {
        setText("dash-vault", `${plan.portal_count} portals · min ${plan.min_durability_years}y`);
      } else {
        setText("dash-vault", "plan unavailable");
      }
    } catch (_) {
      setText("dash-vault", "—");
    }
  };

  // ── dashboard video player ──────────────────────────────────────────

  function parseYouTubeId(input) {
    try {
      const raw = String(input || "").trim();
      if (!raw) return null;
      const url = new URL(raw.match(/^https?:\/\//i) ? raw : "https://" + raw);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (host === "youtu.be") {
        const id = url.pathname.slice(1).split("/")[0];
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
      }
      if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
      const id = url.searchParams.get("v") ||
        (url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] : null) ||
        (url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : null);
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    } catch (_) {
      return null;
    }
  }
  global.parseYouTubeId = parseYouTubeId;

  global.loadDashboardVideo = function () {
    const input = document.getElementById("dash-video-url");
    const frame = document.getElementById("dash-video-frame");
    const status = document.getElementById("dash-video-status");
    if (!input || !frame || !status) return false;
    const id = parseYouTubeId(input.value);
    if (!id) {
      frame.removeAttribute("src");
      frame.style.display = "none";
      status.textContent = "Enter a valid YouTube video URL.";
      return false;
    }
    const src = "https://www.youtube-nocookie.com/embed/" + id + "?rel=0";
    frame.src = src;
    frame.style.display = "block";
    status.textContent = navigator.onLine === false
      ? "Offline: the external YouTube player is unavailable."
      : "External YouTube player loaded; the video is not stored by Rations.";
    localStorage.setItem("rations-dashboard-youtube", id);
    return true;
  };

  global.clearDashboardVideo = function () {
    const frame = document.getElementById("dash-video-frame");
    const input = document.getElementById("dash-video-url");
    const status = document.getElementById("dash-video-status");
    if (frame) { frame.removeAttribute("src"); frame.style.display = "none"; }
    if (input) input.value = "";
    if (status) status.textContent = "No external video selected.";
    localStorage.removeItem("rations-dashboard-youtube");
  };

  function initDashboardVideo() {
    if (typeof document === "undefined" || typeof localStorage === "undefined") return;
    const saved = localStorage.getItem("rations-dashboard-youtube");
    const input = document.getElementById("dash-video-url");
    if (saved && input) {
      input.value = "https://www.youtube.com/watch?v=" + saved;
      global.loadDashboardVideo();
    }
  }
  global.initDashboardVideo = initDashboardVideo;
  initDashboardVideo();

  // Refresh dashboard every 5s while it's visible.
  setInterval(() => {
    const panel = document.getElementById("panel-dashboard");
    if (panel && panel.classList.contains("active")) global.refreshDashboard();
  }, 5000);
})(window);
