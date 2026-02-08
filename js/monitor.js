(function () {
  const listEl = document.getElementById("teams");
  const resetBtn = document.getElementById("reset-history");
  const messageTargetEl = document.getElementById("message-target");
  const messageInputEl = document.getElementById("message-text");
  const sendMessageBtn = document.getElementById("send-message");
  const messageFeedbackEl = document.getElementById("message-feedback");

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
      return "<p class=\"monitor-muted\">Prénoms non renseignés.</p>";
    }

    return `<p class=\"monitor-players\">${players.map((name) => escapeHtml(name)).join(" · ")}</p>`;
  }

  function renderHistory(team) {
    const seen = Array.isArray(team.encountered_personnages) ? team.encountered_personnages.slice(0, 8) : [];
    if (!seen.length) {
      return "<p class=\"monitor-muted\">Aucune rencontre historisée.</p>";
    }

    return `<ul class=\"monitor-history-list\">${seen
      .map((entry) => `<li>${escapeHtml(entry.nom || "Personnage")}</li>`)
      .join("")}</ul>`;
  }

  function renderMessageSummary(team) {
    if (!team.message?.text) {
      return "<p class=\"monitor-muted\">Aucun message en cours.</p>";
    }

    const source = team.message.scope === "team" ? "Message individuel" : "Message global";
    return `<div class=\"monitor-card-message\"><strong>${source}</strong><p>${escapeHtml(team.message.text)}</p></div>`;
  }

  function renderCard(team) {
    const status = statusLabel(team);
    const photoHtml = team.photo
      ? `<img src="${escapeHtml(team.photo)}" alt="Photo ${escapeHtml(team.team_name || "équipe")}" class="monitor-team-photo"/>`
      : "<div class=\"monitor-team-photo monitor-team-photo-placeholder\" aria-hidden=\"true\"></div>";

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

  function fillTeamTargets(teams) {
    const previousValue = messageTargetEl.value;
    const options = [
      '<option value="all">Toutes les équipes (global)</option>',
      ...teams.map((team) => `<option value="${escapeHtml(team.token)}">${escapeHtml(team.team_name || "Équipe sans nom")}</option>`),
    ];

    messageTargetEl.innerHTML = options.join("");

    if (teams.some((team) => team.token === previousValue)) {
      messageTargetEl.value = previousValue;
      return;
    }

    messageTargetEl.value = "all";
  }

  async function refresh() {
    const response = await fetch(`./api/supervision.php?t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      listEl.textContent = "Erreur de chargement.";
      return;
    }

    if (!payload.teams.length) {
      listEl.textContent = "Aucune équipe connue.";
      fillTeamTargets([]);
      return;
    }

    fillTeamTargets(payload.teams);
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

  sendMessageBtn.addEventListener("click", async () => {
    const target = messageTargetEl.value || "all";
    const text = (messageInputEl.value || "").trim();

    if (!text) {
      messageFeedbackEl.textContent = "Veuillez saisir un message avant l'envoi.";
      return;
    }

    sendMessageBtn.disabled = true;
    const body = new URLSearchParams({
      action: "send_message",
      target,
      message: text,
    });

    const response = await fetch("./api/supervision.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });

    const payload = await response.json().catch(() => ({}));
    sendMessageBtn.disabled = false;

    if (!response.ok || !payload.ok) {
      messageFeedbackEl.textContent = payload.error || "Échec d'envoi du message.";
      return;
    }

    messageInputEl.value = "";
    messageFeedbackEl.textContent = target === "all" ? "Message global envoyé." : "Message individuel envoyé.";
    await refresh();
  });

  refresh();
  setInterval(refresh, 3000);
})();
