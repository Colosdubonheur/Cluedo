(function () {
  const CHARACTER_MESSAGE_HISTORY_VERSION = "v1";
  const CHARACTER_AUDIO_PREFERENCE_VERSION = "v1";

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const characterNameEl = document.getElementById("characterName");
  const currentEl = document.getElementById("currentTeam");
  const queueEl = document.getElementById("queue");
  const gameOverviewCharactersEl = document.getElementById("gameOverviewCharacters");
  const gameOverviewTeamsEl = document.getElementById("gameOverviewTeams");
  const characterPhotoEl = document.getElementById("characterPhoto");
  const characterPhotoInputEl = document.getElementById("characterPhotoInput");
  const characterPhotoButtonEl = document.getElementById("characterPhotoButton");
  const characterLocationInputEl = document.getElementById("characterLocationInput");
  const characterLocationButtonEl = document.getElementById("characterLocationButton");
  const characterLocationFeedbackEl = document.getElementById("characterLocationFeedback");
  const characterMessageHistoryEl = document.getElementById("characterSupervisionMessage");
  const audioEnableBtn = document.getElementById("character-audio-enable-btn");
  const audioHintEl = document.getElementById("character-audio-hint");

  const messageAudio = new Audio("./assets/message.wav");
  messageAudio.preload = "auto";
  const soundOnAudio = new Audio("./assets/soundon.wav");
  soundOnAudio.preload = "auto";

  let currentPhoto = "";
  let lastKnownServerLocation = "";
  let hasUnsavedLocationChanges = false;
  let lastPlayedMessageKey = "";
  let lastMessagesClearedAt = 0;
  let audioEnabled = false;
  const messageHistory = [];
  const messageHistoryKeys = new Set();

  if (!id) {
    characterNameEl.textContent = "Paramètre id manquant.";
    return;
  }

  function getAudioPreferenceStorageKey() {
    return `cluedo_character_audio_enabled_${CHARACTER_AUDIO_PREFERENCE_VERSION}_${id}`;
  }

  function persistAudioPreference() {
    const serialized = audioEnabled ? "1" : "0";
    try {
      localStorage.setItem(getAudioPreferenceStorageKey(), serialized);
      sessionStorage.setItem(getAudioPreferenceStorageKey(), serialized);
    } catch (_error) {
      // noop
    }
  }

  function loadPersistedAudioPreference() {
    const key = getAudioPreferenceStorageKey();
    const stored = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (stored !== "1" && stored !== "0") return;
    audioEnabled = stored === "1";
  }

  function setAudioEnabled(nextValue) {
    audioEnabled = !!nextValue;
    persistAudioPreference();
    syncAudioButtonState();
  }

  function getMessageStorageKey() {
    return `cluedo_character_message_history_${CHARACTER_MESSAGE_HISTORY_VERSION}_${id}`;
  }

  function persistMessageHistory() {
    try {
      const payload = JSON.stringify(messageHistory);
      localStorage.setItem(getMessageStorageKey(), payload);
      sessionStorage.setItem(getMessageStorageKey(), payload);
    } catch (_error) {
      // noop
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
        lastPlayedMessageKey = messageHistory[0].key;
      }
    } catch (_error) {
      // noop
    }
  }

  function fmt(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return `${m}:${r}`;
  }

  function formatTimestamp(ts) {
    const raw = Number(ts || 0);
    const date = raw > 0 ? new Date(raw * 1000) : new Date();
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setPhotoPreview(src) {
    if (!src) {
      characterPhotoEl.classList.add("is-hidden");
      characterPhotoEl.removeAttribute("src");
      return;
    }

    characterPhotoEl.src = src;
    characterPhotoEl.classList.remove("is-hidden");
  }

  function renderMessageHistory() {
    if (!characterMessageHistoryEl) return;
    characterMessageHistoryEl.innerHTML = "";

    if (messageHistory.length === 0) {
      const empty = document.createElement("p");
      empty.className = "team-message-empty";
      empty.textContent = "Aucun message reçu.";
      characterMessageHistoryEl.appendChild(empty);
      return;
    }

    for (const entry of messageHistory) {
      const row = document.createElement("div");
      row.className = "team-message-item";

      const ts = document.createElement("span");
      ts.className = "team-message-time";
      ts.textContent = `[${entry.time}]`;

      const text = document.createElement("p");
      text.className = "team-message-text";
      text.textContent = entry.text;

      row.append(ts, text);
      characterMessageHistoryEl.appendChild(row);
    }

    characterMessageHistoryEl.scrollTop = 0;
    requestAnimationFrame(() => {
      characterMessageHistoryEl.scrollTop = 0;
    });
  }

  function pushMessageToHistory(messageText, createdAt) {
    const text = String(messageText || "").trim();
    if (!text) return;
    const key = `${text}::${String(createdAt || 0)}`;
    if (messageHistoryKeys.has(key)) return;
    messageHistory.unshift({ key, text, time: formatTimestamp(createdAt) });
    messageHistoryKeys.add(key);
    persistMessageHistory();
    renderMessageHistory();
    void maybePlayMessageSound(text, createdAt);
  }

  function clearMessageHistoryFromSupervision(clearedAt) {
    const clearedTimestamp = Number(clearedAt || 0);
    if (!Number.isFinite(clearedTimestamp) || clearedTimestamp <= 0 || clearedTimestamp <= lastMessagesClearedAt) {
      return;
    }

    lastMessagesClearedAt = clearedTimestamp;
    messageHistory.length = 0;
    messageHistoryKeys.clear();
    lastPlayedMessageKey = "";
    clearPersistedMessageHistoryForCurrentCharacter();
    renderMessageHistory();
  }

  async function maybePlayMessageSound(messageText, createdAt) {
    const key = `${messageText}::${String(createdAt || 0)}`;
    if (!audioEnabled || !messageText || key === lastPlayedMessageKey) return;
    lastPlayedMessageKey = key;
    messageAudio.currentTime = 0;
    try {
      await messageAudio.play();
    } catch (_error) {
      // Ne jamais modifier l'état du bouton son sur événement automatique.
    }
  }

  function syncAudioButtonState() {
    if (!audioEnableBtn) return;
    audioEnableBtn.textContent = audioEnabled ? "🔔 Son activé" : "🔔 Activer le son";
    audioEnableBtn.classList.toggle("is-enabled", audioEnabled);
    audioEnableBtn.classList.toggle("is-disabled", !audioEnabled);
    audioEnableBtn.setAttribute("aria-pressed", audioEnabled ? "true" : "false");
    if (audioHintEl) audioHintEl.hidden = audioEnabled;
  }

  async function uploadCharacterPhoto() {
    await window.CluedoPhotoUpload.uploadFromInput({
      id,
      input: characterPhotoInputEl,
      getPreviousPhoto: () => currentPhoto,
      setPhotoPreview: (src) => setPhotoPreview(src),
      sendUploadRequest: async ({ id: uploadId, file }) => {
        const fd = new FormData();
        fd.append("id", uploadId);
        fd.append("character_id", uploadId);
        fd.append("file", file);

        const response = await fetch("./api/upload.php", {
          method: "POST",
          body: fd,
        });

        const rawResponse = await response.text();
        const payload = (() => {
          try {
            return JSON.parse(rawResponse);
          } catch (_error) {
            return {};
          }
        })();

        if (!payload.ok) {
          return {
            ok: false,
            error: payload.error || (rawResponse ? `Erreur upload (${rawResponse.slice(0, 120)})` : "Erreur upload"),
          };
        }

        currentPhoto = payload.photo || payload.path || "";
        return {
          ok: true,
          photo: currentPhoto,
        };
      },
    });
  }

  function setLocationFeedback(message, status = "neutral") {
    if (!characterLocationFeedbackEl) return;
    characterLocationFeedbackEl.textContent = String(message || "");
    characterLocationFeedbackEl.classList.remove("is-success", "is-error", "is-processing");
    if (status === "success") characterLocationFeedbackEl.classList.add("is-success");
    if (status === "error") characterLocationFeedbackEl.classList.add("is-error");
    if (status === "processing") characterLocationFeedbackEl.classList.add("is-processing");
  }

  async function control(action, extraPayload = {}) {
    await fetch("./api/character_control.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, ...extraPayload }),
    });
    refresh();
  }

  function renderActiveTeam(activeTeam, hasWaitingTeams) {
    if (!activeTeam) {
      currentEl.innerHTML = "<h3>Équipe active</h3><p>Aucune équipe active.</p>";
      return;
    }

    const activeTeamName = activeTeam.team || activeTeam.name || activeTeam.nom || "(sans nom)";
    const activePhoto = String(activeTeam.photo || "").trim();
    const players = Array.isArray(activeTeam.players)
      ? activeTeam.players.map((name) => String(name || "").trim()).filter((name) => name.length > 0)
      : [];
    const participantsCount = players.length;
    const remainingSeconds = Number(activeTeam.remaining_seconds);
    const shouldDisplayNoUrgency = remainingSeconds <= 0 && !hasWaitingTeams;
    const remainingDisplay = shouldDisplayNoUrgency ? "∞" : fmt(remainingSeconds);
    const participantsDisplay = players.length
      ? players.map((name) => escapeHtml(name)).join(", ")
      : "Aucun participant renseigné.";

    currentEl.innerHTML = `
      <h3>Équipe active · ${escapeHtml(activeTeamName)}</h3>
      <div class="character-active-team-priority">
        <div class="character-active-team-identity">
          ${activePhoto
            ? `<img class="character-active-team-photo" src="${escapeHtml(activePhoto)}" alt="Photo de l'équipe ${escapeHtml(activeTeamName)}">`
            : '<div class="character-active-team-photo-placeholder" aria-hidden="true">👥</div>'}
          <div>
            <p class="character-active-team-remaining">Temps restant : ${remainingDisplay}</p>
            <p class="character-active-team-players">Participants (${participantsCount}) : ${participantsDisplay}</p>
          </div>
        </div>
      </div>
      <div class="character-active-team-actions">
        <button id="plus30" type="button" class="admin-button character-action-plus">+30 S</button>
        <button id="minus30" type="button" class="admin-button character-action-minus">-30 S</button>
        <button id="eject" type="button" class="admin-button character-action-eject">Éjecter l’équipe</button>
      </div>
    `;

    document.getElementById("plus30").onclick = () => control("plus_30");
    document.getElementById("minus30").onclick = () => control("minus_30");
    document.getElementById("eject").onclick = () => control("eject");
  }

  function renderGameOverviewCharacters(characters) {
    const list = Array.isArray(characters) ? characters : [];
    if (!list.length) {
      gameOverviewCharactersEl.innerHTML = '<p class="character-game-overview-empty">Aucun personnage actif.</p>';
      return;
    }

    gameOverviewCharactersEl.innerHTML = `<ol class="character-game-overview-list">${list
      .map((character) => {
        const name = String(character?.nom || `Personnage ${character?.id || "?"}`).trim() || "Personnage";
        const activeTeam = String(character?.active_team_name || "").trim();
        const waitingTeams = Array.isArray(character?.waiting_team_names)
          ? character.waiting_team_names.map((teamName) => String(teamName || "").trim()).filter((teamName) => teamName.length > 0)
          : [];

        const stateParts = [];
        if (activeTeam) {
          stateParts.push(`<span class="character-game-overview-team-active">${escapeHtml(activeTeam)}</span>`);
        }
        if (waitingTeams.length > 0) {
          stateParts.push(
            ...waitingTeams.map(
              (teamName) => `<span class="character-game-overview-team-waiting">${escapeHtml(teamName)}</span>`,
            ),
          );
        }
        if (stateParts.length === 0) {
          stateParts.push("Libre");
        }

        return `<li><span class="character-game-overview-item-name">${escapeHtml(name)} :</span> <span class="character-game-overview-item-state">${stateParts.join(", ")}</span></li>`;
      })
      .join("")}</ol>`;
  }

  function renderGameOverviewTeams(teams) {
    const list = Array.isArray(teams) ? teams : [];
    if (!list.length) {
      gameOverviewTeamsEl.innerHTML = '<p class="character-game-overview-empty">Aucune équipe connue.</p>';
      return;
    }

    gameOverviewTeamsEl.innerHTML = `<ol class="character-game-overview-list">${list
      .map((team) => {
        const teamName = String(team?.team_name || "Équipe sans nom").trim() || "Équipe sans nom";
        const characterName = String(team?.character_name || "").trim();
        const teamState = String(team?.state || "free").trim().toLowerCase();

        let stateLabel = "Libre";
        if (teamState === "active" && characterName) {
          stateLabel = `🕵️ ${characterName}`;
        } else if (teamState === "waiting" && characterName) {
          stateLabel = `⏳ ${characterName}`;
        }

        return `<li><span class="character-game-overview-item-name">${escapeHtml(teamName)} :</span> <span class="character-game-overview-item-state">${escapeHtml(stateLabel)}</span></li>`;
      })
      .join("")}</ol>`;
  }

  async function refresh() {
    const response = await fetch(`./api/character_status.php?id=${encodeURIComponent(id)}&t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      const errorCode = String(payload.error || "").toLowerCase();
      characterNameEl.textContent = errorCode.includes("character unavailable")
        ? "Personnage indisponible."
        : "Erreur de chargement.";
      currentEl.innerHTML = "";
      queueEl.innerHTML = "";
      return;
    }

    const character = payload.character;
    characterNameEl.innerHTML = `Personnage : <strong>${character.nom || "(sans nom)"}</strong> (#${character.id})`;

    const gameOverview = payload.game_overview || {};
    renderGameOverviewCharacters(gameOverview.characters);
    renderGameOverviewTeams(gameOverview.teams);

    const messagePayload = payload.message || {};
    clearMessageHistoryFromSupervision(messagePayload.cleared_at || 0);
    pushMessageToHistory(messagePayload.text || "", messagePayload.created_at || 0);

    currentPhoto = character.photo || "";
    setPhotoPreview(currentPhoto);

    lastKnownServerLocation = character.location || "";
    if (characterLocationInputEl && !hasUnsavedLocationChanges) {
      characterLocationInputEl.value = lastKnownServerLocation;
    }

    const activeTeam = payload.current || payload.active || payload.active_team || null;
    const waitingQueue = Array.isArray(payload.queue)
      ? payload.queue
      : (Array.isArray(payload.waiting_queue) ? payload.waiting_queue : []);

    renderActiveTeam(activeTeam, waitingQueue.length > 0);

    if (!waitingQueue.length) {
      queueEl.innerHTML = "<h3>Prochains enquêteurs</h3><p>Aucun interrogatoire en attente.</p>";
      return;
    }

    queueEl.innerHTML = `<h3>Prochains enquêteurs</h3><ol class="character-queue-list">${waitingQueue
      .map((team, index) => {
        const position = Number.isFinite(Number(team.position)) ? Number(team.position) : index + 1;
        const teamName = team.team || team.name || team.nom || "(sans nom)";
        const participantsCount = Math.max(0, Number(team.participants_count) || 0);
        return `<li><span class="character-queue-team">${position}. ${escapeHtml(teamName)} (${participantsCount})</span> <span class="character-queue-meta">– ${fmt(team.estimated_seconds)}</span></li>`;
      })
      .join("")}</ol>`;
  }

  characterPhotoButtonEl.addEventListener("click", () => {
    characterPhotoInputEl.click();
  });

  characterPhotoInputEl.addEventListener("change", uploadCharacterPhoto);

  audioEnableBtn?.addEventListener("click", async () => {
    if (audioEnabled) {
      const confirmed = window.confirm("Voulez-vous vraiment désactiver le son ?");
      if (!confirmed) return;
      setAudioEnabled(false);
      return;
    }

    setAudioEnabled(true);
    soundOnAudio.currentTime = 0;
    try {
      await soundOnAudio.play();
    } catch (_error) {
      // Le son reste activé : seul l'utilisateur peut changer cet état.
    }
  });

  if (characterLocationButtonEl) {
    characterLocationInputEl?.addEventListener("input", () => {
      hasUnsavedLocationChanges = true;
    });

    characterLocationButtonEl.addEventListener("click", async () => {
      const location = (characterLocationInputEl?.value || "").trim();
      const confirmed = window.confirm("Confirmer la mise à jour de l'emplacement du personnage ?");
      if (!confirmed) {
        setLocationFeedback("Mise à jour annulée.");
        return;
      }

      setLocationFeedback("Mise à jour en cours…", "processing");
      const response = await fetch("./api/character_control.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "set_location", location }),
      });
      const payload = await response.json().catch(() => ({ ok: false }));
      if (!response.ok || !payload.ok) {
        setLocationFeedback("Impossible de mettre à jour l'emplacement.", "error");
        return;
      }

      hasUnsavedLocationChanges = false;
      lastKnownServerLocation = location;
      setLocationFeedback("Emplacement mis à jour.", "success");
      refresh();
    });
  }

  loadPersistedAudioPreference();
  syncAudioButtonState();
  loadPersistedMessageHistory();
  renderMessageHistory();
  refresh();
  setInterval(refresh, 2000);
})();
