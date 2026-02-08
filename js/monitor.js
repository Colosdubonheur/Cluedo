(function () {
  const listEl = document.getElementById("teams");
  const resetBtn = document.getElementById("reset-history");
  const toggleEndGameBtn = document.getElementById("toggle-end-game");
  const endGameStatusEl = document.getElementById("monitor-end-game-status");

  const teamMessageTargetEl = document.getElementById("team-message-target");
  const teamMessageInputEl = document.getElementById("team-message-text");
  const sendTeamMessageBtn = document.getElementById("send-team-message");
  const teamMessageFeedbackEl = document.getElementById("team-message-feedback");

  const characterMessageTargetEl = document.getElementById("character-message-target");
  const characterMessageInputEl = document.getElementById("character-message-text");
  const sendCharacterMessageBtn = document.getElementById("send-character-message");
  const characterMessageFeedbackEl = document.getElementById("character-message-feedback");

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function statusLabel(team) {
    if (team.state === "active") {
      const characterName = team.current_personnage?.nom || "Personnage";
      return {
        css: "is-active",
        text: `active · avec ${characterName}`,
      };
    }

    if (team.state === "waiting") {
      return {
        css: "is-waiting",
        text: "waiting · en attente",
      };
    }

    return {
      css: "is-free",
      text: "free · libre",
    };
  }

  function renderPlayers(team) {
    const players = Array.isArray(team.players) ? team.players.filter((name) => String(name || "").trim() !== "") : [];
    if (!players.length) {
      return '<p class="monitor-muted">Prénoms non renseignés.</p>';
    }

    return `<p class="monitor-players">${players.map((name) => escapeHtml(name)).join(" · ")}</p>`;
  }

  function renderHistory(team) {
    const seen = Array.isArray(team.encountered_personnages) ? team.encountered_personnages.slice(0, 8) : [];
    if (!seen.length) {
      return '<p class="monitor-muted">Aucune rencontre historisée.</p>';
    }

    return `<ul class="monitor-history-list">${seen
      .map((entry) => `<li>${escapeHtml(entry.nom || "Personnage")}</li>`)
      .join("")}</ul>`;
  }

  function renderMessageSummary(team) {
    if (!team.message?.text) {
      return '<p class="monitor-muted">Aucun message en cours.</p>';
    }

    const source = team.message.scope === "team" ? "Message individuel" : "Message global";
    return `<div class="monitor-card-message"><strong>${source}</strong><p>${escapeHtml(team.message.text)}</p></div>`;
  }

  function renderCard(team) {
    const status = statusLabel(team);
    const photoHtml = team.photo
      ? `<img src="${escapeHtml(team.photo)}" alt="Photo ${escapeHtml(team.team_name || "équipe")}" class="monitor-team-photo"/>`
      : '<div class="monitor-team-photo monitor-team-photo-placeholder" aria-hidden="true"></div>';

    return `<article class="card monitor-team-card">
      <header class="monitor-team-header">
        ${photoHtml}
        <div>
          <h3 class="monitor-team-name">${escapeHtml(team.team_name || "Équipe sans nom")}</h3>
          <span class="monitor-status ${status.css}">${escapeHtml(status.text)}</span>
        </div>
      </header>
      <section>
        <h4>Membres</h4>
        ${renderPlayers(team)}
      </section>
      <section>
        <h4>Historique simplifié</h4>
        ${renderHistory(team)}
      </section>
      <section>
        <h4>Dernier message visible côté équipe</h4>
        ${renderMessageSummary(team)}
      </section>
    </article>`;
  }

  function fillMessageTargets(teams, characters) {
    const previousTeamTarget = teamMessageTargetEl.value;
    const previousCharacterTarget = characterMessageTargetEl.value;

    const teamOptions = [
      '<option value="all">🌐 Toutes les équipes (global)</option>',
      ...teams.map((team) => `<option value="team:${escapeHtml(team.token)}">👥 ${escapeHtml(team.team_name || "Équipe sans nom")}</option>`),
    ];

    const characterOptions = characters.length
      ? characters.map((character) => `<option value="character:${escapeHtml(character.id)}">🎭 ${escapeHtml(character.id)} - ${escapeHtml(character.nom || "Personnage")}</option>`)
      : ['<option value="">Aucun personnage actif</option>'];

    teamMessageTargetEl.innerHTML = teamOptions.join("");
    characterMessageTargetEl.innerHTML = characterOptions.join("");

    const teamStillExists = teamOptions.some((option) => option.includes(`value="${escapeHtml(previousTeamTarget)}"`));
    teamMessageTargetEl.value = teamStillExists ? previousTeamTarget : "all";

    const characterStillExists = characterOptions.some((option) => option.includes(`value="${escapeHtml(previousCharacterTarget)}"`));
    characterMessageTargetEl.value = characterStillExists ? previousCharacterTarget : (characterOptions[0].includes('value=""') ? "" : characterMessageTargetEl.value);

    const hasCharacterTarget = !!characterMessageTargetEl.value;
    characterMessageTargetEl.disabled = !hasCharacterTarget;
    sendCharacterMessageBtn.disabled = !hasCharacterTarget;
    if (!hasCharacterTarget) {
      characterMessageFeedbackEl.textContent = "Aucun personnage actif disponible pour la messagerie.";
    }
  }

  async function sendMessage({ channel, target, text, feedbackEl, buttonEl, successText }) {
    if (!text) {
      feedbackEl.textContent = "Veuillez saisir un message avant l'envoi.";
      return;
    }

    if (!target) {
      feedbackEl.textContent = "Veuillez sélectionner un destinataire valide.";
      return;
    }

    buttonEl.disabled = true;

    const body = new URLSearchParams({
      action: "send_message",
      channel,
      target,
      message: text,
    });

    const response = await fetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });

    const payload = await response.json().catch(() => ({}));
    buttonEl.disabled = false;

    if (!response.ok || !payload.ok) {
      feedbackEl.textContent = payload.error || "Échec d'envoi du message.";
      return;
    }

    feedbackEl.textContent = successText;
    await refresh();
  }


  function renderEndGameControls(gameState) {
    const isActive = !!gameState?.end_game_active;
    toggleEndGameBtn.textContent = isActive ? "Annuler la fin de jeu" : "Fin de jeu";
    toggleEndGameBtn.classList.toggle("is-active", isActive);
    endGameStatusEl.textContent = isActive
      ? "🔴 Fin de jeu active : aucune nouvelle entrée en file."
      : "🟢 Fin de jeu inactive : fonctionnement normal des files.";
  }

  async function setEndGame(active) {
    const prompt = active
      ? "Confirmer l'activation de la fin de jeu ? Les équipes en cours continuent, mais aucune nouvelle entrée en file ne sera autorisée."
      : "Confirmer l'annulation de la fin de jeu ?";

    if (!window.confirm(prompt)) {
      return;
    }

    toggleEndGameBtn.disabled = true;
    const body = new URLSearchParams({
      action: "set_end_game",
      active: active ? "1" : "0",
    });

    const response = await fetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });

    const payload = await response.json().catch(() => ({}));
    toggleEndGameBtn.disabled = false;

    if (!response.ok || !payload.ok) {
      window.alert(payload.error || "Impossible de mettre à jour la fin de jeu.");
      return;
    }

    renderEndGameControls(payload.game_state || {});
    await refresh();
  }
  async function refresh() {
    const response = await fetch(`./api/supervision.php?t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      listEl.textContent = "Erreur de chargement.";
      return;
    }

    fillMessageTargets(payload.teams || [], Array.isArray(payload.characters) ? payload.characters : []);
    renderEndGameControls(payload.game_state || {});

    if (!payload.teams.length) {
      listEl.textContent = "Aucune équipe connue.";
      return;
    }

    listEl.innerHTML = payload.teams.map(renderCard).join("");
  }

  resetBtn.addEventListener("click", async () => {
    if (!window.confirm("Remettre tout l'historique à zéro ?")) {
      return;
    }

    resetBtn.disabled = true;
    const body = new URLSearchParams({ action: "reset_history" });

    const response = await fetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });

    const payload = await response.json().catch(() => ({}));
    resetBtn.disabled = false;

    if (!response.ok || !payload.ok) {
      window.alert("Échec de la remise à zéro.");
      return;
    }

    await refresh();
  });

  toggleEndGameBtn.addEventListener("click", async () => {
    const active = !(toggleEndGameBtn.classList.contains("is-active"));
    await setEndGame(active);
  });

  sendTeamMessageBtn.addEventListener("click", async () => {
    const target = teamMessageTargetEl.value || "all";
    const text = (teamMessageInputEl.value || "").trim();

    await sendMessage({
      channel: "team",
      target,
      text,
      feedbackEl: teamMessageFeedbackEl,
      buttonEl: sendTeamMessageBtn,
      successText: target === "all" ? "Message global envoyé à toutes les équipes." : "Message envoyé à l'équipe ciblée.",
    });

    if (text) {
      teamMessageInputEl.value = "";
    }
  });

  sendCharacterMessageBtn.addEventListener("click", async () => {
    const target = characterMessageTargetEl.value || "";
    const text = (characterMessageInputEl.value || "").trim();

    await sendMessage({
      channel: "character",
      target,
      text,
      feedbackEl: characterMessageFeedbackEl,
      buttonEl: sendCharacterMessageBtn,
      successText: "Message envoyé au personnage ciblé.",
    });

    if (text) {
      characterMessageInputEl.value = "";
    }
  });

  refresh();
  setInterval(refresh, 3000);
})();
