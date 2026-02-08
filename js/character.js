(function () {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const characterNameEl = document.getElementById("characterName");
  const currentEl = document.getElementById("currentTeam");
  const queueEl = document.getElementById("queue");
  const characterPhotoEl = document.getElementById("characterPhoto");
  const characterPhotoInputEl = document.getElementById("characterPhotoInput");
  const characterPhotoButtonEl = document.getElementById("characterPhotoButton");

  let currentPhoto = "";

  if (!id) {
    characterNameEl.textContent = "Paramètre id manquant.";
    return;
  }

  function fmt(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return `${m}:${r}`;
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

  async function control(action) {
    await fetch("./api/character_control.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    refresh();
  }

  async function refresh() {
    const response = await fetch(`./api/character_status.php?id=${encodeURIComponent(id)}&t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      characterNameEl.textContent = "Erreur de chargement.";
      return;
    }

    const character = payload.character;
    characterNameEl.innerHTML = `Personnage : <strong>${character.nom || "(sans nom)"}</strong> (#${character.id})`;

    currentPhoto = character.photo || "";
    setPhotoPreview(currentPhoto);

    const activeTeam = payload.current || payload.active || payload.active_team || null;
    const waitingQueue = Array.isArray(payload.queue)
      ? payload.queue
      : (Array.isArray(payload.waiting_queue) ? payload.waiting_queue : []);

    if (!activeTeam) {
      currentEl.innerHTML = "<h3>Équipe en cours</h3><p>Aucune équipe active.</p>";
    } else {
      const activeTeamName = activeTeam.team || activeTeam.name || activeTeam.nom || "(sans nom)";
      const activeState = activeTeam.state || "active";
      currentEl.innerHTML = `
        <h3>Équipe en cours</h3>
        <p><strong>${activeTeamName}</strong></p>
        <p>État : <strong>${activeState}</strong></p>
        <p>Temps restant : ${fmt(activeTeam.remaining_seconds)}</p>
        <p>
          <button id="plus30">+30s</button>
          <button id="minus30">-30s</button>
          <button id="eject">Éjecter</button>
        </p>
      `;
      document.getElementById("plus30").onclick = () => control("plus_30");
      document.getElementById("minus30").onclick = () => control("minus_30");
      document.getElementById("eject").onclick = () => control("eject");
    }

    if (!waitingQueue.length) {
      queueEl.innerHTML = "<h3>File d'attente</h3><p>Personne en attente.</p>";
      return;
    }

    queueEl.innerHTML = `<h3>File d'attente</h3>${waitingQueue
      .map((team, index) => {
        const position = Number.isFinite(Number(team.position)) ? Number(team.position) : index + 1;
        const teamName = team.team || team.name || team.nom || "(sans nom)";
        const state = team.state || "waiting";
        return `<div>${position}. ${teamName} — ${state} (${fmt(team.estimated_seconds)})</div>`;
      })
      .join("")}`;
  }

  characterPhotoButtonEl.addEventListener("click", () => {
    characterPhotoInputEl.click();
  });

  characterPhotoInputEl.addEventListener("change", uploadCharacterPhoto);

  refresh();
  setInterval(refresh, 2000);
})();
