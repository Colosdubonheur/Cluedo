(function () {
  const CHARACTER_AUDIO_ENABLED_KEY = "cluedo_character_audio_enabled";
  const CHARACTER_MESSAGE_HISTORY_VERSION = "v1";

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

  const messageAudio = new Audio("./assets/message.wav");
  messageAudio.preload = "auto";
  const soundOnAudio = new Audio("./assets/soundon.wav");
  soundOnAudio.preload = "auto";

  let currentPhoto = "";
  let lastKnownServerLocation = "";
  let hasUnsavedLocationChanges = false;
  let lastPlayedMessageKey = "";
  let lastMessagesClearedAt = 0;
  let audioEnabled = localStorage.getItem(CHARACTER_AUDIO_ENABLED_KEY) === "1";
  const messageHistory = [];
  const messageHistoryKeys = new Set();

  if (!id) {
    characterNameEl.textContent = "Paramètre id manquant.";
    return;
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
      audioEnabled = false;
      localStorage.setItem(CHARACTER_AUDIO_ENABLED_KEY, "0");
      syncAudioButtonState();
    }
  }

  function syncAudioButtonState() {
    if (!audioEnableBtn) return;
    audioEnableBtn.textContent = audioEnabled ? "🔔 Son activé" : "🔔 Activer le son";
    audioEnableBtn.classList.toggle("is-enabled", audioEnabled);
    audioEnableBtn.classList.toggle("is-disabled", !audioEnabled);
    audioEnableBtn.setAttribute("aria-pressed", audioEnabled ? "true" : "false");
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


  function describeCharacterState(character) {
    const name = String(character?.nom || "").trim() || "(sans nom)";
    const activeTeamName = String(character?.active_team_name || "").trim();
    const waitingTeams = Array.isArray(character?.waiting_team_names)
      ? character.waiting_team_names.map((teamName) => String(teamName || "").trim()).filter((teamName) => teamName.length > 0)
      : [];

    const parts = [];
    if (activeTeamName) {
      parts.push(`Interrogatoire en cours : ${activeTeamName}`);
    }
    if (waitingTeams.length > 0) {
      parts.push(`En attente : ${waitingTeams.join(", ")}`);
    }
    if (!activeTeamName && waitingTeams.length === 0) {
      parts.push("Libre");
    }

    return `<li><span class="character-game-overview-item-name">${escapeHtml(name)}</span><span class="character-game-overview-item-state">${escapeHtml(parts.join(" · "))}</span></li>`;
  }

  function describeTeamState(team) {
    const teamName = String(team?.team_name || "").trim() || "Équipe sans nom";
    const state = String(team?.state || "free");
    const characterName = String(team?.character_name || "").trim() || "(sans nom)";

    let text = "Libre";
    if (state === "active") {
      text = `En interrogation avec ${characterName}`;
    } else if (state === "waiting") {
      text = `En attente avec ${characterName}`;
    }

    return `<li><span class="character-game-overview-item-name">${escapeHtml(teamName)}</span><span class="character-game-overview-item-state">${escapeHtml(text)}</span></li>`;
  }

  function renderGameOverview(payload) {
    if (!gameOverviewCharactersEl || !gameOverviewTeamsEl) return;

    const characters = Array.isArray(payload?.game_overview?.characters)
      ? payload.game_overview.characters
      : [];
    const teams = Array.isArray(payload?.game_overview?.teams)
      ? payload.game_overview.teams
      : [];

    if (characters.length === 0) {
      gameOverviewCharactersEl.innerHTML = '<p class="character-game-overview-empty">Aucun personnage actif.</p>';
    } else {
      gameOverviewCharactersEl.innerHTML = `<ul class="character-game-overview-list">${characters.map(describeCharacterState).join("")}</ul>`;
    }

    if (teams.length === 0) {
      gameOverviewTeamsEl.innerHTML = '<p class="character-game-overview-empty">Aucune équipe connue.</p>';
      return;
    }

    gameOverviewTeamsEl.innerHTML = `<ul class="character-game-overview-list">${teams.map(describeTeamState).join("")}</ul>`;
  }

  function renderActiveTeam(activeTeam) {
    if (!activeTeam) {
      currentEl.innerHTML = "<h3>Équipe active</h3><p>Aucune équipe active.</p>";
      return;
    }

    const activeTeamName = activeTeam.team || activeTeam.name || activeTeam.nom || "(sans nom)";
    const activeState = activeTeam.state || "active";
    const activePhoto = String(activeTeam.photo || "").trim();
    const players = Array.isArray(activeTeam.players)
      ? activeTeam.players.map((name) => String(name || "").trim()).filter((name) => name.length > 0)
      : [];
    const participantsCount = players.length;

    currentEl.innerHTML = `
      <h3>Équipe active · ${escapeHtml(activeTeamName)}</h3>
      <div class="character-active-team-priority">
        <div class="character-active-team-identity">
          ${activePhoto
            ? `<img class="character-active-team-photo" src="${escapeHtml(activePhoto)}" alt="Photo de l'équipe ${escapeHtml(activeTeamName)}">`
            : '<div class="character-active-team-photo-placeholder" aria-hidden="true">👥</div>'}
          <div>
            <p class="character-active-team-state">État : <strong>${escapeHtml(activeState)}</strong></p>
            <p class="character-active-team-remaining">Temps restant : ${fmt(activeTeam.remaining_seconds)}</p>
            <p class="character-active-team-players-title">Participants (${participantsCount})</p>
            ${players.length
              ? `<p class="character-active-team-players">${players.map((name) => escapeHtml(name)).join(", ")}</p>`
              : '<p class="character-active-team-players-empty">Aucun participant renseigné.</p>'}
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

    renderActiveTeam(activeTeam);
    renderGameOverview(payload);

    if (!waitingQueue.length) {
      queueEl.innerHTML = "<h3>Interrogatoires en attente</h3><p>Aucun interrogatoire en attente.</p>";
      return;
    }

    queueEl.innerHTML = `<h3>Interrogatoires en attente</h3><ol class="character-queue-list">${waitingQueue
      .map((team, index) => {
        const position = Number.isFinite(Number(team.position)) ? Number(team.position) : index + 1;
        const teamName = team.team || team.name || team.nom || "(sans nom)";
        const state = team.state || "waiting";
        return `<li><span class="character-queue-team">${position}. ${escapeHtml(teamName)}</span> <span class="character-queue-meta">${escapeHtml(state)} · ${fmt(team.estimated_seconds)}</span></li>`;
      })
      .join("")}</ol>`;
  }

  characterPhotoButtonEl.addEventListener("click", () => {
    characterPhotoInputEl.click();
  });

  characterPhotoInputEl.addEventListener("change", uploadCharacterPhoto);

  audioEnableBtn?.addEventListener("click", async () => {
    if (audioEnabled) {
      audioEnabled = false;
      localStorage.setItem(CHARACTER_AUDIO_ENABLED_KEY, "0");
      syncAudioButtonState();
      return;
    }

    soundOnAudio.currentTime = 0;
    try {
      await soundOnAudio.play();
      audioEnabled = true;
      localStorage.setItem(CHARACTER_AUDIO_ENABLED_KEY, "1");
    } catch (_error) {
      audioEnabled = false;
      localStorage.setItem(CHARACTER_AUDIO_ENABLED_KEY, "0");
    }
    syncAudioButtonState();
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

  syncAudioButtonState();
  loadPersistedMessageHistory();
  renderMessageHistory();
  refresh();
  setInterval(refresh, 2000);
})();
