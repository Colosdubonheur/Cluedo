document.addEventListener("DOMContentLoaded", () => {
  const TOKEN_KEY = "cluedo_player_token";
  const TEAM_KEY = "cluedo_team_name";

  let token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
  }
  localStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_KEY, token);

  const tokenEl = document.getElementById("team-token");
  const profileForm = document.getElementById("team-profile-form");
  const teamNameInput = document.getElementById("team-name");
  const feedbackName = document.getElementById("team-name-feedback");
  const playersWrap = document.getElementById("team-players");
  const savePlayersBtn = document.getElementById("save-players");
  const photoEl = document.getElementById("team-photo");
  const photoInput = document.getElementById("team-photo-input");
  const qrFeedback = document.getElementById("team-qr-feedback");
  const historyEl = document.getElementById("team-history");
  const globalEl = document.getElementById("team-global");

  let latestState = null;

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

  async function loadHub() {
    const response = await fetch(`./api/team_hub.php?token=${encodeURIComponent(token)}&t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "hub unavailable");
    }

    latestState = payload;
    tokenEl.textContent = `Token équipe (identifiant stable) : ${token}`;

    const profile = payload.team?.profile || {};
    const profileName = (profile.team_name || "").trim();
    const storedName = (localStorage.getItem(TEAM_KEY) || "").trim();
    const resolvedName = profileName || storedName;
    teamNameInput.value = resolvedName;
    if (resolvedName) {
      localStorage.setItem(TEAM_KEY, resolvedName);
    }

    playersWrap.innerHTML = "";
    const players = Array.isArray(profile.players) ? profile.players : [];
    for (let i = 0; i < 10; i += 1) {
      const row = document.createElement("div");
      row.className = "team-inline";
      row.innerHTML = `<label class="admin-label" for="player-${i + 1}">Joueur ${i + 1}</label><input id="player-${i + 1}" class="admin-input" maxlength="80" value="${escapeHtml(players[i] || "")}"/>`;
      playersWrap.appendChild(row);
    }

    if (profile.photo) {
      photoEl.src = profile.photo;
      photoEl.style.display = "block";
    } else {
      photoEl.removeAttribute("src");
      photoEl.style.display = "none";
    }

    const history = Array.isArray(payload.team?.history) ? payload.team.history : [];
    historyEl.innerHTML = history.length
      ? `<ul>${history.map((entry) => `<li>${escapeHtml(entry.nom || "Personnage")} : <strong>${fmt(entry.duration_seconds)}</strong></li>`).join("")}</ul>`
      : "Aucun passage enregistré pour l'instant.";

    const global = Array.isArray(payload.global) ? payload.global : [];
    globalEl.innerHTML = global.length
      ? `<ul>${global
        .map((entry) => `<li><strong>${escapeHtml(entry.nom || `Personnage ${entry.id}`)}</strong> — actif : ${escapeHtml(entry.active_team_name || "-" )}, attente : ${Number(entry.waiting_count) || 0}, attente estimée : ${fmt(entry.estimated_wait_seconds)}</li>`)
        .join("")}</ul>`
      : "Aucun personnage chargé.";
  }

  async function saveProfile(extra = {}) {
    const players = Array.from(playersWrap.querySelectorAll("input")).slice(0, 10).map((input) => input.value.trim());

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
      feedbackName.textContent = "Nom sauvegardé. Il sera utilisé lors de votre prochaine entrée en file.";
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
      feedbackName.textContent = "Nom local sauvegardé, mais renommage serveur non appliqué (équipe non présente en file).";
      return;
    }

    feedbackName.textContent = "Nom d'équipe mis à jour.";
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
      qrFeedback.textContent = "Impossible de rejoindre cette file.";
      return;
    }

    qrFeedback.textContent = `Demande envoyée pour ${payload.personnage?.nom || `personnage ${id}`}.`;
    await loadHub();
  }


  function initAccordion() {
    const items = Array.from(document.querySelectorAll("[data-accordion-item]"));
    const triggers = Array.from(document.querySelectorAll("[data-accordion-trigger]"));

    if (!items.length || !triggers.length) {
      return;
    }

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
        if (!item) {
          return;
        }
        const isCurrentlyOpen = item.classList.contains("is-open");
        if (isCurrentlyOpen) {
          return;
        }
        openItem(item);
      });
    }

    const defaultOpen = items.find((item) => item.classList.contains("is-open")) || items[0];
    openItem(defaultOpen);
  }

  async function initQrScanner() {
    if (!window.Html5QrcodeScanner) {
      qrFeedback.textContent = "Scanner QR indisponible sur cet appareil.";
      return;
    }

    const scanner = new window.Html5QrcodeScanner("team-qr-reader", { fps: 10, qrbox: 220 }, false);
    let lastValue = "";
    let isProcessingScan = false;

    scanner.render(async (decodedText) => {
      if (!decodedText || decodedText === lastValue || isProcessingScan) {
        return;
      }

      isProcessingScan = true;
      lastValue = decodedText;

      try {
        const id = parseCharacterIdFromQr(decodedText);
        if (!id) {
          qrFeedback.textContent = "QR invalide : URL attendue play.html?id=X introuvable.";
          return;
        }

        qrFeedback.textContent = `QR détecté (${id})… tentative d'entrée dans la file en cours.`;
        await tryJoinCharacter(id);
      } finally {
        setTimeout(() => {
          lastValue = "";
          isProcessingScan = false;
        }, 1500);
      }
    }, () => {});
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    feedbackName.textContent = "";
    try {
      await renameTeam(teamNameInput.value);
      await loadHub();
    } catch (error) {
      feedbackName.textContent = "Impossible de sauvegarder le nom.";
    }
  });

  savePlayersBtn.addEventListener("click", async () => {
    try {
      await saveProfile();
      feedbackName.textContent = "Informations joueurs sauvegardées.";
      await loadHub();
    } catch (error) {
      feedbackName.textContent = "Impossible de sauvegarder les joueurs.";
    }
  });

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("token", token);
    formData.append("file", file);

    const response = await fetch("./api/upload_team_photo.php", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      window.alert(payload.error || "Échec upload photo d'équipe");
      return;
    }

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
