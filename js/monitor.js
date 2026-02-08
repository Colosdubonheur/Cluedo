(function () {
  const listEl = document.getElementById("teams");
  const resetBtn = document.getElementById("reset-history");

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

  function formatTime(ts) {
    const date = new Date((Number(ts) || 0) * 1000);
    if (Number.isNaN(date.getTime())) return "--:--:--";
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function statusInfo(team) {
    if (team.state === "active") {
      return { css: "is-with-character", text: "Avec personnage", characterName: team.current_personnage?.nom || "" };
    }
    if (team.state === "waiting") {
      return { css: "is-waiting", text: "En attente", characterName: team.waiting_queue?.nom || "" };
    }
    return { css: "is-free", text: "Équipe libre", characterName: "" };
  }

  function renderPlayers(team) {
    const players = Array.isArray(team.players) ? team.players.filter((name) => String(name || "").trim() !== "") : [];
    return players.length
      ? `<p class="monitor-players">${players.map((name) => escapeHtml(name)).join(" · ")}</p>`
      : '<p class="monitor-muted">Membres non renseignés.</p>';
  }

  function renderHistory(team) {
    const rows = Array.isArray(team.history) ? team.history.slice().reverse().slice(0, 8) : [];
    if (!rows.length) {
      return '<p class="monitor-muted">Aucun passage enregistré.</p>';
    }

    return `<ul class="monitor-history-list">${rows
      .map((entry) => {
        const charName = escapeHtml(entry?.personnage?.nom || "Personnage");
        const start = formatTime(entry?.started_at || 0);
        const duration = Math.max(0, Number(entry?.duration_seconds || 0));
        return `<li><span>${charName}</span><span>Début ${start}</span><span>${duration}s</span></li>`;
      })
      .join("")}</ul>`;
  }

  function renderMessageSummary(team) {
    const text = String(team.message?.text || "").trim();
    if (!text) {
      return '<p class="monitor-muted">Aucun message reçu.</p>';
    }

    return `<div class="monitor-card-message"><p>${escapeHtml(text)}</p></div>`;
  }

  function renderCard(team) {
    const status = statusInfo(team);
    const photoHtml = team.photo
      ? `<img src="${escapeHtml(team.photo)}" alt="Photo ${escapeHtml(team.team_name || "équipe")}" class="monitor-team-photo"/>`
      : '<div class="monitor-team-photo monitor-team-photo-placeholder" aria-hidden="true"></div>';

    return `<article class="card monitor-team-card">
      <header class="monitor-team-header">
        ${photoHtml}
        <div class="monitor-team-header-meta">
          <h3 class="monitor-team-name">${escapeHtml(team.team_name || "Équipe sans nom")}</h3>
          <span class="monitor-status ${status.css}">${escapeHtml(status.text)}</span>
          ${status.characterName ? `<p class="monitor-character-context">${escapeHtml(status.characterName)}</p>` : ""}
        </div>
      </header>
      <section>
        <h4>Dernier message reçu</h4>
        ${renderMessageSummary(team)}
      </section>
      <section>
        <h4>Historique des passages</h4>
        ${renderHistory(team)}
      </section>
      <section>
        <h4>Membres de l'équipe</h4>
        ${renderPlayers(team)}
      </section>
    </article>`;
  }

  function getSelectedValues(selectEl) {
    return Array.from(selectEl.selectedOptions || [])
      .map((option) => option.value)
      .filter((value) => String(value || "").trim() !== "");
  }

  function setSelection(selectEl, values, fallback) {
    const wanted = new Set(values || []);
    let matched = 0;
    Array.from(selectEl.options).forEach((option) => {
      option.selected = wanted.has(option.value);
      if (option.selected) matched += 1;
    });

    if (matched > 0 || !fallback) return;
    Array.from(selectEl.options).forEach((option) => {
      option.selected = option.value === fallback;
    });
  }

  function fillMessageTargets(teams, characters) {
    const previousTeamTargets = getSelectedValues(teamMessageTargetEl);
    const previousCharacterTargets = getSelectedValues(characterMessageTargetEl);

    const teamOptions = [
      '<option value="teams_and_characters:all">🌐 Tout le monde (équipes + personnages)</option>',
      '<option value="teams:all">👥 Toutes les équipes</option>',
      ...teams.map((team) => `<option value="team:${escapeHtml(team.token)}">👥 ${escapeHtml(team.team_name || "Équipe sans nom")}</option>`),
    ];

    const characterOptions = [
      '<option value="teams_and_characters:all">🌐 Tout le monde (équipes + personnages)</option>',
      '<option value="characters:all">🎭 Tous les personnages</option>',
      ...characters.map((character) => `<option value="character:${escapeHtml(character.id)}">🎭 ${escapeHtml(character.nom || "Personnage")}</option>`),
    ];

    teamMessageTargetEl.innerHTML = teamOptions.join("");
    characterMessageTargetEl.innerHTML = characterOptions.join("");

    setSelection(teamMessageTargetEl, previousTeamTargets, "teams:all");
    setSelection(characterMessageTargetEl, previousCharacterTargets, "characters:all");
  }

  async function sendMessage({ channel, targets, text, feedbackEl, buttonEl, successText }) {
    if (!text) {
      feedbackEl.textContent = "Veuillez saisir un message avant l'envoi.";
      return;
    }

    if (!Array.isArray(targets) || !targets.length) {
      feedbackEl.textContent = "Veuillez sélectionner au moins un destinataire.";
      return;
    }

    buttonEl.disabled = true;

    const body = new URLSearchParams({ action: "send_message", channel, message: text });
    targets.forEach((target) => body.append("targets[]", target));

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

  async function refresh() {
    const response = await fetch(`./api/supervision.php?t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      listEl.textContent = "Erreur de chargement.";
      return;
    }

    fillMessageTargets(payload.teams || [], Array.isArray(payload.characters) ? payload.characters : []);

    if (!payload.teams.length) {
      listEl.textContent = "Aucune équipe connue.";
      return;
    }

    listEl.innerHTML = payload.teams.map(renderCard).join("");
  }

  resetBtn.addEventListener("click", async () => {
    if (!window.confirm("Remettre tout l'historique à zéro ?")) return;

    resetBtn.disabled = true;
    const response = await fetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ action: "reset_history" }).toString(),
    });

    const payload = await response.json().catch(() => ({}));
    resetBtn.disabled = false;

    if (!response.ok || !payload.ok) {
      window.alert("Échec de la remise à zéro.");
      return;
    }

    await refresh();
  });

  sendTeamMessageBtn.addEventListener("click", async () => {
    const targets = getSelectedValues(teamMessageTargetEl);
    const text = (teamMessageInputEl.value || "").trim();

    const includesAll = targets.includes("teams_and_characters:all");
    const normalizedTargets = includesAll ? ["teams:all", "characters:all"] : targets;
    const teamTargets = normalizedTargets.filter((target) => target === "teams:all" || target.startsWith("team:"));
    const characterTargets = normalizedTargets.filter((target) => target === "characters:all" || target.startsWith("character:"));

    if (teamTargets.length) {
      await sendMessage({
        channel: "team",
        targets: teamTargets,
        text,
        feedbackEl: teamMessageFeedbackEl,
        buttonEl: sendTeamMessageBtn,
        successText: "Message envoyé aux cibles équipes sélectionnées.",
      });
    }

    if (characterTargets.length) {
      await sendMessage({
        channel: "character",
        targets: characterTargets,
        text,
        feedbackEl: teamMessageFeedbackEl,
        buttonEl: sendTeamMessageBtn,
        successText: "Message envoyé aux cibles personnages sélectionnées.",
      });
    }

    if (text && (teamTargets.length || characterTargets.length)) {
      teamMessageInputEl.value = "";
    }
  });

  sendCharacterMessageBtn.addEventListener("click", async () => {
    const targets = getSelectedValues(characterMessageTargetEl);
    const text = (characterMessageInputEl.value || "").trim();

    const includesAll = targets.includes("teams_and_characters:all");
    const normalizedTargets = includesAll ? ["teams:all", "characters:all"] : targets;
    const teamTargets = normalizedTargets.filter((target) => target === "teams:all" || target.startsWith("team:"));
    const characterTargets = normalizedTargets.filter((target) => target === "characters:all" || target.startsWith("character:"));

    if (teamTargets.length) {
      await sendMessage({
        channel: "team",
        targets: teamTargets,
        text,
        feedbackEl: characterMessageFeedbackEl,
        buttonEl: sendCharacterMessageBtn,
        successText: "Message envoyé aux cibles équipes sélectionnées.",
      });
    }

    if (characterTargets.length) {
      await sendMessage({
        channel: "character",
        targets: characterTargets,
        text,
        feedbackEl: characterMessageFeedbackEl,
        buttonEl: sendCharacterMessageBtn,
        successText: "Message envoyé aux cibles personnages sélectionnées.",
      });
    }

    if (text && (teamTargets.length || characterTargets.length)) {
      characterMessageInputEl.value = "";
    }
  });

  refresh();
  setInterval(refresh, 3000);
})();
