document.addEventListener("DOMContentLoaded", async () => {
  const TOKEN_KEY = "cluedo_player_token";
  const TEAM_KEY = "cluedo_team_name";
  const SOUND_PERMISSION_KEY = "cluedo_sound_permission";

  let playerToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  if (!playerToken) {
    playerToken = crypto.randomUUID();
  }
  localStorage.setItem(TOKEN_KEY, playerToken);
  sessionStorage.setItem(TOKEN_KEY, playerToken);

  let teamName = (localStorage.getItem(TEAM_KEY) || "").trim();

  const audio = new Audio("./assets/ding.mp3");
  audio.preload = "auto";

  let unlocked = localStorage.getItem(SOUND_PERMISSION_KEY) === "granted";
  let notified = false;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id) {
    document.body.innerHTML = "<p style='color:white'>ID manquant</p>";
    return;
  }

  document.body.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      background:#0f1115;
      color:white;
      font-family:Arial;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
    ">
      <div style="
        background:#171a21;
        border-radius:18px;
        padding:20px;
        max-width:520px;
        width:100%;
      ">
        <div id="characterLine" style="font-size:18px;color:#ddd;margin-bottom:6px">Vous allez voir : …</div>
        <div id="teamLine" style="font-size:16px;color:#bbb;margin-bottom:12px">Votre équipe : … <button id="renameBtn" style="margin-left:8px">Modifier</button></div>

        <div id="timerLabel" style="font-size:16px;color:#cbd5e1;text-align:center;margin-top:8px">Temps estimé</div>
        <div id="timer" style="font-size:64px;font-weight:bold;margin:10px 0;text-align:center">00:00</div>
        <div id="status" style="
          background:#fbbf24;
          color:black;
          padding:10px;
          border-radius:999px;
          font-weight:bold;
          line-height:1.35;
          text-align:center;
        ">Patientez</div>

        <div id="queueDetails" style="margin-top:12px;color:#cbd5e1;font-size:14px;line-height:1.5">
          <div>Position : <span id="position">-</span></div>
          <div>Temps estimé : <span id="estimatedWait">-</span></div>
          <div>Équipe précédente : <span id="previousTeam">-</span></div>
        </div>

        <div id="needName" style="display:none;margin-top:16px;text-align:center;">
          <button id="setNameBtn" style="padding:10px 14px;border-radius:10px">Saisir le nom d’équipe</button>
        </div>

        <div id="leaveQueue" style="display:none;margin-top:12px;text-align:center;">
          <button id="leaveQueueBtn" style="padding:10px 14px;border-radius:10px">Quitter la file d’attente</button>
        </div>

        <div id="leaveActive" style="display:none;margin-top:12px;text-align:center;">
          <button id="leaveActiveBtn" style="padding:10px 14px;border-radius:10px">Je ne suis plus avec …</button>
        </div>

        <div id="elapsedWrap" style="display:none;margin-top:12px;text-align:center;">
          <div style="font-size:15px;color:#cbd5e1;">Temps passé</div>
          <div id="elapsedTimer" style="font-size:32px;font-weight:bold;margin-top:4px;">00:00</div>
        </div>

        <div id="photoWrap" style="display:none;margin-top:12px;">
          <img id="photo" alt="Photo" style="width:100%;max-height:260px;object-fit:contain;border-radius:14px">
        </div>

        <div id="result" style="display:none;margin-top:16px">
          <div id="message" style="font-size:18px;font-weight:bold;margin-bottom:10px"></div>
        </div>
      </div>
    </div>
  `;

  if (!unlocked) {
    const unlock = document.createElement("button");
    unlock.textContent = "🔊 Activer les notifications sonores";
    unlock.style.position = "fixed";
    unlock.style.bottom = "20px";
    unlock.style.left = "50%";
    unlock.style.transform = "translateX(-50%)";
    unlock.style.background = "#000";
    unlock.style.color = "#fff";
    unlock.style.padding = "10px 14px";
    unlock.style.borderRadius = "999px";
    unlock.style.border = "1px solid #334155";
    unlock.style.fontSize = "14px";
    unlock.style.opacity = "0.9";
    unlock.style.zIndex = "999";
    unlock.onclick = () => {
      audio.currentTime = 0;
      audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          unlocked = true;
          localStorage.setItem(SOUND_PERMISSION_KEY, "granted");
          unlock.remove();
        })
        .catch(() => {
          unlocked = false;
          localStorage.setItem(SOUND_PERMISSION_KEY, "denied");
          window.alert("Impossible d’activer le son sur cet appareil.");
        });
    };
    document.body.appendChild(unlock);
  }

  const elCharacterLine = document.getElementById("characterLine");
  const elTeamLine = document.getElementById("teamLine");
  const elTimerLabel = document.getElementById("timerLabel");
  const elTimer = document.getElementById("timer");
  const elStatus = document.getElementById("status");
  const elResult = document.getElementById("result");
  const elMessage = document.getElementById("message");
  const elPhoto = document.getElementById("photo");
  const elNeedName = document.getElementById("needName");
  const elSetNameBtn = document.getElementById("setNameBtn");
  const elRenameBtn = document.getElementById("renameBtn");
  const elPosition = document.getElementById("position");
  const elEstimatedWait = document.getElementById("estimatedWait");
  const elPreviousTeam = document.getElementById("previousTeam");
  const elQueueDetails = document.getElementById("queueDetails");
  const elLeaveQueue = document.getElementById("leaveQueue");
  const elLeaveQueueBtn = document.getElementById("leaveQueueBtn");
  const elLeaveActive = document.getElementById("leaveActive");
  const elLeaveActiveBtn = document.getElementById("leaveActiveBtn");
  const elElapsedWrap = document.getElementById("elapsedWrap");
  const elElapsedTimer = document.getElementById("elapsedTimer");
  const elPhotoWrap = document.getElementById("photoWrap");

  let pollTimeoutId = null;
  let hasFatalError = false;
  let hasAutoPromptedNeedName = false;
  let teamNameInitializationLocked = hasValidUserTeamName(teamName);
  let localTimerIntervalId = null;
  let localTimerMode = "none";
  let localTimerRemaining = 0;
  let localTimerLastTickAt = 0;
  let localElapsedSeconds = 0;
  let hasVoluntarilyLeft = false;
  let previousState = null;
  let shouldAttemptJoin = true;

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function getReadableErrorMessage(rawError) {
    const normalizedError = String(rawError || "").toLowerCase();

    if (normalizedError.includes("unknown id")) {
      return "Partie introuvable.";
    }

    if (normalizedError.includes("missing id or token")) {
      return "Lien invalide. Merci de réouvrir le lien joueur.";
    }

    return "Une erreur est survenue. Merci de réessayer.";
  }

  function showFatalError(message) {
    hasFatalError = true;

    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }

    stopLocalTimer();

    elCharacterLine.textContent = "Erreur";
    elTeamLine.textContent = "";
    elTimer.textContent = "--:--";
    elStatus.textContent = message;
    elStatus.style.background = "#ef4444";
    elResult.style.display = "none";
  }

  function askTeamName(defaultValue = "") {
    const prompted = window.prompt("Nom de votre équipe :", defaultValue);
    if (prompted === null) {
      return null;
    }

    const trimmed = prompted.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed;
  }

  function isPlaceholderTeamName(name) {
    const normalized = String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return normalized === "equipe sans nom";
  }

  function hasValidUserTeamName(name) {
    const trimmed = String(name || "").trim();
    return !!trimmed && !isPlaceholderTeamName(trimmed);
  }

  async function updateTeamNameOnServer(newName) {
    if (!newName) {
      return;
    }

    const response = await fetch("./api/rename_team.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        team_id: playerToken,
        nouveau_nom: newName,
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      window.alert("Impossible de modifier le nom d’équipe.");
      return;
    }

    teamName = payload.equipe?.nom || newName;
    localStorage.setItem(TEAM_KEY, teamName);
  }

  async function initializeTeamNameOnServer(initialName) {
    if (!initialName) {
      return false;
    }

    const query = new URLSearchParams({
      id,
      token: playerToken,
      team_name: initialName,
      join: "1",
      t: String(Date.now()),
    });

    const response = await fetch(`./api/status.php?${query.toString()}`);
    const payload = await response.json();

    if (!response.ok || payload?.error) {
      return false;
    }

    const resolvedTeamName = (payload.equipe?.nom || initialName).trim();
    if (!hasValidUserTeamName(resolvedTeamName)) {
      return false;
    }

    teamName = resolvedTeamName;
    localStorage.setItem(TEAM_KEY, teamName);
    return true;
  }

  async function renameTeam() {
    const newName = askTeamName(teamName);
    if (!newName || newName === teamName) {
      return;
    }

    await updateTeamNameOnServer(newName);
  }

  async function leaveQueue() {
    const response = await fetch("./api/leave_queue.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, token: playerToken }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      window.alert("Impossible de quitter la file d’attente.");
      return;
    }

    hasVoluntarilyLeft = true;
    shouldAttemptJoin = false;
    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }

    stopLocalTimer();
    elLeaveQueue.style.display = "none";
    elLeaveActive.style.display = "none";
    elElapsedWrap.style.display = "none";
    elStatus.textContent = "Vous avez quitté l’interaction.";
    elStatus.style.background = "#94a3b8";
    elTimerLabel.textContent = "Temps estimé";
    elTimer.textContent = "--:--";
    elResult.style.display = "none";
    elQueueDetails.style.display = "none";

    // Conserver l'identité de l'équipe après sortie volontaire de file.
    // Le nom ne doit jamais être redemandé tant qu'un nom valide existe.
    if (hasValidUserTeamName(teamName)) {
      teamNameInitializationLocked = true;
      hasAutoPromptedNeedName = false;
      localStorage.setItem(TEAM_KEY, teamName);
    }
  }

  function closePlayWindow(reason) {
    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }
    hasVoluntarilyLeft = true;

    // Tentative standard : fonctionne surtout si l'onglet a été ouvert par script.
    window.close();

    // Fallback explicite (pas de contournement silencieux) pour navigateurs qui bloquent `window.close()`.
    setTimeout(() => {
      if (!document.hidden) {
        elStatus.textContent = reason;
        elStatus.style.background = "#94a3b8";
        elResult.style.display = "none";
        elLeaveQueue.style.display = "none";
        elLeaveActive.style.display = "none";
        elElapsedWrap.style.display = "none";
        elQueueDetails.style.display = "none";
        elTimer.textContent = "--:--";
      }
    }, 250);
  }

  function stopLocalTimer() {
    localTimerMode = "none";
    localTimerRemaining = 0;
    localTimerLastTickAt = 0;
    localElapsedSeconds = 0;
    elElapsedTimer.textContent = fmt(localElapsedSeconds);
  }

  function syncLocalTimer(mode, serverSeconds) {
    const nextSeconds = Math.max(0, Number(serverSeconds) || 0);

    if (localTimerMode !== mode) {
      localTimerMode = mode;
      localTimerRemaining = nextSeconds;
      localTimerLastTickAt = Date.now();
      return;
    }

    if (localTimerLastTickAt === 0) {
      localTimerRemaining = nextSeconds;
      localTimerLastTickAt = Date.now();
      return;
    }

    if (nextSeconds < localTimerRemaining - 1 || nextSeconds > localTimerRemaining + 2) {
      localTimerRemaining = nextSeconds;
      localTimerLastTickAt = Date.now();
    }
  }

  function ensureLocalTimerLoop() {
    if (localTimerIntervalId) {
      return;
    }

    localTimerIntervalId = setInterval(() => {
      if (hasFatalError || localTimerMode === "none" || localTimerLastTickAt === 0) {
        return;
      }

      const now = Date.now();
      const deltaSec = (now - localTimerLastTickAt) / 1000;
      if (deltaSec <= 0) {
        return;
      }

      localTimerRemaining = Math.max(0, localTimerRemaining - deltaSec);
      localTimerLastTickAt = now;

      const current = fmt(localTimerRemaining);
      elTimer.textContent = current;

      if (localTimerMode === "waiting") {
        elEstimatedWait.textContent = current;
        return;
      }

      if (localTimerMode === "active") {
        localElapsedSeconds += deltaSec;
        elElapsedTimer.textContent = fmt(localElapsedSeconds);
      }
    }, 250);
  }

  elSetNameBtn.onclick = async () => {
    const name = askTeamName(teamName || "");
    if (!name) {
      return;
    }

    if (hasValidUserTeamName(teamName)) {
      await updateTeamNameOnServer(name);
      return;
    }

    const initialized = await initializeTeamNameOnServer(name);
    if (initialized) {
      teamNameInitializationLocked = true;
      hasAutoPromptedNeedName = false;
      elNeedName.style.display = "none";
    }
  };

  elRenameBtn.onclick = async () => {
    if (!hasValidUserTeamName(teamName)) {
      elSetNameBtn.click();
      return;
    }
    await renameTeam();
  };

  elLeaveQueueBtn.onclick = async () => {
    await leaveQueue();
  };

  elLeaveActiveBtn.onclick = async () => {
    await leaveQueue();
    closePlayWindow("Sortie effectuée. Fermez cette fenêtre si elle ne s’est pas fermée automatiquement.");
  };

  async function loop() {
    if (hasFatalError || hasVoluntarilyLeft) {
      return;
    }

    try {
      const query = new URLSearchParams({
        id,
        token: playerToken,
        t: String(Date.now())
      });
      if (shouldAttemptJoin) {
        query.set("join", "1");
      }
      if (hasValidUserTeamName(teamName)) {
        query.set("team_name", teamName);
      }
      const r = await fetch(`./api/status.php?${query.toString()}`);
      const data = await r.json();

      if (!r.ok) {
        showFatalError("Service momentanément indisponible.");
        return;
      }

      if (!data || typeof data !== "object") {
        showFatalError("Réponse serveur invalide.");
        return;
      }

      if (data.error) {
        const readableError = getReadableErrorMessage(data.error);
        showFatalError(readableError);
        return;
      }

      const personnageNom = data.personnage?.nom || data.nom || `Interlocuteur #${id}`;
      const equipeNom = data.equipe?.nom || teamName;
      const hasValidNameFromServer = hasValidUserTeamName(equipeNom);
      const position = Number.isInteger(data.file?.position) ? data.file.position : (Number.isInteger(data.position) ? data.position : null);
      const queueTotal = data.file?.total ?? data.queue_length ?? 0;
      const inQueue = data.in_queue === true;
      const waitRemaining = data.file?.temps_attente_estime_seconds ?? data.wait_remaining ?? 0;
      const activeRemainingBeforeTakeover = data.timers?.active_remaining_before_takeover_seconds;
      const activeReservedDuration = data.timers?.time_per_player_seconds ?? data.time_per_player ?? 0;
      const previousTeam = (data.file?.equipe_precedente ?? data.previous_team ?? "").trim();
      // Règle de sécurité métier : ne jamais inférer l'état "active" à partir du temps restant.
      // L'accès UI "C'est votre tour" n'est autorisé que sur signal explicite serveur
      // (`state === "active"` ou `can_access === true`). Sans signal explicite => `waiting`.
      const hasExplicitAccess = data.state === "active" || data.can_access === true;
      const state = data.state === "free"
        ? "free"
        : (data.state === "need_name" ? "need_name" : (hasExplicitAccess ? "active" : "waiting"));

      if (inQueue) {
        shouldAttemptJoin = false;
      }

      if (state === "free") {
        shouldAttemptJoin = false;
        stopLocalTimer();
        elNeedName.style.display = "none";
        elLeaveQueue.style.display = "none";
        elLeaveActive.style.display = "none";
        elElapsedWrap.style.display = "none";
        elQueueDetails.style.display = "none";
        elTimerLabel.textContent = "Session terminée";
        elTimer.textContent = "--:--";
        elTimer.style.color = "white";
        elStatus.textContent = "Votre passage est terminé. Vous êtes désormais libre.";
        elStatus.style.background = "#94a3b8";
        elResult.style.display = "none";
        pollTimeoutId = setTimeout(loop, 1000);
        return;
      }

      if (previousState === "active" && state !== "active") {
        closePlayWindow("Interaction terminée. Fermez cette fenêtre si elle ne s’est pas fermée automatiquement.");
        return;
      }

      if (state === "need_name" && hasValidUserTeamName(teamName)) {
        await initializeTeamNameOnServer(teamName);
        pollTimeoutId = setTimeout(loop, 1000);
        previousState = state;
        return;
      }

      if (state === "need_name" || !hasValidNameFromServer) {
        teamNameInitializationLocked = false;
        if (!hasValidUserTeamName(teamName)) {
          teamName = "";
          localStorage.removeItem(TEAM_KEY);
        }
        stopLocalTimer();
        elNeedName.style.display = "block";
        elLeaveQueue.style.display = "none";
        elLeaveActive.style.display = "none";
        elElapsedWrap.style.display = "none";
        elStatus.textContent = "Merci de saisir le nom de votre équipe";
        elStatus.style.background = "#fbbf24";
        elTimer.textContent = "--:--";
        elTimer.style.color = "white";
        elTimerLabel.textContent = "Temps estimé";
        elQueueDetails.style.display = "block";
        elTeamLine.innerHTML = `Votre équipe : <strong>Non renseignée</strong> <button id="renameBtnDynamic" style="margin-left:8px">Modifier</button>`;
        document.getElementById("renameBtnDynamic").onclick = () => elSetNameBtn.click();

        if (!teamNameInitializationLocked && !hasAutoPromptedNeedName) {
          hasAutoPromptedNeedName = true;
          setTimeout(() => {
            elSetNameBtn.click();
          }, 50);
        }

        pollTimeoutId = setTimeout(loop, 1000);
        previousState = state;
        return;
      }

      teamName = equipeNom;
      teamNameInitializationLocked = true;
      hasAutoPromptedNeedName = false;
      localStorage.setItem(TEAM_KEY, teamName);

      elCharacterLine.textContent = state === "active"
        ? `Vous êtes avec : ${personnageNom}`
        : `Vous allez voir : ${personnageNom}`;
      elLeaveActiveBtn.textContent = `Je ne suis plus avec ${personnageNom}`;
      elTeamLine.innerHTML = `Votre équipe : <strong>${teamName}</strong> <button id="renameBtnDynamic" style="margin-left:8px">Modifier</button>`;
      document.getElementById("renameBtnDynamic").onclick = async () => {
        await renameTeam();
      };

      elPosition.textContent = Number.isInteger(position) && queueTotal > 0 ? `${position + 1} / ${queueTotal}` : "-";
      elEstimatedWait.textContent = fmt(waitRemaining);
      elPreviousTeam.textContent = previousTeam || "Aucune";

      if (state === "waiting") {
        elNeedName.style.display = "none";
        elLeaveQueue.style.display = "block";
        elLeaveActive.style.display = "none";
        elElapsedWrap.style.display = "none";
        syncLocalTimer("waiting", waitRemaining);
        const waitingText = fmt(localTimerRemaining);
        elTimer.textContent = waitingText;
        elTimer.style.color = "white";
        elTimerLabel.textContent = "Temps estimé";
        elQueueDetails.style.display = "block";
        elStatus.textContent = `Équipe en attente`;
        elStatus.style.background = "#fbbf24";
        elTimer.style.animation = "none";
        elResult.style.display = "none";
        notified = false;
      } else {
        elNeedName.style.display = "none";
        elLeaveQueue.style.display = "none";
        elLeaveActive.style.display = "block";
        elElapsedWrap.style.display = "block";
        const hasQueuedTeam = Number(queueTotal) > 1;
        const nextTeamName = hasQueuedTeam
          ? ((data.file?.next_team_name || data.file?.equipe_precedente || "").trim() || "L’équipe suivante")
          : "";

        const configuredTimePerPlayer = Math.max(0, Number(activeReservedDuration) || 0);
        const serverActiveRemaining = Math.max(0, Number(activeRemainingBeforeTakeover) || 0);
        const elapsedOnReservedWindow = Math.max(0, configuredTimePerPlayer - serverActiveRemaining);
        const localActiveRemaining = Math.max(0, configuredTimePerPlayer - elapsedOnReservedWindow);

        syncLocalTimer("active", localActiveRemaining);
        localElapsedSeconds = Math.max(localElapsedSeconds, elapsedOnReservedWindow);
        elTimer.textContent = fmt(localTimerRemaining);
        elElapsedTimer.textContent = fmt(localElapsedSeconds);

        elQueueDetails.style.display = "none";
        elTimerLabel.textContent = "⏱️ Temps réservé";
        elTimer.style.color = "white";
        elTimer.style.animation = "none";
        if (hasQueuedTeam) {
          const isTakeoverSoon = localTimerRemaining <= 15;
          elStatus.textContent = `L’équipe ${nextTeamName} attend et prendra votre place à la fin du temps.`;
          elStatus.style.background = isTakeoverSoon ? "#ef4444" : "#fb923c";
          elTimer.style.color = isTakeoverSoon ? "#ef4444" : "white";
          elTimer.style.animation = isTakeoverSoon ? "cluedoCriticalBlink 1s steps(2, end) infinite" : "none";
          elMessage.textContent = "⚠️ Relève automatique à la fin du temps.";
        } else {
          elStatus.textContent = `Échangez avec ${personnageNom} en toute tranquillité jusqu’à la fin du temps. Si aucune équipe n’arrive, vous pouvez continuer autant de temps que vous le souhaitez.`;
          elStatus.style.background = "#4ade80";
          elTimer.style.animation = "none";
          elMessage.textContent = "";
        }
        elResult.style.display = "block";

        if (!notified && unlocked) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
          notified = true;
        }
      }

      previousState = state;

      const configuredPhoto = String(data.photo || data.personnage?.photo || "").trim();
      if (configuredPhoto) {
        elPhoto.src = configuredPhoto;
        elPhotoWrap.style.display = "block";
        elPhoto.style.display = "block";
      } else {
        elPhoto.removeAttribute("src");
        elPhotoWrap.style.display = "none";
        elPhoto.style.display = "none";
      }
    } catch (e) {
      showFatalError("Impossible de récupérer le statut.");
      return;
    }

    pollTimeoutId = setTimeout(loop, 1000);
  }

  ensureLocalTimerLoop();
  loop();
});
