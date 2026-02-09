(function () {
  const listEl = document.getElementById("teams");
  const clearMessagesHistoryBtn = document.getElementById("clear-messages-history");
  const toggleEndGameBtn = document.getElementById("toggle-end-game");
  const endGameStatusEl = document.getElementById("monitor-end-game-status");

  const sortSelectEl = document.getElementById("monitor-team-sort");

  const messageTargetSearchEl = document.getElementById("monitor-message-target-search");
  const messageTargetEl = document.getElementById("monitor-message-target");
  const messageInputEl = document.getElementById("monitor-message-text");
  const sendMessageBtn = document.getElementById("send-monitor-message");
  const messageFeedbackEl = document.getElementById("monitor-message-feedback");

  const SORT_STORAGE_KEY = "cluedo_monitor_team_sort";
  const SORT_MODES = ["latest_message", "longest_queue", "fewest_seen", "highest_avg_time"];

  let messageTargets = [];
  let monitorBaseTeamUrl = "";

  let adminPin = "";

  function supervisionFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (adminPin) {
      headers["X-Admin-Pin"] = adminPin;
    }
    return fetch(url, { ...options, headers });
  }


  function readSortMode() {
    const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
    return SORT_MODES.includes(saved) ? saved : "latest_message";
  }

  function writeSortMode(mode) {
    if (!SORT_MODES.includes(mode)) return;
    window.localStorage.setItem(SORT_STORAGE_KEY, mode);
  }

  function getQueueLengthMetric(team) {
    const length = Number(team?.queue_length || 0);
    return Number.isFinite(length) ? Math.max(0, length) : 0;
  }

  function getEncounterCountMetric(team) {
    const seen = Array.isArray(team?.seen_personnages) ? team.seen_personnages.length : null;
    if (seen !== null) return Math.max(0, seen);
    const encountered = Array.isArray(team?.encountered_personnages) ? team.encountered_personnages.length : 0;
    return Math.max(0, encountered);
  }

  function getAverageTimeMetric(team) {
    const rows = Array.isArray(team?.time_per_personnage) ? team.time_per_personnage : [];
    if (!rows.length) return 0;

    let total = 0;
    let count = 0;
    rows.forEach((row) => {
      const duration = Number(row?.duration_seconds || 0);
      if (!Number.isFinite(duration) || duration < 0) return;
      total += duration;
      count += 1;
    });

    if (!count) return 0;
    return total / count;
  }

  function getSortValue(team, mode) {
    if (mode === "latest_message") return Number(team?.message?.created_at || 0);
    if (mode === "longest_queue") return getQueueLengthMetric(team);
    if (mode === "fewest_seen") return getEncounterCountMetric(team);
    if (mode === "highest_avg_time") return getAverageTimeMetric(team);
    return 0;
  }

  function compareTeams(a, b, mode) {
    if (mode === "fewest_seen") {
      const diff = getSortValue(a, mode) - getSortValue(b, mode);
      if (diff !== 0) return diff;
    } else {
      const diff = getSortValue(b, mode) - getSortValue(a, mode);
      if (diff !== 0) return diff;
    }

    const nameDiff = String(a?.team_name || "").localeCompare(String(b?.team_name || ""), "fr", { sensitivity: "base" });
    if (nameDiff !== 0) return nameDiff;

    return String(a?.token || "").localeCompare(String(b?.token || ""), "fr", { sensitivity: "base" });
  }

  function sortTeams(teams, mode) {
    const selectedMode = SORT_MODES.includes(mode) ? mode : "latest_message";
    return teams.slice().sort((a, b) => compareTeams(a, b, selectedMode));
  }

  function getBaseTeamUrl() {
    if (monitorBaseTeamUrl) return monitorBaseTeamUrl;
    monitorBaseTeamUrl = new URL("./team.html", window.location.href).toString();
    return monitorBaseTeamUrl;
  }

  function buildTeamReconnectUrl(token) {
    const url = new URL(getBaseTeamUrl());
    url.searchParams.set("token", String(token || ""));
    return url.toString();
  }

  function buildTeamQrImageUrl(team) {
    const reconnectUrl = buildTeamReconnectUrl(team?.token || "");
    const payload = encodeURIComponent(reconnectUrl);
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&format=png&data=${payload}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatTime(ts) {
    const date = new Date((Number(ts) || 0) * 1000);
    if (Number.isNaN(date.getTime())) return "--:--:--";
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = String(Math.floor(total / 60)).padStart(2, "0");
    const secs = String(total % 60).padStart(2, "0");
    return `${minutes}:${secs}`;
  }

  function statusTimeInfo(team) {
    if (team.state !== "active" && team.state !== "waiting") {
      return "";
    }

    const since = Number(team.state_since || 0);
    if (!Number.isFinite(since) || since <= 0) {
      return "";
    }

    const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - since);
    return team.state === "active"
      ? `Temps écoulé : ${formatDuration(elapsed)}`
      : `Temps d'attente : ${formatDuration(elapsed)}`;
  }

  function statusInfo(team) {
    if (team.state === "active") {
      return {
        css: "is-with-character",
        text: "Avec personnage",
        character: team.current_personnage?.nom || "Personnage",
        timeInfo: statusTimeInfo(team),
      };
    }
    if (team.state === "waiting") {
      return {
        css: "is-waiting",
        text: "En attente",
        character: team.waiting_queue?.nom || "Personnage",
        timeInfo: statusTimeInfo(team),
      };
    }
    return {
      css: "is-free",
      text: "Équipe libre",
      character: "",
      timeInfo: "",
    };
  }

  function renderPlayers(team) {
    const players = Array.isArray(team.players) ? team.players.filter((name) => String(name || "").trim() !== "") : [];
    return {
      count: players.length,
      content: players.length
        ? `<p class="monitor-players">${players.map((name) => escapeHtml(name)).join(" · ")}</p>`
        : '<p class="monitor-muted">Membres non renseignés.</p>',
    };
  }

  function renderMessageSummary(team) {
    const text = String(team.message?.text || "").trim();
    if (!text) {
      return '<p class="monitor-muted">Aucun message reçu.</p>';
    }

    return `<div class="monitor-card-message"><p>${escapeHtml(text)}</p></div>`;
  }

  function renderCard(team) {
    const status = statusInfo(team);
    const teamName = team.team_name || "Équipe sans nom";
    const players = renderPlayers(team);
    const photoHtml = team.photo
      ? `<img src="${escapeHtml(team.photo)}" alt="Photo ${escapeHtml(teamName || "équipe")}" class="monitor-team-photo"/>`
      : '<div class="monitor-team-photo monitor-team-photo-placeholder" aria-hidden="true"></div>';

    return `<article class="card monitor-team-card">
      <header class="monitor-team-header">
        ${photoHtml}
        <div class="monitor-team-header-meta">
          <h3 class="monitor-team-name">${escapeHtml(teamName)}</h3>
          <span class="monitor-status ${status.css}">${escapeHtml(status.text)}</span>
          ${status.character ? `<p class="monitor-character-context">${escapeHtml(status.character)}</p>` : ""}
          ${status.timeInfo ? `<p class="monitor-character-context">${escapeHtml(status.timeInfo)}</p>` : ""}
        </div>
      </header>
      <div class="monitor-team-body">
        <div class="monitor-team-main">
          <section>
            <h4>Dernier message reçu</h4>
            ${renderMessageSummary(team)}
          </section>
          <section>
            <h4>Membres de l'équipe (${players.count})</h4>
            ${players.content}
          </section>
        </div>
        <aside class="monitor-team-actions" aria-label="Actions équipe">
          <button type="button" class="admin-button monitor-team-qr-btn" data-action="show-team-qr" data-token="${escapeHtml(team.token)}" data-team-name="${escapeHtml(teamName)}">QR Code de l'équipe</button>
          <button type="button" class="admin-button monitor-team-delete-btn" data-action="delete-team" data-token="${escapeHtml(team.token)}" data-team-name="${escapeHtml(teamName)}">Supprimer l'équipe</button>
        </aside>
      </div>
    </article>`;
  }

  function getSelectedTarget() {
    const value = String(messageTargetEl.value || "").trim();
    return value || "";
  }

  function buildMessageTargets(teams, characters) {
    return [
      {
        value: "teams_and_characters:all",
        label: "🌐 Tout le monde (équipes + personnages)",
        searchText: "tout le monde equipes personnages all",
      },
      {
        value: "teams:all",
        label: "👥 Toutes les équipes",
        searchText: "toutes les equipes all teams",
      },
      {
        value: "characters:all",
        label: "🎭 Tous les personnages",
        searchText: "tous les personnages all characters",
      },
      ...teams.map((team) => ({
        value: `team:${team.token}`,
        label: `👥 ${team.team_name || "Équipe sans nom"}`,
        searchText: `equipe team ${String(team.team_name || "").toLowerCase()}`,
      })),
      ...characters.map((character) => ({
        value: `character:${character.id}`,
        label: `🎭 ${character.nom || "Personnage"}`,
        searchText: `personnage character ${String(character.nom || "").toLowerCase()}`,
      })),
    ];
  }

  function renderMessageTargetOptions(keepValue) {
    const previous = keepValue || "";
    const query = String(messageTargetSearchEl.value || "").trim().toLowerCase();
    const filtered = !query
      ? messageTargets
      : messageTargets.filter((target) => {
          const haystack = `${target.label.toLowerCase()} ${target.searchText}`;
          return haystack.includes(query);
        });

    messageTargetEl.innerHTML = filtered
      .map((target) => `<option value="${escapeHtml(target.value)}">${escapeHtml(target.label)}</option>`)
      .join("");

    if (previous && filtered.some((target) => target.value === previous)) {
      messageTargetEl.value = previous;
      return;
    }

    messageTargetEl.selectedIndex = -1;
  }

  function fillMessageTargets(teams, characters) {
    const previousTarget = getSelectedTarget();
    messageTargets = buildMessageTargets(teams, characters);
    renderMessageTargetOptions(previousTarget);
  }

  function targetToChannels(target) {
    if (target === "teams_and_characters:all") {
      return {
        teamTargets: ["teams:all"],
        characterTargets: ["characters:all"],
      };
    }

    if (target === "teams:all" || target.startsWith("team:")) {
      return { teamTargets: [target], characterTargets: [] };
    }

    if (target === "characters:all" || target.startsWith("character:")) {
      return { teamTargets: [], characterTargets: [target] };
    }

    return { teamTargets: [], characterTargets: [] };
  }

  async function sendMessage({ channel, targets, text, feedbackEl, buttonEl, successText }) {
    if (!text) {
      feedbackEl.textContent = "Veuillez saisir un message avant l'envoi.";
      return false;
    }

    if (!Array.isArray(targets) || !targets.length) {
      feedbackEl.textContent = "Veuillez sélectionner un destinataire.";
      return false;
    }

    buttonEl.disabled = true;

    const body = new URLSearchParams({ action: "send_message", channel, message: text });
    targets.forEach((target) => body.append("targets[]", target));

    const response = await supervisionFetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });

    const payload = await response.json().catch(() => ({}));
    buttonEl.disabled = false;

    if (!response.ok || !payload.ok) {
      feedbackEl.textContent = payload.error || "Échec d'envoi du message.";
      return false;
    }

    feedbackEl.textContent = successText;
    return true;
  }

  function renderEndGameControls(gameState) {
    const endGameActive = !!gameState?.end_game_active;
    const partyActive = !endGameActive;
    toggleEndGameBtn.textContent = endGameActive ? "Annuler la fin de jeu" : "Fin de jeu";
    toggleEndGameBtn.classList.toggle("is-active", endGameActive);
    endGameStatusEl.classList.toggle("is-active", partyActive);
    endGameStatusEl.classList.toggle("is-inactive", !partyActive);
    endGameStatusEl.textContent = partyActive ? "Partie active" : "Partie inactive";
  }

  async function setEndGame(active) {
    const prompt = active
      ? "Confirmer l'activation de la fin de jeu ? Les équipes en cours continuent, mais aucun nouvel interrogatoire ne sera autorisé."
      : "Confirmer l'annulation de la fin de jeu ?";

    if (!window.confirm(prompt)) {
      return;
    }

    toggleEndGameBtn.disabled = true;
    const body = new URLSearchParams({
      action: "set_end_game",
      active: active ? "1" : "0",
    });

    const response = await supervisionFetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });

    const payload = await response.json().catch(() => ({}));
    toggleEndGameBtn.disabled = false;

    if (!response.ok || !payload.ok) {
      window.alert(payload.error || "Impossible de mettre à jour la fin de jeu.");
      return;
    }

    renderEndGameControls(payload.game_state || {});
    await refresh();
  }


  function openTeamQrModal(teamToken, teamName) {
    const reconnectUrl = buildTeamReconnectUrl(teamToken);
    const qrImageUrl = buildTeamQrImageUrl({ token: teamToken });
    const modal = document.createElement("div");
    modal.className = "monitor-modal";
    modal.innerHTML = `
      <div class="monitor-modal-dialog" role="dialog" aria-modal="true" aria-label="QR Code de l'équipe ${escapeHtml(teamName)}">
        <h3>QR Code de l'équipe</h3>
        <p class="monitor-muted"><strong>${escapeHtml(teamName)}</strong></p>
        <img class="monitor-team-qr-image" src="${escapeHtml(qrImageUrl)}" alt="QR code de récupération pour ${escapeHtml(teamName)}"/>
        <p class="monitor-muted">Scanner ce QR code ouvre l'Espace Équipe avec le token existant.</p>
        <div class="monitor-modal-link-wrap">
          <input type="text" class="admin-input" value="${escapeHtml(reconnectUrl)}" readonly aria-label="Lien de récupération équipe"/>
        </div>
        <div class="monitor-modal-actions">
          <a class="admin-button" href="${escapeHtml(qrImageUrl)}" download="cluedo-team-${escapeHtml(String(teamToken || ""))}.png">Télécharger le QR Code</a>
          <button type="button" class="admin-button monitor-modal-close">Fermer</button>
        </div>
      </div>`;

    const closeModal = () => {
      modal.remove();
      document.removeEventListener("keydown", onKeydown);
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") closeModal();
    };

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    modal.querySelector(".monitor-modal-close")?.addEventListener("click", closeModal);
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(modal);
  }

  async function deleteTeam(teamToken, teamName) {
    const confirmed = window.confirm(`Confirmer la suppression DÉFINITIVE de l'équipe ${teamName} ?\n\nCette action supprime le nom, la photo, les participants, les messages et l'historique des passages.`);
    if (!confirmed) return;

    const body = new URLSearchParams({ action: "delete_team", token: teamToken });
    const response = await supervisionFetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      window.alert(payload.error || "Suppression impossible.");
      return;
    }

    await refresh();
  }

  async function refresh() {
    const response = await supervisionFetch(`./api/supervision.php?t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      listEl.textContent = "Erreur de chargement.";
      return;
    }

    fillMessageTargets(payload.teams || [], Array.isArray(payload.characters) ? payload.characters : []);
    renderEndGameControls(payload.game_state || {});

    const sortMode = readSortMode();
    const sortedTeams = sortTeams(payload.teams || [], sortMode);

    if (!sortedTeams.length) {
      listEl.textContent = "Aucune équipe connue.";
      return;
    }

    listEl.innerHTML = sortedTeams.map(renderCard).join("");
  }

  resetBtn.addEventListener("click", async () => {
    if (!window.confirm("Remettre tout l'historique à zéro ?")) return;

    resetBtn.disabled = true;
    const response = await supervisionFetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ action: "reset_history" }).toString(),
    });

    const payload = await response.json().catch(() => ({}));
    resetBtn.disabled = false;

    if (!response.ok || !payload.ok) {
      window.alert("Échec de la remise à zéro.");
      return;
    }

    await refresh();
  });

  toggleEndGameBtn.addEventListener("click", async () => {
    const active = !toggleEndGameBtn.classList.contains("is-active");
    await setEndGame(active);
  });


  clearMessagesHistoryBtn?.addEventListener("click", async () => {
    const confirmed = window.confirm("Confirmer la suppression de tout l’historique des messages ?");
    if (!confirmed) return;

    clearMessagesHistoryBtn.disabled = true;
    const response = await supervisionFetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ action: "clear_messages_history" }).toString(),
    });

    const payload = await response.json().catch(() => ({}));
    clearMessagesHistoryBtn.disabled = false;

    if (!response.ok || !payload.ok) {
      window.alert(payload.error || "Échec de la suppression de l'historique des messages.");
      return;
    }

    messageFeedbackEl.textContent = "Historique des messages supprimé globalement.";
    await refresh();
  });

  messageTargetSearchEl.addEventListener("input", () => {
    renderMessageTargetOptions(getSelectedTarget());
  });

  messageTargetEl.addEventListener("change", () => {
    const selectedTarget = getSelectedTarget();
    if (!selectedTarget) return;

    if (messageTargetSearchEl.value) {
      messageTargetSearchEl.value = "";
      renderMessageTargetOptions(selectedTarget);
    }

    messageTargetEl.focus();
  });

  sendMessageBtn.addEventListener("click", async () => {
    const target = getSelectedTarget();
    const text = (messageInputEl.value || "").trim();

    if (!target) {
      messageFeedbackEl.textContent = "Veuillez sélectionner explicitement un destinataire.";
      return;
    }

    const { teamTargets, characterTargets } = targetToChannels(target);

    if (!teamTargets.length && !characterTargets.length) {
      messageFeedbackEl.textContent = "Destinataire invalide.";
      return;
    }

    let sent = false;

    if (teamTargets.length) {
      const ok = await sendMessage({
        channel: "team",
        targets: teamTargets,
        text,
        feedbackEl: messageFeedbackEl,
        buttonEl: sendMessageBtn,
        successText: "Message envoyé aux cibles équipes sélectionnées.",
      });
      sent = sent || ok;
    }

    if (characterTargets.length) {
      const ok = await sendMessage({
        channel: "character",
        targets: characterTargets,
        text,
        feedbackEl: messageFeedbackEl,
        buttonEl: sendMessageBtn,
        successText: "Message envoyé aux cibles personnages sélectionnées.",
      });
      sent = sent || ok;
    }

    if (sent) {
      messageInputEl.value = "";
      await refresh();
    }
  });

  if (sortSelectEl) {
    sortSelectEl.value = readSortMode();
    sortSelectEl.addEventListener("change", async () => {
      const selected = SORT_MODES.includes(sortSelectEl.value) ? sortSelectEl.value : "latest_message";
      writeSortMode(selected);
      await refresh();
    });
  }

  listEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = String(button.dataset.action || "");
    const teamToken = String(button.dataset.token || "");
    const teamName = String(button.dataset.teamName || "Équipe sans nom");
    if (!teamToken) return;

    if (action === "show-team-qr") {
      openTeamQrModal(teamToken, teamName);
      return;
    }

    if (action === "delete-team") {
      button.disabled = true;
      try {
        await deleteTeam(teamToken, teamName);
      } finally {
        button.disabled = false;
      }
    }
  });

  async function init() {
    const auth = await window.CluedoAuth.requireAdminAccess();
    if (!auth.ok) {
      return;
    }

    adminPin = auth.pinEnabled ? auth.pin : "";
    await refresh();
    setInterval(refresh, 3000);
  }

  init();
})();
