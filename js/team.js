document.addEventListener("DOMContentLoaded", () => {
  const TOKEN_KEY = "cluedo_player_token";
  const TEAM_KEY = "cluedo_team_name";

  let token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
  }
  localStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_KEY, token);

  const displayNameEl = document.getElementById("team-display-name");
  const editNameBtn = document.getElementById("team-edit-name-btn");
  const profileForm = document.getElementById("team-profile-form");
  const teamNameInput = document.getElementById("team-name");
  const feedbackName = document.getElementById("team-name-feedback");
  const playersWrap = document.getElementById("team-players");
  const savePlayersBtn = document.getElementById("save-players");
  const photoEl = document.getElementById("team-photo");
  const photoInput = document.getElementById("team-photo-input");
  const qrFeedback = document.getElementById("team-qr-feedback");
  const qrReader = document.getElementById("team-qr-reader");
  const qrStartBtn = document.getElementById("team-qr-start");
  const qrStopBtn = document.getElementById("team-qr-stop");
  const participantsGuidanceEl = document.getElementById("team-guidance-participants");
  const photoGuidanceEl = document.getElementById("team-guidance-photo");
  const historyEl = document.getElementById("team-history");
  const globalEl = document.getElementById("team-global");

  let latestState = null;
  let previousTeamState = "free";
  let qrScanner = null;
  let qrLastValue = "";
  let qrIsProcessingScan = false;
  let qrIsRunning = false;

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

  function refreshTeamNameUi(name) {
    const resolved = String(name || "").trim() || "Équipe sans nom";
    displayNameEl.textContent = resolved;
    teamNameInput.value = String(name || "").trim();
  }

  function setQrFeedback(message, status = "neutral") {
    qrFeedback.textContent = message;
    qrReader.classList.remove("is-success", "is-error", "is-processing");
    if (status === "success") qrReader.classList.add("is-success");
    if (status === "error") qrReader.classList.add("is-error");
    if (status === "processing") qrReader.classList.add("is-processing");
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

    if (resolvedName) {
      localStorage.setItem(TEAM_KEY, resolvedName);
    }

    refreshTeamNameUi(resolvedName);

    playersWrap.innerHTML = "";
    const players = Array.isArray(profile.players) ? profile.players : [];
    const filledPlayersCount = players.filter((name) => String(name || "").trim()).length;
    for (let i = 0; i < 10; i += 1) {
      const row = document.createElement("div");
      row.className = "team-inline";
      row.innerHTML = `<label class="admin-label" for="player-${i + 1}">Joueur ${i + 1}</label><input id="player-${i + 1}" class="admin-input" maxlength="80" value="${escapeHtml(players[i] || "")}"/>`;
      playersWrap.appendChild(row);
    }

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

    const global = Array.isArray(payload.global) ? payload.global : [];
    globalEl.innerHTML = global.length
      ? `<ul>${global
        .map((entry) => `<li><strong>${escapeHtml(entry.nom || `Personnage ${entry.id}`)}</strong> — état : ${escapeHtml(entry.active_team_name ? "actif" : "attente")}, attente moyenne : ${fmt(entry.estimated_wait_seconds)}, équipes en attente : ${Number(entry.waiting_count) || 0}</li>`)
        .join("")}</ul>`
      : "Aucun personnage chargé.";

    maybePromptCloseOnFree(payload.team?.state?.state || "free");
  }

  async function saveProfile(extra = {}) {
    const players = Array.from(playersWrap.querySelectorAll("input"))
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

    localStorage.setItem(TEAM_KEY, trimmed);
    await saveProfile({ team_name: trimmed });

    const state = latestState?.team?.state;
    if (!state?.character_id) {
      feedbackName.textContent = "Nom sauvegardé.";
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

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      feedbackName.textContent = "Nom local sauvegardé, mais renommage serveur non appliqué.";
      refreshTeamNameUi(trimmed);
      return;
    }

    feedbackName.textContent = "Nom d'équipe mis à jour.";
    refreshTeamNameUi(trimmed);
  }

  function parseCharacterIdFromQr(text) {
    const raw = String(text || "").trim();
    if (!raw) {
      return null;
    }

    try {
      const parsed = new URL(raw, window.location.href);
      const id = parsed.searchParams.get("id");
      if (!id) {
        return null;
      }
      const normalizedId = String(id).replace(/[^0-9]/g, "");
      return normalizedId || null;
    } catch (error) {
      const match = raw.match(/[?&]id=(\d+)/i);
      return match ? match[1] : null;
    }
  }

  async function tryJoinCharacter(id) {
    const teamName = profileTeamName();
    const query = new URLSearchParams({
      id,
      token,
      team_name: teamName,
      join: "1",
      t: String(Date.now()),
    });

    let response = await fetch(`./api/status.php?${query.toString()}`);
    let payload = await response.json();

    if (payload.state === "already_in_queue" && payload.can_join_after_confirm) {
      const current = payload.current_engagement || {};
      const ok = window.confirm(`Votre équipe est déjà ${current.state === "active" ? "active" : "en attente"} chez ${current.personnage_nom || "un personnage"}.\nVoulez-vous perdre votre place et rejoindre la nouvelle file ?`);
      if (!ok) {
        qrFeedback.textContent = "Changement de file annulé.";
        return;
      }

      query.set("force_switch", "1");
      response = await fetch(`./api/status.php?${query.toString()}`);
      payload = await response.json();
    }

    if (!response.ok || payload.error) {
      const isUnavailable = String(payload.error || "").toLowerCase().includes("character unavailable");
      qrFeedback.textContent = isUnavailable
        ? "Personnage indisponible."
        : "Impossible de rejoindre cette file.";
      return;
    }

    qrFeedback.textContent = `Demande envoyée pour ${payload.personnage?.nom || `personnage ${id}`}.`;
    await loadHub();
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
  }

  async function initQrScanner() {
    if (!window.Html5QrcodeScanner) {
      setQrFeedback("Scanner QR indisponible sur cet appareil.", "error");
      return;
    }

    qrScanner = new window.Html5QrcodeScanner(
      "team-qr-reader",
      {
        fps: 10,
        qrbox: 220,
        rememberLastUsedCamera: true,
        supportedScanTypes: [window.Html5QrcodeScanType?.SCAN_TYPE_CAMERA].filter(Boolean),
      },
      false
    );

    const safeClearQrReader = () => {
      const root = document.getElementById("team-qr-reader");
      if (!root) return;
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }
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
          setQrFeedback("QR invalide : lien personnage introuvable.", "error");
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

    const onScanError = () => {};

    const restoreQrActionButtons = () => {
      qrStartBtn.disabled = false;
      qrStopBtn.disabled = !qrIsRunning;
    };

    const patchLibraryLabelsToFrench = () => {
      const region = document.getElementById("team-qr-reader");
      if (!region) return;

      const spanNodes = region.querySelectorAll("span");
      for (const node of spanNodes) {
        const text = (node.textContent || "").trim();
        if (!text) continue;
        if (text === "Request Camera Permissions") node.textContent = "Autoriser la caméra";
        if (text === "Scan an Image File") node.textContent = "Scanner une image";
        if (text === "Stop Scanning") node.textContent = "Arrêter le scan";
        if (text === "Start Scanning") node.textContent = "Démarrer le scan";
      }

      const buttonNodes = region.querySelectorAll("button");
      for (const btn of buttonNodes) {
        const text = (btn.textContent || "").trim();
        if (text === "Request Camera Permissions") btn.textContent = "Autoriser la caméra";
        if (text === "Stop Scanning") btn.textContent = "Arrêter le scan";
        if (text === "Start Scanning") btn.textContent = "Démarrer le scan";
      }
    };

    const startQrScanner = async () => {
      if (!qrScanner || qrIsRunning) return;
      qrStartBtn.disabled = true;
      setQrFeedback("Ouverture de la caméra…", "processing");
      try {
        qrScanner.render(onScanSuccess, onScanError);
        qrIsRunning = true;
        setQrFeedback("Caméra active. Placez le QR code dans le cadre.", "neutral");
        setTimeout(patchLibraryLabelsToFrench, 120);
      } catch (_error) {
        safeClearQrReader();
        setQrFeedback("Impossible de démarrer la caméra. Vérifiez les autorisations.", "error");
      } finally {
        restoreQrActionButtons();
      }
    };

    const stopQrScanner = async () => {
      if (!qrScanner || !qrIsRunning) return;
      qrStopBtn.disabled = true;
      setQrFeedback("Caméra arrêtée.", "neutral");
      try {
        await qrScanner.clear();
      } catch (_error) {
        safeClearQrReader();
      } finally {
        qrIsRunning = false;
        qrLastValue = "";
        qrIsProcessingScan = false;
        restoreQrActionButtons();
      }
    };

    qrStartBtn.addEventListener("click", () => {
      startQrScanner().catch(() => {
        setQrFeedback("Impossible de démarrer la caméra. Vérifiez les autorisations.", "error");
        restoreQrActionButtons();
      });
    });

    qrStopBtn.addEventListener("click", () => {
      stopQrScanner().catch(() => {
        setQrFeedback("Arrêt du scan incomplet.", "error");
        restoreQrActionButtons();
      });
    });

    restoreQrActionButtons();
    setQrFeedback("Appuyez sur « Scanner un QR code » pour lancer la caméra.", "neutral");
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

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    feedbackName.textContent = "";
    try {
      await renameTeam(teamNameInput.value);
      await loadHub();
    } catch (_error) {
      feedbackName.textContent = "Impossible de sauvegarder le nom.";
    }
  });

  editNameBtn.addEventListener("click", () => {
    const current = profileTeamName();
    const prompted = window.prompt("Nom de l'équipe", current);
    if (prompted === null) return;
    teamNameInput.value = prompted;
    profileForm.requestSubmit();
  });

  savePlayersBtn.addEventListener("click", async () => {
    try {
      await saveProfile();
      feedbackName.textContent = "Participants sauvegardés.";
      await loadHub();
    } catch (_error) {
      feedbackName.textContent = "Impossible de sauvegarder les joueurs.";
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

  loadHub().catch(() => {
    historyEl.textContent = "Erreur de chargement.";
    globalEl.textContent = "Erreur de chargement.";
  });
  initAccordion();
  initQrScanner();
  setInterval(() => {
    loadHub().catch(() => {});
  }, 2000);
});
