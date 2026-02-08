document.addEventListener("DOMContentLoaded", () => {
  const TOKEN_KEY = "cluedo_player_token";
  const TEAM_KEY = "cluedo_team_name";
  const AUDIO_ENABLED_KEY = "cluedo_team_audio_enabled";

  let token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  if (!token) token = crypto.randomUUID();
  localStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_KEY, token);

  const heroTeamNameEl = document.getElementById("team-hero-name");
  const editNameBtn = document.getElementById("team-edit-name-btn");
  const teamNameInput = document.getElementById("team-name");
  const playersWrap = document.getElementById("team-players");
  const playerInput = document.getElementById("team-player-input");
  const addPlayerBtn = document.getElementById("team-player-add-btn");
  const profileForm = document.getElementById("team-profile-form");
  const feedbackName = document.getElementById("team-name-feedback");
  const charactersEl = document.getElementById("team-characters");
  const characterSortEl = document.getElementById("team-character-sort");
  const characterFilterUnseenEl = document.getElementById("team-character-filter-unseen");
  const characterFeedbackEl = document.getElementById("team-character-feedback");
  const lockMessageEl = document.getElementById("team-lock-message");
  const messageEl = document.getElementById("team-message");
  const endGameBannerEl = document.getElementById("team-end-game-banner");
  const audioEnableBtn = document.getElementById("team-audio-enable-btn");
  const audioStatusEl = document.getElementById("team-audio-status");

  const messageAudio = new Audio("./assets/message.wav");
  messageAudio.preload = "auto";

  let latestState = null;
  let isQueueActionInProgress = false;
  let characterSortMode = "name";
  let filterOnlyUnseen = false;
  let players = [];
  let lastMessageKey = "";

  function fmt(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    if (s === 0) return "Disponible";
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function hasValidTeamName(name) {
    return String(name || "").trim().length > 0;
  }

  function countValidPlayers(list) {
    return list.filter((name) => String(name || "").trim().length > 0).length;
  }

  function setFeedback(el, message, status = "neutral") {
    if (!el) return;
    el.textContent = String(message || "");
    el.classList.remove("is-success", "is-error", "is-processing");
    if (status === "success") el.classList.add("is-success");
    if (status === "error") el.classList.add("is-error");
    if (status === "processing") el.classList.add("is-processing");
  }

  function updateTeamNameUi(name) {
    const resolved = String(name || "").trim() || "Équipe sans nom";
    heroTeamNameEl.textContent = resolved;
    if (hasValidTeamName(name)) localStorage.setItem(TEAM_KEY, String(name).trim());
  }

  function resolveInitialization(profile) {
    const teamName = String(profile?.team_name || "").trim();
    const profilePlayers = Array.isArray(profile?.players)
      ? profile.players.map((value) => String(value || "").trim()).filter((value) => value.length > 0)
      : [];
    const validPlayers = countValidPlayers(profilePlayers);
    const isTeamNameValid = hasValidTeamName(teamName);
    return {
      teamName,
      players: profilePlayers,
      validPlayers,
      isTeamNameValid,
      isReady: isTeamNameValid && validPlayers >= 2,
    };
  }

  function renderPlayers() {
    playersWrap.innerHTML = "";
    players.forEach((name, index) => {
      const item = document.createElement("li");
      item.className = "team-player-item";
      const text = document.createElement("span");
      text.textContent = name;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "team-player-remove";
      removeBtn.dataset.index = String(index);
      removeBtn.setAttribute("aria-label", `Supprimer ${name}`);
      removeBtn.textContent = "✕";
      item.append(text, removeBtn);
      playersWrap.appendChild(item);
    });
  }

  function getWaitColorClass(row) {
    const queueTotal = Number(row.queue_total || 0);
    const waitingCount = Number(row.waiting_count || 0);
    const hasActiveTeam = queueTotal >= 1;
    if (hasActiveTeam && waitingCount >= 2) return "is-wait-red";
    if (hasActiveTeam && waitingCount === 1) return "is-wait-orange";
    return "is-wait-green";
  }

  async function saveProfile() {
    const payload = {
      token,
      team_name: teamNameInput.value.trim(),
      players,
    };

    const response = await fetch("./api/team_profile.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "save failed");
    return result.profile;
  }

  async function leaveQueue(characterId) {
    await fetch("./api/leave_queue.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: characterId, token }),
    });
  }

  async function joinQueue(characterId, teamName, forceSwitch = false) {
    const params = new URLSearchParams({
      id: characterId,
      token,
      team_name: teamName,
      join: "1",
    });
    if (forceSwitch) params.set("force_switch", "1");
    const response = await fetch(`./api/status.php?${params.toString()}`);
    return response.json();
  }

  async function onQueueAction(characterId) {
    if (!latestState || isQueueActionInProgress) return;

    const init = resolveInitialization({ team_name: teamNameInput.value, players });
    if (!init.isReady) return;

    const currentCharacterId = String(latestState.team?.state?.character_id || "");
    const endGameActive = isEndGameActive(latestState);

    if (endGameActive && currentCharacterId !== String(characterId)) {
      setFeedback(characterFeedbackEl, "Fin de jeu active : impossible de rejoindre une nouvelle file.", "error");
      return;
    }

    isQueueActionInProgress = true;
    try {
      if (currentCharacterId === String(characterId)) {
        await leaveQueue(characterId);
      } else {
        let joinResult = await joinQueue(characterId, init.teamName, false);
        if (joinResult?.error === "end_game_active") {
          setFeedback(characterFeedbackEl, "Fin de jeu active : impossible de rejoindre une nouvelle file.", "error");
          await loadHub();
          return;
        }
        if (joinResult?.state === "already_in_queue" && joinResult?.can_join_after_confirm) {
          const fromName = joinResult.current_engagement?.personnage_nom || "un autre personnage";
          const confirmed = window.confirm(`Votre équipe est déjà en file pour « ${fromName} ». Confirmer le changement ?`);
          if (!confirmed) return;
          joinResult = await joinQueue(characterId, init.teamName, true);
          if (joinResult?.error === "end_game_active") {
            setFeedback(characterFeedbackEl, "Fin de jeu active : impossible de rejoindre une nouvelle file.", "error");
            await loadHub();
            return;
          }
        }
      }
      await loadHub();
    } finally {
      isQueueActionInProgress = false;
    }
  }

  function renderCharactersList(state, isBlocked) {
    const seen = new Set((state.team?.history || []).map((entry) => String(entry.id || "")));
    let rows = Array.isArray(state.global) ? [...state.global] : [];

    if (filterOnlyUnseen) {
      rows = rows.filter((row) => !seen.has(String(row.id || "")));
    }

    rows.sort((a, b) => {
      if (characterSortMode === "wait") return (a.estimated_wait_seconds || 0) - (b.estimated_wait_seconds || 0);
      return String(a.nom || "").localeCompare(String(b.nom || ""), "fr");
    });

    if (rows.length === 0) {
      charactersEl.innerHTML = '<p class="team-feedback">Aucun suspect à afficher avec ce filtre.</p>';
      return;
    }

    const currentCharacterId = String(state.team?.state?.character_id || "");
    const list = document.createElement("ul");
    list.className = "team-character-list";

    rows.forEach((row) => {
      const item = document.createElement("li");
      item.className = "team-character-item";

      const isCurrent = currentCharacterId === String(row.id);
      const endGameActive = isEndGameActive(state);
      const blockedByEndGame = endGameActive && !isCurrent;
      const buttonLabel = isCurrent ? "Quitter cette file" : "Rejoindre la file";
      const photo = row.photo
        ? `<img src="${row.photo}" alt="${row.nom}" class="team-character-photo"/>`
        : '<div class="team-character-photo team-character-photo-placeholder">Photo indisponible</div>';
      const unseenBadge = seen.has(String(row.id || "")) ? "" : '<span class="team-seen-badge">Jamais vu</span>';
      const waitClass = getWaitColorClass(row);

      item.innerHTML = `
        ${photo}
        <div class="team-character-meta">
          <h3>${row.nom || "Personnage"}</h3>
          <p class="team-character-line">🏠 ${row.location || "Non renseignée"}</p>
          <p class="team-character-line team-character-wait ${waitClass}">⏱ ${fmt(row.estimated_wait_seconds || 0)}</p>
          ${unseenBadge}
          <button type="button" class="admin-button team-character-action-btn" data-id="${String(row.id)}" ${isBlocked || isQueueActionInProgress || blockedByEndGame ? "disabled" : ""}>${buttonLabel}</button>
        </div>
      `;
      list.appendChild(item);
    });

    charactersEl.innerHTML = "";
    charactersEl.appendChild(list);

    list.querySelectorAll(".team-character-action-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        void onQueueAction(btn.dataset.id || "");
      });
    });
  }

  async function maybePlayMessageSound(messageText, createdAt) {
    const enabled = localStorage.getItem(AUDIO_ENABLED_KEY) === "1";
    const key = `${messageText}::${String(createdAt || 0)}`;
    if (!enabled || !messageText || key === lastMessageKey) return;
    lastMessageKey = key;
    messageAudio.currentTime = 0;
    try { await messageAudio.play(); } catch (_error) { /* noop */ }
  }

  function renderLockState(init) {
    const tooFew = init.validPlayers < 2;
    const tooMany = init.validPlayers > 10;
    const missingName = !init.isTeamNameValid;
    const isBlocked = missingName || tooFew || tooMany;

    if (isBlocked) {
      setFeedback(lockMessageEl, "Complétez le nom d'équipe et ajoutez entre 2 et 10 participants pour accéder aux files.", "error");
      setFeedback(characterFeedbackEl, "Actions sur les files bloquées tant que les informations de l'équipe ne sont pas complètes.", "error");
    } else {
      setFeedback(lockMessageEl, "", "neutral");
      setFeedback(characterFeedbackEl, "Sélectionnez un suspect pour rejoindre ou quitter sa file.", "success");
    }

    return isBlocked;
  }

  async function loadHub() {
    const response = await fetch(`./api/team_hub.php?token=${encodeURIComponent(token)}`);
    const state = await response.json();
    if (!response.ok || !state.ok) throw new Error(state.error || "hub failed");

    latestState = state;
    renderEndGameBanner(state);
    const profile = state.team?.profile || {};
    const init = resolveInitialization(profile);

    teamNameInput.value = init.teamName;
    players = [...init.players];
    renderPlayers();
    updateTeamNameUi(init.teamName);

    const isBlocked = renderLockState(init);
    renderCharactersList(state, isBlocked);
    if (isEndGameActive(state) && state.team?.state?.state === "free") {
      setFeedback(characterFeedbackEl, "Fin de jeu active : vous ne pouvez plus rejoindre de file.", "error");
    }

    const messagePayload = state.team?.message || {};
    const messageText = String(messagePayload.text || "").trim();
    messageEl.textContent = messageText || "Aucun message reçu.";
    void maybePlayMessageSound(messageText, messagePayload.created_at || 0);
  }


  function isEndGameActive(state) {
    return !!state?.game_state?.end_game_active;
  }

  function renderEndGameBanner(state) {
    const active = isEndGameActive(state);
    endGameBannerEl.hidden = !active;
  }
  function addPlayerFromInput() {
    const value = String(playerInput.value || "").trim();
    if (!value) return;
    if (players.length >= 10) {
      setFeedback(feedbackName, "Maximum 10 participants autorisés.", "error");
      return;
    }
    players.push(value);
    playerInput.value = "";
    renderPlayers();
    setFeedback(feedbackName, "", "neutral");
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback(feedbackName, "Sauvegarde en cours…", "processing");
    try {
      const saved = await saveProfile();
      updateTeamNameUi(saved.team_name || "");
      await loadHub();
      setFeedback(feedbackName, "Profil équipe sauvegardé.", "success");
    } catch (_error) {
      setFeedback(feedbackName, "Impossible de sauvegarder le profil.", "error");
    }
  });

  addPlayerBtn?.addEventListener("click", addPlayerFromInput);

  playerInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addPlayerFromInput();
  });

  playersWrap?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (!target.classList.contains("team-player-remove")) return;
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= players.length) return;
    players.splice(index, 1);
    renderPlayers();
  });

  characterSortEl?.addEventListener("change", () => {
    characterSortMode = characterSortEl.value === "wait" ? "wait" : "name";
    if (!latestState) return;
    const init = resolveInitialization({ team_name: teamNameInput.value, players });
    renderCharactersList(latestState, !init.isReady);
  });

  characterFilterUnseenEl?.addEventListener("change", () => {
    filterOnlyUnseen = characterFilterUnseenEl.checked;
    if (!latestState) return;
    const init = resolveInitialization({ team_name: teamNameInput.value, players });
    renderCharactersList(latestState, !init.isReady);
  });

  editNameBtn?.addEventListener("click", () => {
    teamNameInput.focus();
    teamNameInput.select();
    teamNameInput.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  audioEnableBtn?.addEventListener("click", () => {
    localStorage.setItem(AUDIO_ENABLED_KEY, "1");
    setFeedback(audioStatusEl, "Son activé pour les nouveaux messages.", "success");
    audioEnableBtn.textContent = "🔔 Son activé";
  });

  setFeedback(audioStatusEl, localStorage.getItem(AUDIO_ENABLED_KEY) === "1" ? "Son activé pour les nouveaux messages." : "Son désactivé.");

  loadHub().catch(() => {
    setFeedback(feedbackName, "Impossible de charger l'espace équipe.", "error");
  });

  setInterval(() => {
    loadHub().catch(() => {
      setFeedback(characterFeedbackEl, "Rafraîchissement temporairement indisponible.", "error");
    });
  }, 3000);
});
