document.addEventListener("DOMContentLoaded", () => {
  const TOKEN_KEY = "cluedo_player_token";
  const TEAM_KEY = "cluedo_team_name";
  const AUDIO_ENABLED_KEY = "cluedo_team_audio_enabled";

  let token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
  }
  localStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_KEY, token);

  const displayNameEl = document.getElementById("team-display-name");
  const editNameBtn = document.getElementById("team-edit-name-btn");
  const profileForm = document.getElementById("team-profile-form");
  const profileSubmitBtn = profileForm?.querySelector('button[type="submit"]');
  const teamNameInput = document.getElementById("team-name");
  const feedbackName = document.getElementById("team-name-feedback");
  const playersWrap = document.getElementById("team-players");
  const savePlayersBtn = document.getElementById("save-players");
  const photoEl = document.getElementById("team-photo");
  const photoInput = document.getElementById("team-photo-input");
  const qrFeedback = document.getElementById("team-qr-feedback");
  const qrReader = document.getElementById("team-qr-reader");
  const qrStartCameraBtn = document.getElementById("team-qr-start-camera");
  const qrImportBtn = document.getElementById("team-qr-import-btn");
  const qrFileInput = document.getElementById("team-qr-file-input");
  const historyEl = document.getElementById("team-history");
  const globalEl = document.getElementById("team-global");
  const charactersEl = document.getElementById("team-characters");
  const characterSortEl = document.getElementById("team-character-sort");
  const characterFeedbackEl = document.getElementById("team-character-feedback");
  const participantsGuidanceEl = document.getElementById("team-guidance-participants");
  const photoGuidanceEl = document.getElementById("team-guidance-photo");
  const supervisionMessageEl = document.getElementById("team-supervision-message");
  const audioEnableBtn = document.getElementById("team-audio-enable-btn");
  const audioStatusEl = document.getElementById("team-audio-status");

  let latestState = null;
  let previousTeamState = "free";
  let qrScanner = null;
  let qrIsRunning = false;
  let qrCurrentStartToken = 0;
  let qrLastValue = "";
  let qrIsProcessingScan = false;
  let qrHasActiveVideo = false;
  let userEditingLockUntil = 0;
  let isSavingTeamName = false;
  let isTeamNameEditMode = false;
  let lastRenderedMessage = "";
  let characterSortMode = "name";
  let isQueueActionInProgress = false;

  const soundOnAudio = new Audio("./assets/soundon.wav");
  const messageAudio = new Audio("./assets/message.wav");
  soundOnAudio.preload = "auto";
  messageAudio.preload = "auto";

  const audioState = {
    isEnabled: localStorage.getItem(AUDIO_ENABLED_KEY) === "1",
    unlockSucceeded: localStorage.getItem(AUDIO_ENABLED_KEY) === "1",
    unlockAttempted: false,
  };

  function setAudioStatus(message, status = "neutral") {
    if (!audioStatusEl) return;
    audioStatusEl.textContent = String(message || "");
    audioStatusEl.classList.remove("is-success", "is-error", "is-processing");
    if (status === "success") audioStatusEl.classList.add("is-success");
    if (status === "error") audioStatusEl.classList.add("is-error");
    if (status === "processing") audioStatusEl.classList.add("is-processing");
  }

  function renderAudioUi() {
    if (!audioEnableBtn || !audioStatusEl) return;

    if (audioState.isEnabled) {
      audioEnableBtn.textContent = "🔔 Son activé";
      audioEnableBtn.setAttribute("aria-pressed", "true");
      audioEnableBtn.classList.add("is-enabled");
      setAudioStatus("Le son est activé pour cette session. Les nouveaux messages déclenchent une notification.", "success");
      return;
    }

    audioEnableBtn.textContent = "🔔 Son activé";
    audioEnableBtn.setAttribute("aria-pressed", "false");
    audioEnableBtn.classList.remove("is-enabled");
    setAudioStatus("Le son est désactivé. Activez-le pour recevoir les notifications.", "neutral");
  }

  async function unlockAudioFromGesture() {
    audioState.unlockAttempted = true;
    soundOnAudio.currentTime = 0;
    try {
      await soundOnAudio.play();
      audioState.unlockSucceeded = true;
      return true;
    } catch (_error) {
      audioState.unlockSucceeded = false;
      return false;
    }
  }

  async function enableAudioNotifications() {
    if (!audioEnableBtn) return;
    audioEnableBtn.disabled = true;
    setAudioStatus("Activation du son en cours…", "processing");

    const unlocked = await unlockAudioFromGesture();
    if (!unlocked) {
      audioState.isEnabled = false;
      localStorage.removeItem(AUDIO_ENABLED_KEY);
      renderAudioUi();
      setAudioStatus("Activation refusée par le navigateur. Touchez à nouveau « Activer le son » après avoir autorisé l'audio.", "error");
      audioEnableBtn.disabled = false;
      return;
    }

    audioState.isEnabled = true;
    localStorage.setItem(AUDIO_ENABLED_KEY, "1");
    renderAudioUi();
    audioEnableBtn.disabled = false;
  }

  async function playNotificationSound() {
    if (!audioState.isEnabled) return;

    if (!audioState.unlockSucceeded && audioState.unlockAttempted) {
      return;
    }

    messageAudio.currentTime = 0;
    try {
      await messageAudio.play();
    } catch (_error) {
      audioState.isEnabled = false;
      audioState.unlockSucceeded = false;
      localStorage.removeItem(AUDIO_ENABLED_KEY);
      renderAudioUi();
      setAudioStatus("Le son a été bloqué par le navigateur. Touchez « Activer le son » pour rétablir les notifications.", "error");
    }
  }

  function setNameFeedback(message, status = "neutral") {
    feedbackName.textContent = String(message || "");
    feedbackName.classList.remove("is-success", "is-error", "is-processing");
    if (status === "success") feedbackName.classList.add("is-success");
    if (status === "error") feedbackName.classList.add("is-error");
    if (status === "processing") feedbackName.classList.add("is-processing");
  }

  function setNameSavingUi(isSaving) {
    if (!profileSubmitBtn) return;
    profileSubmitBtn.disabled = isSaving;
    profileSubmitBtn.textContent = isSaving ? "Enregistrement…" : "Enregistrer le nom";
  }

  function markUserEditing(durationMs = 5000) {
    userEditingLockUntil = Math.max(userEditingLockUntil, Date.now() + durationMs);
  }

  function isUserEditing() {
    return Date.now() < userEditingLockUntil || isSavingTeamName || isTeamNameEditMode || profileForm.contains(document.activeElement);
  }

  function fmt(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return `${m}:${r}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function profileTeamName() {
    return (teamNameInput.value || "").trim() || (localStorage.getItem(TEAM_KEY) || "").trim();
  }

  function refreshTeamNameUi(name, options = {}) {
    const resolved = String(name || "").trim() || "Équipe sans nom";
    const preserveInput = options.preserveInput === true;

    displayNameEl.textContent = resolved;
    if (!preserveInput) {
      teamNameInput.value = String(name || "").trim();
    }
  }

  function setQrFeedback(message, status = "neutral") {
    qrFeedback.textContent = message;
    qrFeedback.classList.remove("is-success", "is-error", "is-processing");
    qrReader.classList.remove("is-success", "is-error", "is-processing");
    if (status === "success") {
      qrReader.classList.add("is-success");
      qrFeedback.classList.add("is-success");
    }
    if (status === "error") {
      qrReader.classList.add("is-error");
      qrFeedback.classList.add("is-error");
    }
    if (status === "processing") {
      qrReader.classList.add("is-processing");
      qrFeedback.classList.add("is-processing");
    }
  }

  function setQrReaderVisibility(isVisible) {
    qrHasActiveVideo = Boolean(isVisible);
    qrReader.classList.toggle("is-active", qrHasActiveVideo);
  }

  function parseQrTarget(decodedText) {
    const raw = String(decodedText || "").trim();
    if (!raw) return null;

    try {
      const parsed = new URL(raw, window.location.href);
      const id = parsed.searchParams.get("id");
      if (!id) return null;
      return { id: String(id).replace(/[^0-9]/g, ""), url: parsed.href };
    } catch (_error) {
      const idMatch = raw.match(/[?&]id=(\d+)/i);
      if (!idMatch) return null;
      const fallbackUrl = new URL(`./play.html?id=${idMatch[1]}`, window.location.href).href;
      return { id: idMatch[1], url: fallbackUrl };
    }
  }

  function maybePromptCloseOnFree(nextState) {
    if ((previousTeamState === "waiting" || previousTeamState === "active") && nextState === "free") {
      const shouldClose = window.confirm("Votre équipe est maintenant libre. Fermer automatiquement cette page ?");
      if (shouldClose) {
        window.close();
      }
    }
    previousTeamState = nextState;
  }

  function setCharacterFeedback(message, status = "neutral") {
    if (!characterFeedbackEl) return;
    characterFeedbackEl.textContent = String(message || "");
    characterFeedbackEl.classList.remove("is-success", "is-error", "is-processing");
    if (status === "success") characterFeedbackEl.classList.add("is-success");
    if (status === "error") characterFeedbackEl.classList.add("is-error");
    if (status === "processing") characterFeedbackEl.classList.add("is-processing");
  }

  async function joinCharacterQueue(characterId, forceSwitch = false) {
    const query = new URLSearchParams({
      id: String(characterId),
      token,
      join: "1",
      t: String(Date.now()),
    });

    const teamName = profileTeamName();
    if (teamName) {
      query.set("team_name", teamName);
    }

    if (forceSwitch) {
      query.set("force_switch", "1");
    }

    const response = await fetch(`./api/status.php?${query.toString()}`);
    const payload = await response.json();

    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || "join failed");
    }

    return payload;
  }

  async function leaveCharacterQueue(characterId) {
    const response = await fetch("./api/leave_queue.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: String(characterId), token }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || "leave failed");
    }
  }

  async function handleCharacterAction(characterId, action) {
    if (isQueueActionInProgress) return;

    isQueueActionInProgress = true;
    setCharacterFeedback("Mise à jour de la file en cours…", "processing");

    try {
      if (action === "leave") {
        const confirmedLeave = window.confirm("Confirmer la sortie de la file en cours ?");
        if (!confirmedLeave) {
          setCharacterFeedback("Sortie annulée.");
          return;
        }

        await leaveCharacterQueue(characterId);
        setCharacterFeedback("Vous avez quitté la file.", "success");
        await loadHub();
        return;
      }

      const payload = await joinCharacterQueue(characterId, false);
      if (payload?.state === "already_in_queue") {
        const currentCharacter = payload.current_engagement?.personnage_nom || "le personnage actuel";
        const confirmedSwitch = window.confirm(
          `Vous êtes déjà engagé(e) avec ${currentCharacter}.\n\n` +
          "Confirmez-vous l'abandon de votre place actuelle pour rejoindre ce nouveau personnage ?"
        );

        if (!confirmedSwitch) {
          setCharacterFeedback("Changement de personnage annulé.");
          return;
        }

        await joinCharacterQueue(characterId, true);
        setCharacterFeedback("Changement confirmé : ancienne place perdue, nouvelle file rejointe.", "success");
        await loadHub();
        return;
      }

      setCharacterFeedback("File rejointe avec succès.", "success");
      await loadHub();
    } catch (_error) {
      setCharacterFeedback("Action impossible pour le moment.", "error");
    } finally {
      isQueueActionInProgress = false;
    }
  }

  function renderCharactersList(payload) {
    if (!charactersEl) return;

    const global = Array.isArray(payload.global) ? payload.global.slice() : [];
    if (!global.length) {
      charactersEl.textContent = "Aucun personnage disponible pour le moment.";
      return;
    }

    if (characterSortMode === "wait") {
      global.sort((a, b) => (Number(a.estimated_wait_seconds) || 0) - (Number(b.estimated_wait_seconds) || 0));
    } else {
      global.sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr"));
    }

    charactersEl.innerHTML = `<ul class="team-character-list">${global
      .map((entry) => {
        const id = escapeHtml(entry.id);
        const name = escapeHtml(entry.nom || `Personnage ${entry.id}`);
        const location = escapeHtml(entry.location || "Emplacement non renseigné");
        const stateLabel = entry.state === "queue" ? "file" : "disponible";
        const queueTotal = Number(entry.queue_total) || 0;
        const isCurrent = entry.is_current_team_engagement === true;
        const actionLabel = isCurrent ? "Quitter la file" : "Rejoindre la file";
        const action = isCurrent ? "leave" : "join";

        return `<li class="team-character-item">
          <div><strong>${name}</strong></div>
          <div>État : ${escapeHtml(stateLabel)}</div>
          <div>Attente estimée : ${fmt(entry.estimated_wait_seconds)}</div>
          <div>Équipes engagées : ${queueTotal}</div>
          <div>Emplacement : ${location}</div>
          <button type="button" class="admin-button team-character-action" data-character-id="${id}" data-character-action="${action}">${escapeHtml(actionLabel)}</button>
        </li>`;
      })
      .join("")}</ul>`;

    charactersEl.querySelectorAll("[data-character-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const characterId = button.getAttribute("data-character-id") || "";
        const action = button.getAttribute("data-character-action") || "join";
        await handleCharacterAction(characterId, action);
      });
    });
  }

  function ensurePlayerInputs() {
    const existing = playersWrap.querySelectorAll("input[data-player-index]");
    if (existing.length === 10) {
      return;
    }

    playersWrap.innerHTML = "";
    for (let i = 0; i < 10; i += 1) {
      const row = document.createElement("div");
      row.className = "team-inline";
      row.innerHTML = `<label class="admin-label" for="player-${i + 1}">Joueur ${i + 1}</label><input id="player-${i + 1}" data-player-index="${i}" class="admin-input" maxlength="80"/>`;
      playersWrap.appendChild(row);
    }
  }

  function applyPlayers(players, keepUserInput) {
    ensurePlayerInputs();
    for (let i = 0; i < 10; i += 1) {
      const input = playersWrap.querySelector(`input[data-player-index="${i}"]`);
      if (!input || (keepUserInput && document.activeElement === input)) continue;
      input.value = String(players[i] || "");
    }
  }

  async function loadHub() {
    const response = await fetch(`./api/team_hub.php?token=${encodeURIComponent(token)}&t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "hub unavailable");
    }

    latestState = payload;
    const profile = payload.team?.profile || {};
    const profileName = (profile.team_name || "").trim();
    const storedName = (localStorage.getItem(TEAM_KEY) || "").trim();
    const resolvedName = profileName || storedName;
    const keepUserInput = isUserEditing();

    if (resolvedName) {
      localStorage.setItem(TEAM_KEY, resolvedName);
    }

    refreshTeamNameUi(resolvedName, { preserveInput: keepUserInput });

    const players = Array.isArray(profile.players) ? profile.players : [];
    applyPlayers(players, keepUserInput);

    const filledPlayersCount = players.filter((name) => String(name || "").trim()).length;

    if (profile.photo) {
      photoEl.src = profile.photo;
      photoEl.style.display = "block";
      photoGuidanceEl.textContent = "Photo d'équipe enregistrée ✅";
      photoGuidanceEl.classList.add("is-ok");
    } else {
      photoEl.removeAttribute("src");
      photoEl.style.display = "none";
      photoGuidanceEl.textContent = "Pensez à ajouter une photo de l’équipe pour faciliter le jeu.";
      photoGuidanceEl.classList.remove("is-ok");
    }

    if (filledPlayersCount < 2) {
      participantsGuidanceEl.textContent = "Merci de renseigner les participants de l’équipe avant de continuer.";
      participantsGuidanceEl.classList.remove("is-ok");
    } else {
      participantsGuidanceEl.textContent = `Participants renseignés : ${filledPlayersCount}/10 ✅`;
      participantsGuidanceEl.classList.add("is-ok");
    }

    const history = Array.isArray(payload.team?.history) ? payload.team.history : [];
    historyEl.innerHTML = history.length
      ? `<ul>${history
        .map((entry) => `<li><strong>${escapeHtml(entry.nom || "Personnage")}</strong> : ${fmt(entry.duration_seconds)}</li>`)
        .join("")}</ul>`
      : "Aucun personnage vu pour l'instant.";

    const teamMessage = payload.team?.message || { scope: "none", text: "" };
    const incomingMessage = String(teamMessage.text || "").trim();
    if (incomingMessage && incomingMessage !== lastRenderedMessage) {
      void playNotificationSound();
    }
    lastRenderedMessage = incomingMessage;

    if (teamMessage.text) {
      const prefix = teamMessage.scope === "team" ? "Message individuel : " : "Message global : ";
      supervisionMessageEl.textContent = `${prefix}${teamMessage.text}`;
      supervisionMessageEl.classList.add("is-active");
    } else {
      supervisionMessageEl.textContent = "Aucun message de la supervision.";
      supervisionMessageEl.classList.remove("is-active");
    }

    const global = Array.isArray(payload.global) ? payload.global : [];
    globalEl.innerHTML = global.length
      ? `<ul>${global
        .map((entry) => `<li><strong>${escapeHtml(entry.nom || `Personnage ${entry.id}`)}</strong> — état : ${escapeHtml(entry.active_team_name ? "actif" : "disponible")}, attente moyenne : ${fmt(entry.estimated_wait_seconds)}, équipes en attente : ${Number(entry.waiting_count) || 0}</li>`)
        .join("")}</ul>`
      : "Aucune donnée globale disponible pour le moment.";

    renderCharactersList(payload);
    maybePromptCloseOnFree(payload.team?.state?.state || "free");
  }

  async function saveProfile(extra = {}) {
    const players = Array.from(playersWrap.querySelectorAll("input[data-player-index]"))
      .slice(0, 10)
      .map((input) => input.value.trim());

    const response = await fetch("./api/team_profile.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        team_name: profileTeamName(),
        players,
        ...extra,
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "save failed");
    }

    return payload;
  }

  async function renameTeam(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      throw new Error("Nom vide");
    }

    markUserEditing();
    localStorage.setItem(TEAM_KEY, trimmed);
    await saveProfile({ team_name: trimmed });

    const state = latestState?.team?.state;
    if (!state?.character_id) {
      setNameFeedback("Nom d'équipe mis à jour.", "success");
      refreshTeamNameUi(trimmed);
      return;
    }

    const response = await fetch("./api/rename_team.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: state.character_id,
        team_id: token,
        nouveau_nom: trimmed,
      }),
    });

    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      setNameFeedback("Nom d'équipe mis à jour localement.", "success");
      refreshTeamNameUi(trimmed);
      return;
    }

    setNameFeedback("Nom d'équipe mis à jour.", "success");
    refreshTeamNameUi(trimmed);
  }

  function initAccordion() {
    const items = Array.from(document.querySelectorAll("[data-accordion-item]"));
    const triggers = Array.from(document.querySelectorAll("[data-accordion-trigger]"));

    function openItem(itemToOpen) {
      for (const item of items) {
        const trigger = item.querySelector("[data-accordion-trigger]");
        const panel = item.querySelector(".team-accordion-panel");
        const isOpen = item === itemToOpen;

        item.classList.toggle("is-open", isOpen);
        if (trigger) {
          trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
        }
        if (panel) {
          panel.hidden = !isOpen;
        }
      }
    }

    for (const trigger of triggers) {
      trigger.addEventListener("click", () => {
        const item = trigger.closest("[data-accordion-item]");
        if (!item) return;
        if (item.classList.contains("is-open")) {
          openItem(null);
          return;
        }
        openItem(item);
      });
    }

    openItem(null);

    return {
      openByTriggerId(triggerId) {
        const trigger = document.getElementById(triggerId);
        const item = trigger?.closest("[data-accordion-item]");
        if (!item) return false;
        openItem(item);
        return true;
      },
      closeAll() {
        openItem(null);
      },
    };
  }

  async function initQrScanner() {
    if (!window.Html5Qrcode) {
      setQrFeedback("Scanner QR indisponible sur cet appareil. Utilisez « Importer une image ».", "error");
      return;
    }

    function ensureScannerInstance() {
      if (qrScanner) return qrScanner;
      qrScanner = new window.Html5Qrcode("team-qr-reader", false);
      return qrScanner;
    }

    const preferredCamera = () => {
      const saved = localStorage.getItem("cluedo_qr_camera_id");
      return saved ? String(saved) : "";
    };

    const onScanSuccess = async (decodedText) => {
      if (!decodedText || decodedText === qrLastValue || qrIsProcessingScan) {
        return;
      }

      qrIsProcessingScan = true;
      qrLastValue = decodedText;

      try {
        const target = parseQrTarget(decodedText);
        if (!target?.id || !target?.url) {
          setQrFeedback("QR invalide : lien de personnage introuvable.", "error");
          return;
        }

        const teamName = profileTeamName();
        if (teamName) {
          localStorage.setItem(TEAM_KEY, teamName);
        }
        sessionStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(TOKEN_KEY, token);

        setQrFeedback(`QR détecté (${target.id}) : ouverture…`, "success");
        setTimeout(() => {
          window.location.assign(target.url);
        }, 450);
      } finally {
        setTimeout(() => {
          qrLastValue = "";
          qrIsProcessingScan = false;
          qrReader.classList.remove("is-processing");
        }, 1500);
      }
    };

    async function stopScannerIfNeeded(options = {}) {
      const resetDom = options.resetDom !== false;
      const scanner = qrScanner;

      if (scanner && qrIsRunning) {
        await scanner.stop().catch(() => {});
      }
      if (scanner) {
        await scanner.clear().catch(() => {});
      }

      qrIsRunning = false;
      qrScanner = null;
      setQrReaderVisibility(false);

      if (resetDom) {
        qrReader.replaceChildren();
      }
    }

    async function applyMobileVideoAttributes() {
      const video = qrReader.querySelector("video");
      if (!video) return null;

      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.setAttribute("autoplay", "true");
      video.setAttribute("muted", "true");
      video.playsInline = true;
      video.autoplay = true;
      video.muted = true;
      await video.play().catch(() => {});
      return video;
    }

    function waitForActiveVideo(timeoutMs = 5000) {
      const startedAt = Date.now();

      return new Promise((resolve, reject) => {
        function checkVideoReady() {
          const video = qrReader.querySelector("video");
          if (video && video.srcObject && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.paused) {
            setQrReaderVisibility(true);
            resolve(video);
            return;
          }

          if (Date.now() - startedAt >= timeoutMs) {
            reject(new Error("VIDEO_NOT_ACTIVE"));
            return;
          }

          requestAnimationFrame(checkVideoReady);
        }

        checkVideoReady();
      });
    }

    async function startWithTimeout(cameraConfig, timeoutMs = 12000) {
      const scanner = ensureScannerInstance();
      return Promise.race([
        scanner.start(cameraConfig, { fps: 10, qrbox: { width: 240, height: 240 } }, onScanSuccess, () => {}),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("CAMERA_START_TIMEOUT")), timeoutMs);
        }),
      ]);
    }

    async function warmupCameraPermissions() {
      if (!navigator.mediaDevices?.getUserMedia) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    async function startCameraScan() {
      const startToken = Date.now();
      qrCurrentStartToken = startToken;
      setQrFeedback("Activation de la caméra… Autorisez l'accès si votre navigateur le demande.", "processing");

      if (!window.isSecureContext) {
        setQrFeedback("Caméra indisponible : ouvrez cette page en HTTPS, sinon utilisez « Importer une image ».", "error");
        return;
      }

      await stopScannerIfNeeded();

      await warmupCameraPermissions().catch(() => {});

      let cameras = [];
      try {
        cameras = await window.Html5Qrcode.getCameras();
      } catch (_error) {
        cameras = [];
      }

      const savedCameraId = preferredCamera();
      const preferredByLabel = cameras.find((camera) => /back|rear|environment|arrière/i.test(camera.label || "")) || null;
      const preferred = cameras.find((camera) => camera.id === savedCameraId) || preferredByLabel || cameras[0] || null;
      const attempts = [
        { cameraConfig: { facingMode: { ideal: "environment" } } },
        { cameraConfig: { facingMode: "environment" } },
      ];

      if (preferred?.id) {
        attempts.push({ cameraConfig: { deviceId: { exact: preferred.id } } });
        attempts.push({ cameraConfig: preferred.id });
      }

      if (Array.isArray(cameras)) {
        for (const camera of cameras) {
          if (!camera?.id || camera.id === preferred?.id) continue;
          attempts.push({ cameraConfig: { deviceId: { exact: camera.id } } });
        }
      }

      let started = false;
      let timeoutDetected = false;
      let permissionDeniedDetected = false;
      for (const attempt of attempts) {
        if (qrCurrentStartToken !== startToken) {
          await stopScannerIfNeeded();
          return;
        }

        try {
          await startWithTimeout(attempt.cameraConfig);
          await applyMobileVideoAttributes();
          await waitForActiveVideo();
          started = true;
          qrIsRunning = true;
          if (preferred?.id) {
            localStorage.setItem("cluedo_qr_camera_id", preferred.id);
          }
          setQrFeedback("Caméra activée. Présentez le QR code devant l'objectif.", "neutral");
          break;
        } catch (error) {
          const errorMessage = String(error?.message || "");
          timeoutDetected = timeoutDetected || errorMessage.includes("CAMERA_START_TIMEOUT") || /timeout starting video source/i.test(errorMessage) || errorMessage.includes("VIDEO_NOT_ACTIVE");
          permissionDeniedDetected = permissionDeniedDetected || /notallowederror|permission denied|permission dismissed/i.test(errorMessage);
          await stopScannerIfNeeded();
        }
      }

      if (!started) {
        const message = permissionDeniedDetected
          ? "Accès caméra refusé par le navigateur. Utilisez « Importer une image » pour scanner le QR code."
          : timeoutDetected
            ? "La caméra est autorisée mais le flux vidéo ne démarre pas (timeout). Utilisez « Importer une image » pour continuer."
            : "Impossible de démarrer la caméra pour le moment. Utilisez « Importer une image ».";
        setQrFeedback(message, "error");
      }
    }

    async function scanFromImageFile(file) {
      if (!file) return;
      await stopScannerIfNeeded();
      setQrFeedback("Analyse de l'image en cours…", "processing");

      try {
        const scanner = ensureScannerInstance();
        const decodedText = await scanner.scanFile(file, true);
        await onScanSuccess(decodedText);
      } catch (_error) {
        setQrFeedback("Aucun QR valide détecté dans l'image. Vérifiez la netteté puis réessayez.", "error");
      } finally {
        qrFileInput.value = "";
      }
    }

    qrStartCameraBtn.addEventListener("click", () => {
      startCameraScan().catch(() => {
        setQrFeedback("Impossible d'utiliser la caméra. Utilisez « Importer une image ».", "error");
      });
    });

    qrImportBtn.addEventListener("click", () => {
      qrFileInput.click();
    });

    qrFileInput.addEventListener("change", async () => {
      const file = qrFileInput.files?.[0];
      await scanFromImageFile(file);
    });

    setQrReaderVisibility(false);
    setQrFeedback("Choisissez une action : « Scanner un QR code (caméra) » ou « Importer une image ».", "neutral");
  }

  async function uploadTeamPhotoWithCrop(file) {
    const formData = new FormData();
    formData.append("token", token);
    formData.append("file", file);

    const response = await fetch("./api/upload_team_photo.php", {
      method: "POST",
      body: formData,
    });

    return response.json().catch(() => ({ ok: false, error: "Réponse serveur invalide" }));
  }

  profileForm.addEventListener("focusin", () => {
    markUserEditing();
  });

  profileForm.addEventListener("input", () => {
    markUserEditing();
  });

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    isSavingTeamName = true;
    setNameSavingUi(true);
    setNameFeedback("Enregistrement du nom d'équipe…", "processing");
    try {
      await renameTeam(teamNameInput.value);
      isTeamNameEditMode = false;
      accordionController?.closeAll();
      teamNameInput.blur();
      await loadHub();
    } catch (_error) {
      setNameFeedback("Erreur : impossible de sauvegarder le nom d'équipe pour le moment.", "error");
    } finally {
      isSavingTeamName = false;
      setNameSavingUi(false);
    }
  });

  let accordionController = null;

  editNameBtn.addEventListener("click", () => {
    isTeamNameEditMode = true;
    accordionController?.openByTriggerId("team-accordion-trigger-participants");

    requestAnimationFrame(() => {
      teamNameInput.focus();
      teamNameInput.select();
    });

    markUserEditing();
  });

  savePlayersBtn.addEventListener("click", async () => {
    markUserEditing();
    try {
      await saveProfile();
      setNameFeedback("Participants sauvegardés.", "success");
      await loadHub();
    } catch (_error) {
      setNameFeedback("Impossible de sauvegarder les joueurs.", "error");
    }
  });

  photoInput.addEventListener("change", async () => {
    if (!window.CluedoPhotoUpload) {
      window.alert("Recadrage photo indisponible.");
      return;
    }

    await window.CluedoPhotoUpload.uploadFromInput({
      id: token,
      input: photoInput,
      getPreviousPhoto: () => photoEl.getAttribute("src") || "",
      setPhotoPreview: (value) => {
        if (value) {
          photoEl.src = value;
          photoEl.style.display = "block";
        } else {
          photoEl.removeAttribute("src");
          photoEl.style.display = "none";
        }
      },
      sendUploadRequest: ({ file }) => uploadTeamPhotoWithCrop(file),
    });

    await loadHub();
  });

  if (characterSortEl) {
    characterSortEl.addEventListener("change", () => {
      characterSortMode = characterSortEl.value === "wait" ? "wait" : "name";
      if (latestState) {
        renderCharactersList(latestState);
      }
    });
  }

  if (audioEnableBtn) {
    audioEnableBtn.addEventListener("click", () => {
      void enableAudioNotifications();
    });
  }

  ensurePlayerInputs();
  renderAudioUi();
  loadHub().catch(() => {
    participantsGuidanceEl.textContent = "Impossible de vérifier les participants pour le moment.";
    photoGuidanceEl.textContent = "Impossible de vérifier la photo pour le moment.";
    historyEl.textContent = "Les données de résumé sont temporairement indisponibles.";
    globalEl.textContent = "L'état global est temporairement indisponible.";
  });
  accordionController = initAccordion();
  initQrScanner();
  setInterval(() => {
    loadHub().catch(() => {
      if (!historyEl.textContent.trim()) {
        historyEl.textContent = "Les données de résumé sont temporairement indisponibles.";
      }
      if (!globalEl.textContent.trim()) {
        globalEl.textContent = "L'état global est temporairement indisponible.";
      }
    });
  }, 2000);
});
