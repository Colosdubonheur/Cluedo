document.addEventListener("DOMContentLoaded", () => {
  const TOKEN_KEY = "cluedo_player_token";
  const TEAM_KEY = "cluedo_team_name";
  const AUDIO_ENABLED_KEY = "cluedo_team_audio_enabled";

  let token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  if (!token) token = crypto.randomUUID();
  localStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_KEY, token);

  const displayNameEl = document.getElementById("team-display-name");
  const heroTeamNameEl = document.getElementById("team-hero-name");
  const teamNameInput = document.getElementById("team-name");
  const playersWrap = document.getElementById("team-players");
  const savePlayersBtn = document.getElementById("save-players");
  const profileForm = document.getElementById("team-profile-form");
  const feedbackName = document.getElementById("team-name-feedback");
  const participantsGuidanceEl = document.getElementById("team-guidance-participants");
  const photoGuidanceEl = document.getElementById("team-guidance-photo");
  const historyEl = document.getElementById("team-history");
  const globalEl = document.getElementById("team-global");
  const charactersEl = document.getElementById("team-characters");
  const characterSortEl = document.getElementById("team-character-sort");
  const characterFilterUnseenEl = document.getElementById("team-character-filter-unseen");
  const characterFeedbackEl = document.getElementById("team-character-feedback");
  const lockMessageEl = document.getElementById("team-lock-message");
  const messageEl = document.getElementById("team-message");
  const audioEnableBtn = document.getElementById("team-audio-enable-btn");
  const audioStatusEl = document.getElementById("team-audio-status");

  const messageAudio = new Audio("./assets/message.wav");
  messageAudio.preload = "auto";

  let latestState = null;
  let isQueueActionInProgress = false;
  let characterSortMode = "name";
  let filterOnlyUnseen = false;
  let lastMessageText = "";

  function fmt(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function hasValidTeamName(name) {
    return String(name || "").trim().length > 0;
  }

  function getPlayers() {
    return Array.from(playersWrap.querySelectorAll("input")).map((input) => input.value.trim());
  }

  function countValidPlayers(players) {
    return players.filter((name) => name.length > 0).length;
  }

  function ensurePlayerInputs(players = []) {
    playersWrap.innerHTML = "";
    for (let i = 0; i < 10; i += 1) {
      const row = document.createElement("div");
      row.className = "team-input-row";
      const label = document.createElement("label");
      label.setAttribute("for", `team-player-${i + 1}`);
      label.textContent = `Participant ${i + 1}`;
      const input = document.createElement("input");
      input.id = `team-player-${i + 1}`;
      input.type = "text";
      input.className = "admin-input";
      input.maxLength = 40;
      input.placeholder = "Prénom";
      input.value = players[i] || "";
      row.append(label, input);
      playersWrap.appendChild(row);
    }
  }

  function setFeedback(el, message, status = "neutral") {
    el.textContent = String(message || "");
    el.classList.remove("is-success", "is-error", "is-processing");
    if (status === "success") el.classList.add("is-success");
    if (status === "error") el.classList.add("is-error");
    if (status === "processing") el.classList.add("is-processing");
  }

  function updateTeamNameUi(name) {
    const resolved = String(name || "").trim() || "Équipe sans nom";
    displayNameEl.textContent = resolved;
    heroTeamNameEl.textContent = resolved;
    if (hasValidTeamName(name)) localStorage.setItem(TEAM_KEY, String(name).trim());
  }

  function resolveInitialization(profile) {
    const teamName = String(profile?.team_name || "").trim();
    const players = Array.isArray(profile?.players) ? profile.players.map((v) => String(v || "").trim()) : [];
    const validPlayers = countValidPlayers(players);
    const isTeamNameValid = hasValidTeamName(teamName);
    return {
      teamName,
      players,
      validPlayers,
      isTeamNameValid,
      isReady: isTeamNameValid && validPlayers >= 2,
    };
  }

  async function saveProfile() {
    const payload = {
      token,
      team_name: teamNameInput.value.trim(),
      players: getPlayers(),
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

    const init = resolveInitialization(latestState.team?.profile || {});
    if (!init.isReady) return;

    const currentCharacterId = String(latestState.team?.state?.character_id || "");

    isQueueActionInProgress = true;
    try {
      if (currentCharacterId === String(characterId)) {
        await leaveQueue(characterId);
      } else {
        let joinResult = await joinQueue(characterId, init.teamName, false);
        if (joinResult?.state === "already_in_queue" && joinResult?.can_join_after_confirm) {
          const fromName = joinResult.current_engagement?.personnage_nom || "un autre personnage";
          const confirmed = window.confirm(`Votre équipe est déjà en file pour « ${fromName} ». Confirmer le changement ?`);
          if (!confirmed) return;
          joinResult = await joinQueue(characterId, init.teamName, true);
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
      charactersEl.innerHTML = '<p class="team-feedback">Aucun personnage à afficher avec ce filtre.</p>';
      return;
    }

    const currentCharacterId = String(state.team?.state?.character_id || "");
    const list = document.createElement("ul");
    list.className = "team-character-list";

    rows.forEach((row) => {
      const item = document.createElement("li");
      item.className = "team-character-item";

      const isCurrent = currentCharacterId === String(row.id);
      const button = `<button type="button" class="admin-button team-character-action-btn" data-id="${String(row.id)}" ${isBlocked || isQueueActionInProgress ? "disabled" : ""}>${isCurrent ? "Quitter cette file" : "Rejoindre la file"}</button>`;
      const photo = row.photo ? `<img src="${row.photo}" alt="${row.nom}" class="team-character-photo"/>` : "<div class=\"team-character-photo team-character-photo-placeholder\">Photo indisponible</div>";
      const unseenBadge = seen.has(String(row.id || "")) ? "" : '<p class="team-feedback is-success">Jamais vu</p>';

      item.innerHTML = `
        <h3>${row.nom || "Personnage"}</h3>
        ${photo}
        <p><strong>Localisation :</strong> ${row.location || "Non renseignée"}</p>
        <p><strong>Attente estimée :</strong> ${fmt(row.estimated_wait_seconds || 0)}</p>
        ${unseenBadge}
        ${button}
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

  async function maybePlayMessageSound(messageText) {
    const enabled = localStorage.getItem(AUDIO_ENABLED_KEY) === "1";
    if (!enabled || !messageText || messageText === lastMessageText) return;
    lastMessageText = messageText;
    messageAudio.currentTime = 0;
    try { await messageAudio.play(); } catch (_error) { /* noop */ }
  }

  function renderLockState(init) {
    const tooFew = init.validPlayers < 2;
    const tooMany = init.validPlayers > 10;
    const missingName = !init.isTeamNameValid;
    const isBlocked = missingName || tooFew || tooMany;

    if (missingName) {
      setFeedback(participantsGuidanceEl, "Nom d'équipe obligatoire.", "error");
    } else if (tooFew) {
      setFeedback(participantsGuidanceEl, "Au moins 2 participants sont requis (max 10).", "error");
    } else if (tooMany) {
      setFeedback(participantsGuidanceEl, "Maximum 10 participants autorisés.", "error");
    } else {
      setFeedback(participantsGuidanceEl, `Équipe initialisée (${init.validPlayers} participants).`, "success");
    }

    lockMessageEl.textContent = isBlocked
      ? "Blocage actif : vous devez saisir un nom d'équipe et au moins 2 prénoms avant toute action sur les personnages."
      : "Espace équipe prêt : vous pouvez gérer les files des personnages.";
    lockMessageEl.classList.toggle("is-error", isBlocked);
    lockMessageEl.classList.toggle("is-success", !isBlocked);

    return isBlocked;
  }

  async function loadHub() {
    const response = await fetch(`./api/team_hub.php?token=${encodeURIComponent(token)}`);
    const state = await response.json();
    if (!response.ok || !state.ok) throw new Error(state.error || "hub failed");

    latestState = state;
    const profile = state.team?.profile || {};
    const init = resolveInitialization(profile);

    teamNameInput.value = init.teamName;
    ensurePlayerInputs(init.players);
    updateTeamNameUi(init.teamName);

    const isBlocked = renderLockState(init);
    renderCharactersList(state, isBlocked);

    const messageText = String(state.team?.message?.message || "").trim();
    messageEl.textContent = messageText || "Aucun message reçu.";
    void maybePlayMessageSound(messageText);

    const historyRows = Array.isArray(state.team?.history) ? state.team.history : [];
    historyEl.innerHTML = historyRows.length
      ? `<h3>Historique équipe</h3><ul>${historyRows.map((row) => `<li>${row.nom}: ${fmt(row.duration_seconds || 0)}</li>`).join("")}</ul>`
      : "";

    const teamState = state.team?.state?.state || "free";
    globalEl.textContent = teamState === "free" ? "Votre équipe n'est dans aucune file." : `État courant : ${teamState}`;
    photoGuidanceEl.textContent = "La photo d'équipe reste optionnelle.";

    setFeedback(characterFeedbackEl, isBlocked ? "Actions personnages désactivées tant que l'équipe n'est pas initialisée." : "Sélectionnez un personnage pour rejoindre ou quitter sa file.", isBlocked ? "error" : "success");
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

  savePlayersBtn.addEventListener("click", () => {
    profileForm.requestSubmit();
  });

  characterSortEl?.addEventListener("change", () => {
    characterSortMode = characterSortEl.value === "wait" ? "wait" : "name";
    if (latestState) {
      const init = resolveInitialization(latestState.team?.profile || {});
      renderCharactersList(latestState, !init.isReady);
    }
  });

  characterFilterUnseenEl?.addEventListener("change", () => {
    filterOnlyUnseen = characterFilterUnseenEl.checked;
    if (latestState) {
      const init = resolveInitialization(latestState.team?.profile || {});
      renderCharactersList(latestState, !init.isReady);
    }
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
