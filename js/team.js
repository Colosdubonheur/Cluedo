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
