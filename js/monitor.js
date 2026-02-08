(function () {
  const listEl = document.getElementById("teams");
  const resetBtn = document.getElementById("reset-history");

  function fmt(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return `${m}:${r}`;
  }

  function fmtDate(ts) {
    if (!Number.isFinite(Number(ts)) || Number(ts) <= 0) {
      return "-";
    }
    return new Date(Number(ts) * 1000).toLocaleString("fr-FR");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderRealtime(team) {
    const state = team.state || "free";
    const stateLine = `état : <strong>${escapeHtml(state)}</strong>`;

    if (state === "active" && team.current_personnage) {
      const remaining = Math.max(0, Number(team.active_remaining_seconds) || 0);
      const hasWaitingQueue = team.has_waiting_queue === true;
      const isTakeoverSoon = team.takeover_warning === true;
      const warningLine = hasWaitingQueue
        ? `<br><span style="font-weight:700;color:${isTakeoverSoon ? "#ef4444" : "#fb923c"}">Relève dans ${fmt(remaining)}${isTakeoverSoon ? " ⚠️" : ""}</span>`
        : "";
      return `${stateLine}<br>personnage courant : ${escapeHtml(team.current_personnage.nom || "(sans nom)")} (#${escapeHtml(team.current_personnage.id)})${warningLine}`;
    }

    if (state === "waiting" && team.waiting_queue) {
      return `${stateLine}<br>file concernée : ${escapeHtml(team.waiting_queue.nom || "(sans nom)")} (#${escapeHtml(team.waiting_queue.id)})<br>position : ${Number(team.queue_position) + 1}`;
    }

    return stateLine;
  }

  function renderHistory(team) {
    const history = Array.isArray(team.history) ? team.history : [];
    const totals = Array.isArray(team.time_per_personnage) ? team.time_per_personnage : [];

    const totalsHtml = totals.length
      ? `<ul>${totals
          .map((item) => `<li>${escapeHtml(item.personnage?.nom || "(sans nom)")} : ${fmt(item.duration_seconds)}</li>`)
          .join("")}</ul>`
      : "Aucun temps enregistré.";

    const entriesHtml = history.length
      ? `<ul>${history
          .map(
            (entry) => `<li>${escapeHtml(entry.personnage?.nom || "(sans nom)")} : ${fmtDate(entry.started_at)} → ${fmtDate(entry.ended_at)} (${fmt(entry.duration_seconds)})</li>`
          )
          .join("")}</ul>`
      : "Aucun passage historisé.";

    return `<div><strong>Temps passé par personnage (informatif)</strong>${totalsHtml}</div>
      <div style="margin-top:8px"><strong>Passages chronologiques</strong>${entriesHtml}</div>`;
  }

  async function refresh() {
    const response = await fetch(`./api/supervision.php?t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      listEl.textContent = "Erreur de chargement.";
      return;
    }

    if (!payload.teams.length) {
      listEl.textContent = "Aucune équipe connue.";
      return;
    }

    listEl.innerHTML = payload.teams
      .map((team) => {
        const name = escapeHtml(team.team_name || "Équipe sans nom");
        return `<div style="padding:12px 0;border-bottom:1px solid #2b3240">
          <strong>${name}</strong><br>
          ${renderRealtime(team)}
          <div style="margin-top:8px;padding:8px;background:#0f131c;border-radius:8px">
            ${renderHistory(team)}
          </div>
        </div>`;
      })
      .join("");
  }

  resetBtn.addEventListener("click", async () => {
    if (!window.confirm("Remettre tout l'historique à zéro ?")) {
      return;
    }

    resetBtn.disabled = true;
    const body = new URLSearchParams({ action: "reset_history" });

    const response = await fetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });

    const payload = await response.json().catch(() => ({}));
    resetBtn.disabled = false;

    if (!response.ok || !payload.ok) {
      window.alert("Échec de la remise à zéro.");
      return;
    }

    await refresh();
  });

  refresh();
  setInterval(refresh, 2000);
})();
