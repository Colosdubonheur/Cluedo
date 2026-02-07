document.addEventListener("DOMContentLoaded", async () => {
    const TOKEN_KEY = "cluedo_player_token";

let playerToken = sessionStorage.getItem(TOKEN_KEY);
if (!playerToken) {
  playerToken = crypto.randomUUID();
  sessionStorage.setItem(TOKEN_KEY, playerToken);
}

  let unlocked = false;
  let notified = false;
const audio = new Audio("./assets/ding.mp3");
  audio.preload = "auto";
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

        <div style="margin-top:10px;color:#aaa;font-size:14px">
        </div>

        <div id="result" style="display:none;margin-top:16px">
          <div id="message" style="font-size:22px;font-weight:bold;margin-bottom:10px"></div>
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
  audio.play().catch(()=>{});
  unlock.remove();
};

document.body.appendChild(unlock);


  const elName = document.getElementById("name");
  const elTimer = document.getElementById("timer");
  const elStatus = document.getElementById("status");
  const elResult = document.getElementById("result");
  const elMessage = document.getElementById("message");
  const elPhoto = document.getElementById("photo");

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  let granted = false;

  async function loop() {
    try {
const r = await fetch(
  `./api/status.php?id=${id}&token=${playerToken}&t=${Date.now()}`
);

      const data = await r.json();
      const position = data.position ?? 0;
const queueLength = data.queue_length ?? 1;
const waitRemaining = data.wait_remaining ?? 0;


      elName.textContent = data.nom || `Personnage #${id}`;

      const teamElapsed = (Date.now() - startTeam) / 1000;
      elElapsed.textContent = `Écoulé équipe : ${fmt(teamElapsed)}`;

      if (data.last_access_at && data.last_access_at > 0) {
        elCooldown.textContent = `Dernier accès : il y a ${fmt(data.since_last_access)}`;
      } else {
        elCooldown.textContent = "Dernier accès : jamais";
      }

     if (waitRemaining > 0) {
  elTimer.textContent = fmt(waitRemaining);

  if (position === 0) {
    elStatus.textContent = "Temps en cours avec vous";
  } else {
    elStatus.textContent = `En attente (position ${position + 1})`;
  }

  elStatus.style.background = "#fbbf24";
  elResult.style.display = "none";

} else {
  elTimer.textContent = "00:00";

  if (position === 0) {
    elStatus.textContent = "Temps écoulé";
    elStatus.style.background = "#f97316"; // orange

    elResult.style.display = "block";
    elMessage.textContent =
      queueLength > 1
        ? "⚠️ Une autre équipe arrive dans quelques secondes"
        : `Votre temps est terminé, vous pouvez continuer avec ${data.nom} jusqu'à l'arrivée de l'équipe suivante ou partir quand vous souhaitez.`;

    if (data.photo) elPhoto.src = data.photo;

  } else {
    elStatus.textContent = "Accès autorisé";
    elStatus.style.background = "#4ade80";
    elResult.style.display = "none";
  }
}



      }
    } catch (e) {
      elName.textContent = "Erreur serveur";
    }

    setTimeout(loop, 1000);
  }

  loop();
});