document.addEventListener("DOMContentLoaded", async () => {
  const TOKEN_KEY = "cluedo_player_token";
  const TEAM_KEY = "cluedo_team_name";

  let playerToken = sessionStorage.getItem(TOKEN_KEY);
  if (!playerToken) {
    playerToken = crypto.randomUUID();
    sessionStorage.setItem(TOKEN_KEY, playerToken);
  }

  let teamName = (localStorage.getItem(TEAM_KEY) || "").trim();

  const audio = new Audio("./assets/ding.mp3");
  audio.preload = "auto";

  let unlocked = false;
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

        <div id="result" style="display:none;margin-top:16px">
          <div id="message" style="font-size:18px;font-weight:bold;margin-bottom:10px"></div>
          <img id="photo" style="width:100%;max-height:260px;object-fit:contain;border-radius:14px">
        </div>
      </div>
    </div>
  `;

  const unlock = document.createElement("div");
  unlock.textContent = "🔊 Tapotez l’écran pour activer le son";
  unlock.style.position = "fixed";
  unlock.style.bottom = "20px";
  unlock.style.left = "50%";
  unlock.style.transform = "translateX(-50%)";
  unlock.style.background = "#000";
  unlock.style.color = "#fff";
  unlock.style.padding = "10px 14px";
  unlock.style.borderRadius = "999px";
  unlock.style.fontSize = "14px";
  unlock.style.opacity = "0.85";
  unlock.style.zIndex = "999";
  unlock.onclick = () => {
    unlocked = true;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    unlock.remove();
  };
  document.body.appendChild(unlock);

  const elCharacterLine = document.getElementById("characterLine");
  const elTeamLine = document.getElementById("teamLine");
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

  let pollTimeoutId = null;
  let hasFatalError = false;
  let needNamePromptInFlight = false;

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
      elNeedName.style.display = "none";
      await loop();
    }
  };

  elRenameBtn.onclick = async () => {
    if (!hasValidUserTeamName(teamName)) {
      elSetNameBtn.click();
      return;
    }
    await renameTeam();
  };

  async function loop() {
    if (hasFatalError) {
      return;
    }

    if (!hasValidUserTeamName(teamName)) {
      teamName = "";
      localStorage.removeItem(TEAM_KEY);
      elNeedName.style.display = "block";
      elStatus.textContent = "Merci de saisir le nom de votre équipe";
      elStatus.style.background = "#fbbf24";
      elTimer.textContent = "--:--";
      elTeamLine.innerHTML = `Votre équipe : <strong>Non renseignée</strong> <button id="renameBtnDynamic" style="margin-left:8px">Modifier</button>`;
      document.getElementById("renameBtnDynamic").onclick = () => elSetNameBtn.click();

      if (!needNamePromptInFlight) {
        needNamePromptInFlight = true;
        setTimeout(() => {
          elSetNameBtn.click();
          needNamePromptInFlight = false;
        }, 50);
      }

      pollTimeoutId = setTimeout(loop, 1000);
      return;
    }

    elNeedName.style.display = "none";

    try {
      const query = new URLSearchParams({
        id,
        token: playerToken,
        t: String(Date.now())
      });
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

      const personnageNom = data.personnage?.nom || data.nom || `Personnage #${id}`;
      const equipeNom = data.equipe?.nom || teamName;
      const hasValidNameFromServer = hasValidUserTeamName(equipeNom);
      const position = Number.isInteger(data.file?.position) ? data.file.position : (Number.isInteger(data.position) ? data.position : null);
      const queueTotal = data.file?.total ?? data.queue_length ?? 0;
      const waitRemaining = data.file?.temps_attente_estime_seconds ?? data.wait_remaining ?? 0;
      const myRemaining = data.my_remaining ?? 0;
      const previousTeam = (data.file?.equipe_precedente ?? data.previous_team ?? "").trim();
      // Règle de sécurité métier : ne jamais inférer l'état "active" à partir du temps restant.
      // L'accès UI "C'est votre tour" n'est autorisé que sur signal explicite serveur
      // (`state === "active"` ou `can_access === true`). Sans signal explicite => `waiting`.
      const hasExplicitAccess = data.state === "active" || data.can_access === true;
      const state = data.state === "need_name" ? "need_name" : (hasExplicitAccess ? "active" : "waiting");

      if (state === "need_name" || !hasValidNameFromServer) {
        teamName = "";
        localStorage.removeItem(TEAM_KEY);
        elNeedName.style.display = "block";
        elStatus.textContent = "Merci de saisir le nom de votre équipe";
        elStatus.style.background = "#fbbf24";
        elTimer.textContent = "--:--";
        elTeamLine.innerHTML = `Votre équipe : <strong>Non renseignée</strong> <button id="renameBtnDynamic" style="margin-left:8px">Modifier</button>`;
        document.getElementById("renameBtnDynamic").onclick = () => elSetNameBtn.click();

        if (!needNamePromptInFlight) {
          needNamePromptInFlight = true;
          setTimeout(() => {
            elSetNameBtn.click();
            needNamePromptInFlight = false;
          }, 50);
        }

        pollTimeoutId = setTimeout(loop, 1000);
        return;
      }

      teamName = equipeNom;
      localStorage.setItem(TEAM_KEY, teamName);

      elCharacterLine.textContent = `Vous allez voir : ${personnageNom}`;
      elTeamLine.innerHTML = `Votre équipe : <strong>${teamName}</strong> <button id="renameBtnDynamic" style="margin-left:8px">Modifier</button>`;
      document.getElementById("renameBtnDynamic").onclick = async () => {
        await renameTeam();
      };

      elPosition.textContent = Number.isInteger(position) && queueTotal > 0 ? `${position + 1} / ${queueTotal}` : "-";
      elEstimatedWait.textContent = fmt(waitRemaining);
      elPreviousTeam.textContent = previousTeam || "Aucune";

      if (state === "waiting") {
        elTimer.textContent = fmt(waitRemaining);
        elStatus.textContent = `Équipe en attente`;
        elStatus.style.background = "#fbbf24";
        elResult.style.display = "none";
        notified = false;
      } else {
        if (myRemaining > 0) {
          elTimer.textContent = fmt(myRemaining);
          elStatus.textContent = "C’est votre tour, vous pouvez accéder au personnage";
          elStatus.style.background = "#fbbf24";
          elResult.style.display = "none";
        } else {
          elTimer.textContent = "00:00";
          elStatus.textContent = "C’est votre tour, vous pouvez accéder au personnage";
          elStatus.style.background = "#4ade80";

          elResult.style.display = "block";
          elMessage.textContent =
            queueTotal > 1
              ? "⚠️ Une autre équipe arrive dans quelques secondes"
              : `Vous pouvez parler à ${personnageNom} tant qu'aucune autre équipe n'arrive.`;

          if (data.photo) {
            elPhoto.src = data.photo;
            elPhoto.style.display = "block";
          } else {
            elPhoto.style.display = "none";
          }

          if (!notified && unlocked) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
            notified = true;
          }
        }
      }
    } catch (e) {
      showFatalError("Impossible de récupérer le statut.");
      return;
    }

    pollTimeoutId = setTimeout(loop, 1000);
  }

  loop();
});
