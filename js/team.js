document.addEventListener("DOMContentLoaded", () => {
  const TOKEN_KEY = "cluedo_player_token";
  const TEAM_KEY = "cluedo_team_name";
  const MESSAGE_HISTORY_VERSION = "v1";
  const SEEN_THRESHOLD_SECONDS = 30;
  const DEFAULT_TEAM_NAME = "Équipe sans nom";

  const TEST_SLOT_KEY = "cluedo_test_slot";
  const DEFAULT_TEST_SLOT = "slot1";
  const TEST_SLOTS = ["slot1", "slot2", "slot3", "slot4"];

  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = String(params.get("token") || "").trim();
  const isTestMode = params.get("test") === "1";

  function activeTestSlot() {
    const storedSlot = String(localStorage.getItem(TEST_SLOT_KEY) || "").trim();
    if (TEST_SLOTS.includes(storedSlot)) return storedSlot;
    return DEFAULT_TEST_SLOT;
  }

  function tokenStorageKey() {
    return `${TOKEN_KEY}_${activeTestSlot()}`;
  }

  let token = tokenFromUrl || localStorage.getItem(tokenStorageKey()) || sessionStorage.getItem(tokenStorageKey());
  if (!token) token = crypto.randomUUID();
  localStorage.setItem(tokenStorageKey(), token);
  sessionStorage.setItem(tokenStorageKey(), token);

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
  const currentCharacterEl = document.getElementById("team-current-character");
  const messageHistoryEl = document.getElementById("team-message-history");
  const endGameBannerEl = document.getElementById("team-end-game-banner");
  const audioEnableBtn = document.getElementById("team-audio-enable-btn");
  const audioHintEl = document.getElementById("team-audio-hint");
  const teamPhotoPreviewEl = document.getElementById("team-photo-preview");
  const teamPhotoEmptyEl = document.getElementById("team-photo-empty");
  const teamPhotoInputEl = document.getElementById("team-photo-input");
  const teamPhotoSelectBtn = document.getElementById("team-photo-select-btn");
  const teamPhotoUploadBtn = document.getElementById("team-photo-upload-btn");
  const teamPhotoFeedbackEl = document.getElementById("team-photo-feedback");
  const testSlotControlsEl = document.getElementById("team-test-slot-controls");
  const testSlotSelectEl = document.getElementById("team-test-slot-select");

  const messageAudio = new Audio("./assets/message.wav");
  messageAudio.preload = "auto";
  const soundOnAudio = new Audio("./assets/soundon.wav");
  soundOnAudio.preload = "auto";
  const exitAudio = new Audio("./assets/exit.mp3");
  exitAudio.preload = "auto";

  let latestState = null;
  let isQueueActionInProgress = false;
  let characterSortMode = "name";
  let filterOnlyUnseen = false;
  let players = [];
  let lastMessageKey = "";
  let lastPlayedMessageKey = "";
  let lastMessagesClearedAt = 0;
  let isProfileEditing = false;
  let hubRequestSequence = 0;
  let lastAppliedHubSequence = 0;
  let pollingPausedCount = 0;
  let audioEnabled = false;
  let currentTeamPhotoPath = "";
  let previousRemainingSeconds = null;
  let criticalAlertPlayedFor = "";
  const messageHistory = [];
  const messageHistoryKeys = new Set();

  function setAudioEnabled(nextValue) {
    audioEnabled = !!nextValue;
    syncAudioButtonState();
  }

  function isAudioPermissionError(error) {
    if (!error || typeof error !== "object") return false;
    const errorName = String(error.name || "").trim();
    return errorName === "NotAllowedError" || errorName === "SecurityError";
  }

  function syncAudioCapabilityAfterPlaybackFailure(error) {
    if (!isAudioPermissionError(error)) return;
    // The browser rejected playback permissions for the current page context.
    // Keep the UI aligned with actual capability until the user taps again.
    setAudioEnabled(false);
  }

  async function primeAudioElement(audioEl) {
    const previousMuted = audioEl.muted;
    const previousVolume = audioEl.volume;

    audioEl.currentTime = 0;
    audioEl.muted = true;
    audioEl.volume = 0;
    await audioEl.play();
    audioEl.pause();
    audioEl.currentTime = 0;

    audioEl.muted = previousMuted;
    audioEl.volume = previousVolume;
  }

  function initializeTestSlotSelector() {
    if (!testSlotControlsEl || !testSlotSelectEl) return;
    if (!isTestMode) {
      testSlotControlsEl.hidden = true;
      return;
    }

    testSlotControlsEl.hidden = false;
    testSlotSelectEl.value = activeTestSlot();
    testSlotSelectEl.addEventListener("change", () => {
      const nextSlot = String(testSlotSelectEl.value || "").trim();
      const resolvedSlot = TEST_SLOTS.includes(nextSlot) ? nextSlot : DEFAULT_TEST_SLOT;
      localStorage.setItem(TEST_SLOT_KEY, resolvedSlot);
      window.location.reload();
    });
  }

  function getMessageStorageKey() {
    return `cluedo_team_message_history_${MESSAGE_HISTORY_VERSION}_${token}`;
  }

  function persistMessageHistory() {
    try {
      const payload = JSON.stringify(messageHistory);
      localStorage.setItem(getMessageStorageKey(), payload);
      sessionStorage.setItem(getMessageStorageKey(), payload);
    } catch (_error) {
      // Ignore storage failures (private mode, quota, ...)
    }
  }

  function loadPersistedMessageHistory() {
    const storageKey = getMessageStorageKey();
    const serialized = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey);
    if (!serialized) return;
    try {
      const parsed = JSON.parse(serialized);
      if (!Array.isArray(parsed)) return;
      parsed.forEach((entry) => {
        const key = String(entry?.key || "");
        const text = String(entry?.text || "").trim();
        if (!key || !text || messageHistoryKeys.has(key)) return;
        messageHistory.push({
          key,
          text,
          time: String(entry?.time || formatTimestamp(0)),
        });
        messageHistoryKeys.add(key);
      });
      if (messageHistory.length > 0) {
        lastMessageKey = messageHistory[messageHistory.length - 1].key;
        lastPlayedMessageKey = lastMessageKey;
      }
    } catch (_error) {
      // Ignore malformed storage and continue with a clean state.
    }
  }


  function clearPersistedMessageHistoryForCurrentToken() {
    const storageKey = getMessageStorageKey();
    localStorage.removeItem(storageKey);
    sessionStorage.removeItem(storageKey);
  }

  function resetRuntimeStateForFreshTeam() {
    messageHistory.length = 0;
    messageHistoryKeys.clear();
    lastMessageKey = "";
    lastPlayedMessageKey = "";
    previousRemainingSeconds = null;
    criticalAlertPlayedFor = "";
    players = [];
    clearPersistedMessageHistoryForCurrentToken();
    localStorage.removeItem(TEAM_KEY);
    renderMessageHistory();
    renderPlayers();
  }

  function clearMessageHistoryFromSupervision(clearedAt) {
    const clearedTimestamp = Number(clearedAt || 0);
    if (!Number.isFinite(clearedTimestamp) || clearedTimestamp <= 0 || clearedTimestamp <= lastMessagesClearedAt) {
      return;
    }

    lastMessagesClearedAt = clearedTimestamp;
    messageHistory.length = 0;
    messageHistoryKeys.clear();
    lastMessageKey = "";
    lastPlayedMessageKey = "";
    clearPersistedMessageHistoryForCurrentToken();
    renderMessageHistory();
  }


  function rotateInvalidatedTeamToken() {
    token = crypto.randomUUID();
    localStorage.setItem(tokenStorageKey(), token);
    sessionStorage.setItem(tokenStorageKey(), token);
    lastAppliedHubSequence = 0;
    hubRequestSequence = 0;
    clearProfileEditing();
    resetRuntimeStateForFreshTeam();
    currentTeamPhotoPath = "";
    teamNameInput.value = "";
    updateTeamNameUi("");
    renderTeamPhoto("");
    setFeedback(feedbackName, "Cette équipe a été supprimée par la supervision. Merci de réinitialiser votre équipe.", "error");
  }

  function fmt(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    if (s === 0) return "Disponible";
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function formatTimestamp(ts) {
    const raw = Number(ts || 0);
    const date = raw > 0 ? new Date(raw * 1000) : new Date();
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function hasValidTeamName(name) {
    const resolved = String(name || "").trim();
    return resolved.length > 0 && resolved !== DEFAULT_TEAM_NAME;
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

  function pausePolling() {
    pollingPausedCount += 1;
  }

  function resumePolling() {
    pollingPausedCount = Math.max(0, pollingPausedCount - 1);
  }

  async function runWithPollingPaused(callback) {
    pausePolling();
    try {
      return await callback();
    } finally {
      resumePolling();
    }
  }

  function updateTeamNameUi(name) {
    const resolved = String(name || "").trim() || DEFAULT_TEAM_NAME;
    heroTeamNameEl.textContent = resolved;
    if (hasValidTeamName(name)) localStorage.setItem(TEAM_KEY, String(name).trim());
  }

  function resolveInitialization(profile) {
    const teamName = String(profile?.team_name || "").trim();
    const photoPath = String(profile?.photo || currentTeamPhotoPath || "").trim();
    const profilePlayers = Array.isArray(profile?.players)
      ? profile.players.map((value) => String(value || "").trim()).filter((value) => value.length > 0)
      : [];
    const validPlayers = countValidPlayers(profilePlayers);
    const isTeamNameValid = hasValidTeamName(teamName);
    const hasTeamPhoto = photoPath.length > 0;
    return {
      teamName,
      photoPath,
      players: profilePlayers,
      validPlayers,
      isTeamNameValid,
      hasTeamPhoto,
      isReady: isTeamNameValid && validPlayers > 0 && hasTeamPhoto,
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

  function renderMessageHistory() {
    messageHistoryEl.innerHTML = "";
    if (messageHistory.length === 0) {
      const empty = document.createElement("p");
      empty.className = "team-message-empty";
      empty.textContent = "Aucun message reçu.";
      messageHistoryEl.appendChild(empty);
      return;
    }

    for (const entry of [...messageHistory].reverse()) {
      const row = document.createElement("div");
      row.className = "team-message-item";

      const ts = document.createElement("span");
      ts.className = "team-message-time";
      ts.textContent = `[${entry.time}]`;

      const text = document.createElement("p");
      text.className = "team-message-text";
      text.textContent = entry.text;

      row.append(ts, text);
      messageHistoryEl.appendChild(row);
    }

    messageHistoryEl.scrollTop = 0;
    requestAnimationFrame(() => {
      messageHistoryEl.scrollTop = 0;
    });
  }

  function pushMessageToHistory(messageText, createdAt) {
    const text = String(messageText || "").trim();
    if (!text) return;
    const key = `${text}::${String(createdAt || 0)}`;
    if (messageHistoryKeys.has(key)) return;
    lastMessageKey = key;
    messageHistory.push({ key, text, time: formatTimestamp(createdAt) });
    messageHistoryKeys.add(key);
    persistMessageHistory();
    renderMessageHistory();
  }

  function markProfileEditing() {
    isProfileEditing = true;
  }

  function clearProfileEditing() {
    isProfileEditing = false;
  }

  function getWaitColorClass(row) {
    const waitSeconds = Math.max(0, Number(row?.estimated_wait_seconds || 0));
    if (waitSeconds === 0) return "";
    if (waitSeconds < 30) return "is-wait-green";
    if (waitSeconds < 150) return "is-wait-orange";
    return "is-wait-red";
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
    if (response.status === 410 || result?.token_invalidated) throw new Error("token invalidated");
    if (!response.ok || !result.ok) throw new Error(result.error || "save failed");
    return result.profile;
  }

  async function uploadTeamPhoto(file) {
    const formData = new FormData();
    formData.set("token", token);
    formData.set("file", file);
    const response = await fetch("./api/upload_team_photo.php", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();
    if (response.status === 410 || result?.token_invalidated) throw new Error("token invalidated");
    if (!response.ok || !result.ok) throw new Error(result.error || "upload failed");
    return result;
  }

  function renderTeamPhoto(photoPath) {
    const path = String(photoPath || "").trim();
    currentTeamPhotoPath = path;
    if (!path) {
      teamPhotoPreviewEl.hidden = true;
      teamPhotoPreviewEl.removeAttribute("src");
      teamPhotoEmptyEl.hidden = false;
      return;
    }
    teamPhotoPreviewEl.src = path;
    teamPhotoPreviewEl.hidden = false;
    teamPhotoEmptyEl.hidden = true;
  }

  async function leaveQueue(characterId) {
    const response = await fetch("./api/leave_queue.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: characterId, token }),
    });
    let result = {};
    try {
      result = await response.json();
    } catch (_error) {
      result = {};
    }
    if (response.status === 410 || result?.token_invalidated) throw new Error("token invalidated");
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
    const result = await response.json();
    if (response.status === 410 || result?.token_invalidated) throw new Error("token invalidated");
    return result;
  }

  async function onQueueAction(characterId) {
    if (!latestState || isQueueActionInProgress) return;

    const init = resolveInitialization({ team_name: teamNameInput.value, players });
    if (!init.isReady) return;

    const currentCharacterId = String(latestState.team?.state?.character_id || "");
    const endGameActive = isEndGameActive(latestState);

    if (endGameActive && currentCharacterId !== String(characterId)) {
      setFeedback(characterFeedbackEl, "Fin de jeu active : impossible d’interroger un nouveau suspect.", "error");
      return;
    }

    isQueueActionInProgress = true;
    try {
      if (currentCharacterId === String(characterId)) {
        await runWithPollingPaused(async () => {
          await leaveQueue(characterId);
        });
      } else {
        let joinResult = await runWithPollingPaused(async () => joinQueue(characterId, init.teamName, false));
        if (joinResult?.error === "end_game_active") {
          setFeedback(characterFeedbackEl, "Fin de jeu active : impossible d’interroger un nouveau suspect.", "error");
          await loadHub();
          return;
        }
        if (joinResult?.state === "already_in_queue" && joinResult?.can_join_after_confirm) {
          const fromName = joinResult.current_engagement?.personnage_nom || "un autre personnage";
          const confirmed = await runWithPollingPaused(async () => window.confirm(`Votre équipe est déjà en cours d’interrogatoire avec « ${fromName} ». Confirmer le changement de suspect ?`));
          if (!confirmed) return;
          joinResult = await runWithPollingPaused(async () => joinQueue(characterId, init.teamName, true));
          if (joinResult?.error === "end_game_active") {
            setFeedback(characterFeedbackEl, "Fin de jeu active : impossible d’interroger un nouveau suspect.", "error");
            await loadHub();
            return;
          }
        }
      }
      await loadHub();
    } catch (error) {
      if (error instanceof Error && error.message === "token invalidated") {
        rotateInvalidatedTeamToken();
        await loadHub();
        return;
      }
      throw error;
    } finally {
      isQueueActionInProgress = false;
    }
  }

  function renderCharactersList(state, isBlocked) {
    const seen = new Set(
      (state.team?.history || [])
        .filter((entry) => Number(entry?.duration_seconds || 0) >= SEEN_THRESHOLD_SECONDS)
        .map((entry) => String(entry.id || "")),
    );
    const currentCharacterId = String(state.team?.state?.character_id || "");
    const allRows = Array.isArray(state.global) ? [...state.global] : [];
    let rows = allRows.filter((row) => String(row.id || "") !== currentCharacterId);

    if (filterOnlyUnseen) {
      rows = rows.filter((row) => !seen.has(String(row.id || "")));
    }

    rows.sort((a, b) => {
      if (characterSortMode === "time") return (a.estimated_wait_seconds || 0) - (b.estimated_wait_seconds || 0);
      return String(a.nom || "").localeCompare(String(b.nom || ""), "fr");
    });

    if (rows.length === 0) {
      charactersEl.innerHTML = '<p class="team-feedback">Aucun suspect à afficher avec ce filtre.</p>';
      return;
    }

    const list = document.createElement("ul");
    list.className = "team-character-list";

    rows.forEach((row) => {
      const item = document.createElement("li");
      item.className = "team-character-item";
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      const isCurrent = currentCharacterId === String(row.id);
      if (isCurrent) {
        item.classList.add("is-current");
      }

      const endGameActive = isEndGameActive(state);
      const blockedByEndGame = endGameActive && !isCurrent;
      const rowDisabled = isBlocked || isQueueActionInProgress || blockedByEndGame;
      if (rowDisabled) {
        item.classList.add("is-disabled");
        item.setAttribute("aria-disabled", "true");
      }
      const photo = row.photo
        ? `<img src="${row.photo}" alt="${row.nom}" class="team-character-photo"/>`
        : '<div class="team-character-photo team-character-photo-placeholder">Photo indisponible</div>';
      const seenStatus = seen.has(String(row.id || "")) ? '<span class="team-seen-badge">Déjà vu</span>' : '<span class="team-seen-badge">Jamais vu</span>';
      const waitClass = getWaitColorClass(row);
      const waitValue = fmt(row.estimated_wait_seconds || 0);
      const locationTitle = String(row.location || "").trim() || "Localisation non renseignée";
      const currentStatusText = isCurrent ? `<p class="team-character-line team-current-state is-active">Vous pouvez interroger ${String(row.nom || "ce suspect")}</p>` : "";

      item.innerHTML = `
        <div class="team-character-col team-character-col-photo">
          ${photo}
        </div>
        <div class="team-character-col team-character-col-meta">
          <h3>${row.nom || "Personnage"}</h3>
          <p class="team-character-line team-character-location" title="${locationTitle}" aria-label="${locationTitle}">📍 ${locationTitle}</p>
          <p class="team-character-line team-character-wait ${waitClass}">⏱ ${waitValue}</p>
          ${seenStatus}
          ${currentStatusText}
        </div>
      `;

      const triggerQueueAction = () => {
        if (rowDisabled) return;
        const name = String(row.nom || "ce suspect");
        const confirmed = isCurrent
          ? window.confirm(`Voulez-vous quitter l’interrogatoire avec ${name} ?`)
          : window.confirm(`Confirmer : interroger « ${name} » ?`);
        if (!confirmed) return;
        void onQueueAction(String(row.id || ""));
      };

      item.addEventListener("click", triggerQueueAction);
      item.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        triggerQueueAction();
      });

      list.appendChild(item);
    });

    charactersEl.innerHTML = "";
    charactersEl.appendChild(list);
  }



  async function loadQueueStatus(characterId) {
    const response = await fetch(`./api/status.php?id=${encodeURIComponent(characterId)}&token=${encodeURIComponent(token)}`);
    const result = await response.json();
    if (!response.ok || !result?.ok) throw new Error(result?.error || "status failed");
    return result;
  }

  function renderCurrentCharacterPanel(state, queueStatus) {
    const teamState = state.team?.state || {};
    const currentCharacterId = String(teamState.character_id || "");

    if (!currentCharacterId) {
      currentCharacterEl.hidden = true;
      currentCharacterEl.innerHTML = "";
      previousRemainingSeconds = null;
      criticalAlertPlayedFor = "";
      return;
    }

    const row = (Array.isArray(state.global) ? state.global : []).find((entry) => String(entry.id || "") === currentCharacterId);
    const characterName = String(teamState.character_name || row?.nom || "Personnage");
    const locationText = String(row?.location || "").trim() || "Localisation non renseignée";
    const characterPhoto = row?.photo
      ? `<img src="${row.photo}" alt="${characterName}" class="team-character-photo"/>`
      : '<div class="team-character-photo team-character-photo-placeholder">Photo indisponible</div>';
    const remainingSeconds = teamState.state === "waiting"
      ? Math.max(0, Number(queueStatus?.file?.temps_attente_estime_seconds ?? row?.estimated_wait_seconds ?? 0))
      : Math.max(0, Number(queueStatus?.timers?.active_remaining_before_takeover_seconds ?? row?.estimated_wait_seconds ?? 0));
    const hasNextTeamWaiting = teamState.state === "active" && Number(teamState.queue_total || 0) > 1;
    const nextTeamName = String(queueStatus?.file?.next_team_name || "").trim();
    const isCriticalExitAlert = teamState.state === "active" && hasNextTeamWaiting && remainingSeconds <= 15;
    const statusText = teamState.state === "active"
      ? (hasNextTeamWaiting && nextTeamName
        ? `Préparez-vous à libérer la place à l’équipe ${nextTeamName} dans ${fmt(remainingSeconds)}`
        : `Vous pouvez interroger ${characterName}`)
      : (teamState.state === "waiting"
        ? `Vous pourrez interroger ${characterName} dans ${fmt(remainingSeconds)}`
        : "");
    const stateClass = teamState.state === "active"
      ? (isCriticalExitAlert ? "is-critical" : (hasNextTeamWaiting ? "is-alert" : "is-active"))
      : "is-waiting";

    const shouldPlayCriticalAlert =
      teamState.state === "active"
      && hasNextTeamWaiting
      && remainingSeconds <= 15
      && criticalAlertPlayedFor !== currentCharacterId;

    if (shouldPlayCriticalAlert) {
      void maybePlayExitSound().then((played) => {
        if (!played) return;
        criticalAlertPlayedFor = currentCharacterId;
      });
    }

    if (teamState.state !== "active" || !hasNextTeamWaiting || remainingSeconds > 15) {
      criticalAlertPlayedFor = "";
    }

    previousRemainingSeconds = remainingSeconds;

    currentCharacterEl.hidden = false;
    currentCharacterEl.innerHTML = `
      <div class="team-current-character-card ${stateClass}">
        <div class="team-current-character-layout">
          <div class="team-current-character-photo-wrap">${characterPhoto}</div>
          <div class="team-current-character-meta">
            <h3>${characterName}</h3>
            <p class="team-character-line team-character-location" title="${locationText}" aria-label="${locationText}">📍 ${locationText}</p>
            ${statusText ? `<p class="team-current-state ${stateClass}">${statusText}</p>` : ""}
          </div>
        </div>
      </div>
    `;

    const cardEl = currentCharacterEl.querySelector(".team-current-character-card");
    if (!cardEl || isQueueActionInProgress) return;

    const canLeaveCurrentCharacter = teamState.state === "active" || teamState.state === "waiting";
    if (!canLeaveCurrentCharacter) return;

    const triggerLeaveCurrentCharacter = () => {
      if (isQueueActionInProgress) return;
      const confirmationMessage = teamState.state === "active"
        ? `Voulez-vous quitter l’interrogatoire avec ${characterName} ?`
        : `Voulez-vous quitter la file d’attente de ${characterName} ?`;
      const confirmed = window.confirm(confirmationMessage);
      if (!confirmed) return;
      void onQueueAction(currentCharacterId);
    };

    cardEl.setAttribute("role", "button");
    cardEl.setAttribute("tabindex", "0");
    cardEl.setAttribute(
      "aria-label",
      teamState.state === "active"
        ? `Quitter l’interrogatoire avec ${characterName}`
        : `Quitter la file d’attente de ${characterName}`,
    );
    cardEl.addEventListener("click", triggerLeaveCurrentCharacter);
    cardEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      triggerLeaveCurrentCharacter();
    });
  }

  async function maybePlayMessageSound(messageText, createdAt) {
    const key = `${messageText}::${String(createdAt || 0)}`;
    if (!audioEnabled || !messageText || key === lastPlayedMessageKey) return;
    lastPlayedMessageKey = key;
    messageAudio.currentTime = 0;
    try {
      await messageAudio.play();
    } catch (_error) {
      syncAudioCapabilityAfterPlaybackFailure(_error);
    }
  }

  async function maybePlayExitSound() {
    if (!audioEnabled) return false;
    exitAudio.currentTime = 0;
    try {
      await exitAudio.play();
      return true;
    } catch (_error) {
      syncAudioCapabilityAfterPlaybackFailure(_error);
      return false;
    }
  }

  function renderLockState(init) {
    const missingParticipants = init.validPlayers <= 0;
    const missingName = !init.isTeamNameValid;
    const missingPhoto = !init.hasTeamPhoto;
    const isBlocked = missingName || missingParticipants || missingPhoto;

    if (isBlocked) {
      setFeedback(lockMessageEl, "Complétez les informations de votre équipe (nom, participants et photo) pour pouvoir interroger les personnages.", "error");
      setFeedback(characterFeedbackEl, "Interrogatoires bloqués tant que les informations de l'équipe ne sont pas complètes.", "error");
    } else {
      setFeedback(lockMessageEl, "", "neutral");
      setFeedback(characterFeedbackEl, "Cliquer sur un suspect pour l’interroger.", "success");
    }

    return isBlocked;
  }

  async function loadHub() {
    const requestSequence = ++hubRequestSequence;
    const response = await fetch(`./api/team_hub.php?token=${encodeURIComponent(token)}`);
    const state = await response.json();
    if (response.status === 410 || state?.token_invalidated || state?.team?.token_invalidated) {
      rotateInvalidatedTeamToken();
      const retriedState = await fetch(`./api/team_hub.php?token=${encodeURIComponent(token)}`);
      const retriedPayload = await retriedState.json();
      if (!retriedState.ok || !retriedPayload.ok) throw new Error(retriedPayload.error || "hub failed");
      latestState = retriedPayload;
      renderEndGameBanner(retriedPayload);
      const retriedProfile = retriedPayload.team?.profile || {};
      const retriedInit = resolveInitialization(retriedProfile);
      if (!isProfileEditing) {
        teamNameInput.value = retriedInit.teamName;
        players = [...retriedInit.players];
        renderPlayers();
        updateTeamNameUi(retriedInit.teamName);
      }
      renderTeamPhoto(retriedProfile.photo || "");
      const retriedBlocked = renderLockState(retriedInit);
      renderCurrentCharacterPanel(retriedPayload, null);
      renderCharactersList(retriedPayload, retriedBlocked);
      return;
    }
    if (!response.ok || !state.ok) throw new Error(state.error || "hub failed");
    if (requestSequence < lastAppliedHubSequence) return;
    lastAppliedHubSequence = requestSequence;

    if (state.team?.is_new_team_session) {
      resetRuntimeStateForFreshTeam();
    }

    latestState = state;
    renderEndGameBanner(state);
    const profile = state.team?.profile || {};
    const init = resolveInitialization(profile);

    if (!isProfileEditing) {
      teamNameInput.value = init.teamName;
      players = [...init.players];
      renderPlayers();
      updateTeamNameUi(init.teamName);
    }

    renderTeamPhoto(profile.photo || currentTeamPhotoPath || "");

    const isBlocked = renderLockState(init);
    let queueStatus = null;
    const currentCharacterId = String(state.team?.state?.character_id || "");
    if (currentCharacterId) {
      try {
        queueStatus = await loadQueueStatus(currentCharacterId);
      } catch (_error) {
        queueStatus = null;
      }
    }

    renderCurrentCharacterPanel(state, queueStatus);
    renderCharactersList(state, isBlocked);
    if (isEndGameActive(state) && state.team?.state?.state === "free") {
      setFeedback(characterFeedbackEl, "Fin de jeu active : vous ne pouvez plus interroger de suspect.", "error");
    }

    const messagePayload = state.team?.message || {};
    clearMessageHistoryFromSupervision(messagePayload.cleared_at || 0);
    const messageText = String(messagePayload.text || "").trim();
    pushMessageToHistory(messageText, messagePayload.created_at || 0);
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

  function syncAudioButtonState() {
    if (!audioEnableBtn) return;
    audioEnableBtn.textContent = audioEnabled ? "🔔 Son activé" : "🔔 Activer le son";
    audioEnableBtn.classList.toggle("is-enabled", audioEnabled);
    audioEnableBtn.classList.toggle("is-disabled", !audioEnabled);
    audioEnableBtn.setAttribute("aria-pressed", audioEnabled ? "true" : "false");
    if (audioHintEl) audioHintEl.hidden = audioEnabled;
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback(feedbackName, "Sauvegarde en cours…", "processing");
    try {
      const saved = await runWithPollingPaused(async () => saveProfile());
      updateTeamNameUi(saved.team_name || "");
      clearProfileEditing();
      await loadHub();
      setFeedback(feedbackName, "Profil équipe sauvegardé.", "success");
    } catch (_error) {
      setFeedback(feedbackName, "Impossible de sauvegarder le profil.", "error");
    }
  });

  addPlayerBtn?.addEventListener("click", () => {
    markProfileEditing();
    addPlayerFromInput();
  });

  playerInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    markProfileEditing();
    addPlayerFromInput();
  });

  playersWrap?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (!target.classList.contains("team-player-remove")) return;
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= players.length) return;
    markProfileEditing();
    players.splice(index, 1);
    renderPlayers();
  });

  characterSortEl?.addEventListener("change", () => {
    characterSortMode = characterSortEl.value === "time" ? "time" : "name";
    if (!latestState) return;
    const init = resolveInitialization({ team_name: teamNameInput.value, players, photo: currentTeamPhotoPath });
    renderCharactersList(latestState, !init.isReady);
  });

  characterFilterUnseenEl?.addEventListener("change", () => {
    filterOnlyUnseen = characterFilterUnseenEl.checked;
    if (!latestState) return;
    const init = resolveInitialization({ team_name: teamNameInput.value, players, photo: currentTeamPhotoPath });
    renderCharactersList(latestState, !init.isReady);
  });

  editNameBtn?.addEventListener("click", () => {
    teamNameInput.focus();
    teamNameInput.select();
    teamNameInput.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  teamNameInput?.addEventListener("input", () => {
    markProfileEditing();
  });

  audioEnableBtn?.addEventListener("click", async () => {
    if (audioEnabled) {
      const confirmed = window.confirm("Voulez-vous vraiment désactiver le son ?");
      if (!confirmed) return;
      setAudioEnabled(false);
      return;
    }

    soundOnAudio.currentTime = 0;
    try {
      await runWithPollingPaused(async () => {
        await soundOnAudio.play();
        await primeAudioElement(messageAudio);
        await primeAudioElement(exitAudio);
      });
      setAudioEnabled(true);
    } catch (_error) {
      setAudioEnabled(false);
    }
  });

  teamPhotoInputEl?.addEventListener("change", () => {
    const hasSelectedFile = !!teamPhotoInputEl.files?.length;
    if (teamPhotoUploadBtn) teamPhotoUploadBtn.disabled = !hasSelectedFile;
    if (!hasSelectedFile) return;
    setFeedback(teamPhotoFeedbackEl, "Sélectionnez une photo puis validez.", "processing");
  });

  teamPhotoSelectBtn?.addEventListener("click", () => {
    teamPhotoInputEl?.click();
  });

  teamPhotoUploadBtn?.addEventListener("click", async () => {
    if (!teamPhotoInputEl?.files?.length) {
      setFeedback(teamPhotoFeedbackEl, "Choisissez une photo avant de valider.", "error");
      return;
    }

    if (!window.CluedoPhotoUpload?.uploadFromInput) {
      setFeedback(teamPhotoFeedbackEl, "Module photo indisponible.", "error");
      return;
    }

    teamPhotoUploadBtn.disabled = true;
    setFeedback(teamPhotoFeedbackEl, "Sélectionnez une photo puis validez.", "processing");

    try {
      await runWithPollingPaused(async () =>
        window.CluedoPhotoUpload.uploadFromInput({
          id: token,
          input: teamPhotoInputEl,
          getPreviousPhoto: () => currentTeamPhotoPath,
          setPhotoPreview: (nextPhoto) => {
            renderTeamPhoto(nextPhoto || "");
          },
          sendUploadRequest: async ({ file }) => {
            setFeedback(teamPhotoFeedbackEl, "Upload en cours…", "processing");
            try {
              const result = await uploadTeamPhoto(file);
              setFeedback(teamPhotoFeedbackEl, "Photo équipe mise à jour.", "success");
              return { ok: true, photo: result.photo || "" };
            } catch (error) {
              const message = error instanceof Error && error.message ? error.message : "Upload impossible.";
              setFeedback(teamPhotoFeedbackEl, message, "error");
              return { ok: false, error: message };
            }
          },
        })
      );
      await loadHub();
    } finally {
      const hasSelectedFile = !!teamPhotoInputEl?.files?.length;
      teamPhotoUploadBtn.disabled = !hasSelectedFile;
    }
  });

  initializeTestSlotSelector();
  syncAudioButtonState();
  loadPersistedMessageHistory();
  renderMessageHistory();

  loadHub().catch(() => {
    setFeedback(feedbackName, "Impossible de charger l'espace équipe.", "error");
  });

  setInterval(() => {
    if (isProfileEditing || pollingPausedCount > 0) return;
    loadHub().catch(() => {
      setFeedback(characterFeedbackEl, "Rafraîchissement temporairement indisponible.", "error");
    });
  }, 3000);
});
