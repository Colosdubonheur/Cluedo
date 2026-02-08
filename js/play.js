document.addEventListener("DOMContentLoaded", async () => {
  const TOKEN_KEY = "cluedo_player_token";

  let playerToken = sessionStorage.getItem(TOKEN_KEY);
  if (!playerToken) {
    playerToken = crypto.randomUUID();
    sessionStorage.setItem(TOKEN_KEY, playerToken);
  }

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
        max-width:420px;
        width:100%;
        text-align:center;
      ">
        <div id="name" style="font-size:18px;color:#aaa">Chargement…</div>
        <div id="timer" style="font-size:64px;font-weight:bold;margin:10px 0">00:00</div>
        <div id="status" style="
          background:#fbbf24;
          color:black;
          padding:10px;
          border-radius:999px;
          font-weight:bold;
        ">
          Patientez
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

  const elName = document.getElementById("name");
  const elTimer = document.getElementById("timer");
  const elStatus = document.getElementById("status");
  const elResult = document.getElementById("result");
  const elMessage = document.getElementById("message");
  const elPhoto = document.getElementById("photo");

  let pollTimeoutId = null;
  let hasFatalError = false;

  function scheduleNextPoll() {
    if (hasFatalError) {
      return;
    }

    pollTimeoutId = setTimeout(loop, 1000);
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  /**
   * Transforme les erreurs API techniques en message lisible côté joueur.
   */
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

  /**
   * Affiche une erreur bloquante et stoppe toute transition vers les états actifs.
   */
  function showFatalError(message) {
    hasFatalError = true;

    if (pollTimeoutId) {
      clearTimeout(pollTimeoutId);
      pollTimeoutId = null;
    }

    elName.textContent = "Erreur";
    elTimer.textContent = "--:--";
    elStatus.textContent = message;
    elStatus.style.background = "#ef4444";
    elResult.style.display = "none";
  }

  /**
   * Affiche une erreur temporaire tout en laissant le polling se relancer.
   */
  function showTransientError(message) {
    elStatus.textContent = message;
    elStatus.style.background = "#fb923c";
  }

  async function loop() {
    if (hasFatalError) {
      return;
    }

    try {
      const r = await fetch(`./api/status.php?id=${id}&token=${playerToken}&t=${Date.now()}`);

      let data = null;
      try {
        data = await r.json();
      } catch (parseError) {
        if (!r.ok) {
          showTransientError("Service momentanément indisponible.");
          return;
        }

        showTransientError("Réponse serveur temporairement invalide.");
        return;
      }

      if (data && typeof data === "object" && data.error) {
        const readableError = getReadableErrorMessage(data.error);
        showFatalError(readableError);
        return;
      }

      if (!r.ok) {
        showTransientError("Service momentanément indisponible.");
        return;
      }

      if (!data || typeof data !== "object") {
        showTransientError("Réponse serveur temporairement invalide.");
        return;
      }

      const position = data.position ?? 0;
      const queueLength = data.queue_length ?? 1;
      const waitRemaining = data.wait_remaining ?? 0;
      const myRemaining = data.my_remaining ?? 0;
      const canAccess = Boolean(data.can_access);

      elName.textContent = data.nom || `Personnage #${id}`;

      if (!canAccess) {
        elTimer.textContent = fmt(waitRemaining);
        elStatus.textContent = `En attente (position ${position + 1})`;
        elStatus.style.background = "#fbbf24";
        elResult.style.display = "none";
        notified = false;
      } else if (myRemaining > 0) {
        elTimer.textContent = fmt(myRemaining);
        elStatus.textContent = "Temps en cours avec vous";
        elStatus.style.background = "#fbbf24";
        elResult.style.display = "none";
      } else {
        elTimer.textContent = "00:00";
        elStatus.textContent = "Accès autorisé";
        elStatus.style.background = "#4ade80";

        elResult.style.display = "block";
        elMessage.textContent =
          queueLength > 1
            ? "⚠️ Une autre équipe arrive dans quelques secondes"
            : `Vous pouvez parler à ${data.nom} tant qu'aucune autre équipe n'arrive.`;

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
    } catch (e) {
      showTransientError("Connexion temporairement indisponible.");
    } finally {
      scheduleNextPoll();
    }
  }

  loop();
});
