(function () {
  const listEl = document.getElementById("teams");
  const resetBtn = document.getElementById("reset-history");
  const toggleEndGameBtn = document.getElementById("toggle-end-game");
  const endGameStatusEl = document.getElementById("monitor-end-game-status");

  const messageTargetSearchEl = document.getElementById("monitor-message-target-search");
  const messageTargetEl = document.getElementById("monitor-message-target");
  const messageInputEl = document.getElementById("monitor-message-text");
  const sendMessageBtn = document.getElementById("send-monitor-message");
  const messageFeedbackEl = document.getElementById("monitor-message-feedback");

  let messageTargets = [];

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

  function statusInfo(team) {
    if (team.state === "active") {
      return { css: "is-with-character", text: "Avec personnage", characterName: team.current_personnage?.nom || "" };
    }
    if (team.state === "waiting") {
      return { css: "is-waiting", text: "En attente", characterName: team.waiting_queue?.nom || "" };
    }
    return { css: "is-free", text: "Équipe libre", characterName: "" };
  }

  function renderPlayers(team) {
    const players = Array.isArray(team.players) ? team.players.filter((name) => String(name || "").trim() !== "") : [];
    return players.length
      ? `<p class="monitor-players">${players.map((name) => escapeHtml(name)).join(" · ")}</p>`
      : '<p class="monitor-muted">Membres non renseignés.</p>';
  }

  function renderHistory(team) {
    const rows = Array.isArray(team.history) ? team.history.slice().reverse().slice(0, 8) : [];
    if (!rows.length) {
      return '<p class="monitor-muted">Aucun passage enregistré.</p>';
    }

    return `<ul class="monitor-history-list">${rows
      .map((entry) => {
        const charName = escapeHtml(entry?.personnage?.nom || "Personnage");
        const start = formatTime(entry?.started_at || 0);
        const duration = Math.max(0, Number(entry?.duration_seconds || 0));
        return `<li><span>${charName}</span><span>Début ${start}</span><span>${duration}s</span></li>`;
      })
      .join("")}</ul>`;
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
    const photoHtml = team.photo
      ? `<img src="${escapeHtml(team.photo)}" alt="Photo ${escapeHtml(team.team_name || "équipe")}" class="monitor-team-photo"/>`
      : '<div class="monitor-team-photo monitor-team-photo-placeholder" aria-hidden="true"></div>';

    return `<article class="card monitor-team-card">
      <header class="monitor-team-header">
        ${photoHtml}
        <div class="monitor-team-header-meta">
          <h3 class="monitor-team-name">${escapeHtml(team.team_name || "Équipe sans nom")}</h3>
          <span class="monitor-status ${status.css}">${escapeHtml(status.text)}</span>
          ${status.characterName ? `<p class="monitor-character-context">${escapeHtml(status.characterName)}</p>` : ""}
        </div>
      </header>
      <section>
        <h4>Dernier message reçu</h4>
        ${renderMessageSummary(team)}
      </section>
      <section>
        <h4>Historique des passages</h4>
        ${renderHistory(team)}
      </section>
      <section>
        <h4>Membres de l'équipe</h4>
        ${renderPlayers(team)}
      </section>
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

    const response = await fetch("./api/supervision.php", {
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
    const isActive = !!gameState?.end_game_active;
    toggleEndGameBtn.textContent = isActive ? "Annuler la fin de jeu" : "Fin de jeu";
    toggleEndGameBtn.classList.toggle("is-active", isActive);
    endGameStatusEl.textContent = isActive
      ? "🔴 Fin de jeu active : aucune nouvelle entrée en file."
      : "🟢 Fin de jeu inactive : fonctionnement normal des files.";
  }

  async function setEndGame(active) {
    const prompt = active
      ? "Confirmer l'activation de la fin de jeu ? Les équipes en cours continuent, mais aucune nouvelle entrée en file ne sera autorisée."
      : "Confirmer l'annulation de la fin de jeu ?";

    if (!window.confirm(prompt)) {
      return;
    }

    toggleEndGameBtn.disabled = true;
    const body = new URLSearchParams({
      action: "set_end_game",
      active: active ? "1" : "0",
    });

    const response = await fetch("./api/supervision.php", {
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

  async function refresh() {
    const response = await fetch(`./api/supervision.php?t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      listEl.textContent = "Erreur de chargement.";
      return;
    }

    fillMessageTargets(payload.teams || [], Array.isArray(payload.characters) ? payload.characters : []);
    renderEndGameControls(payload.game_state || {});

    if (!payload.teams.length) {
      listEl.textContent = "Aucune équipe connue.";
      return;
    }

    listEl.innerHTML = payload.teams.map(renderCard).join("");
  }

  resetBtn.addEventListener("click", async () => {
    if (!window.confirm("Remettre tout l'historique à zéro ?")) return;

    resetBtn.disabled = true;
    const response = await fetch("./api/supervision.php", {
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

  messageTargetSearchEl.addEventListener("input", () => {
    renderMessageTargetOptions(getSelectedTarget());
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

  refresh();
  setInterval(refresh, 3000);
})();
