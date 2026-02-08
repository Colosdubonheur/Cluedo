(function () {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const characterNameEl = document.getElementById("characterName");
  const currentEl = document.getElementById("currentTeam");
  const queueEl = document.getElementById("queue");
  const characterPhotoEl = document.getElementById("characterPhoto");
  const characterPhotoInputEl = document.getElementById("characterPhotoInput");
  const characterPhotoButtonEl = document.getElementById("characterPhotoButton");
  const characterLocationInputEl = document.getElementById("characterLocationInput");
  const characterLocationButtonEl = document.getElementById("characterLocationButton");
  const characterLocationFeedbackEl = document.getElementById("characterLocationFeedback");
  const characterMessageEl = document.getElementById("characterSupervisionMessage");

  const messageAudio = new Audio("./assets/message.wav");
  messageAudio.preload = "auto";

  let currentPhoto = "";
  let lastKnownServerLocation = "";
  let hasUnsavedLocationChanges = false;
  let lastPlayedMessageKey = "";

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

  async function playMessageSoundIfNeeded(message) {
    const text = String(message?.text || "").trim();
    if (!text) return;
    const createdAt = Number(message?.created_at || 0);
    const key = `${text}::${createdAt}`;
    if (key === lastPlayedMessageKey) return;
    lastPlayedMessageKey = key;
    messageAudio.currentTime = 0;
    try { await messageAudio.play(); } catch (_error) { /* noop */ }
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


  function setCharacterMessage(message) {
    if (!characterMessageEl) return;
    const text = (message?.text || "").trim();
    if (!text) {
      characterMessageEl.textContent = "Aucun message pour le moment.";
      characterMessageEl.classList.remove("is-active");
      return;
    }

    characterMessageEl.textContent = text;
    characterMessageEl.classList.add("is-active");
    void playMessageSoundIfNeeded(message);
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
    setCharacterMessage(payload.message || null);
    characterNameEl.innerHTML = `Personnage : <strong>${character.nom || "(sans nom)"}</strong> (#${character.id})`;

    currentPhoto = character.photo || "";
    setPhotoPreview(currentPhoto);

    lastKnownServerLocation = character.location || "";
    if (characterLocationInputEl) {
      if (!hasUnsavedLocationChanges) {
        characterLocationInputEl.value = lastKnownServerLocation;
      }
    }

    const activeTeam = payload.current || payload.active || payload.active_team || null;
    const waitingQueue = Array.isArray(payload.queue)
      ? payload.queue
      : (Array.isArray(payload.waiting_queue) ? payload.waiting_queue : []);

    if (!activeTeam) {
      currentEl.innerHTML = "<h3>Équipe active</h3><p>Aucune équipe active.</p>";
    } else {
      const activeTeamName = activeTeam.team || activeTeam.name || activeTeam.nom || "(sans nom)";
      const activeState = activeTeam.state || "active";
      currentEl.innerHTML = `
        <h3>Équipe active</h3>
        <p><strong>${activeTeamName}</strong></p>
        <p>État : <strong>${activeState}</strong></p>
        <p>Temps restant : ${fmt(activeTeam.remaining_seconds)}</p>
        <p class="character-active-team-actions">
          <button id="plus30">+30s</button>
          <button id="minus30">-30s</button>
          <button id="eject">Fin de rencontre</button>
        </p>
      `;
      document.getElementById("plus30").onclick = () => control("plus_30");
      document.getElementById("minus30").onclick = () => control("minus_30");
      document.getElementById("eject").onclick = () => control("eject");
    }

    if (!waitingQueue.length) {
      queueEl.innerHTML = "<h3>Interrogatoires en attente</h3><p>Aucun interrogatoire en attente.</p>";
      return;
    }

    queueEl.innerHTML = `<h3>Interrogatoires en attente</h3><ol class="character-queue-list">${waitingQueue
      .map((team, index) => {
        const position = Number.isFinite(Number(team.position)) ? Number(team.position) : index + 1;
        const teamName = team.team || team.name || team.nom || "(sans nom)";
        const state = team.state || "waiting";
        return `<li><span class="character-queue-team">${position}. ${teamName}</span> <span class="character-queue-meta">${state} · ${fmt(team.estimated_seconds)}</span></li>`;
      })
      .join("")}</ol>`;
  }

  characterPhotoButtonEl.addEventListener("click", () => {
    characterPhotoInputEl.click();
  });

  characterPhotoInputEl.addEventListener("change", uploadCharacterPhoto);

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

  refresh();
  setInterval(refresh, 2000);
})();
