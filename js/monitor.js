(function () {
  const listEl = document.getElementById("teams");

  function fmt(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return `${m}:${r}`;
  }

  async function refresh() {
    const response = await fetch(`./api/supervision.php?t=${Date.now()}`);
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      listEl.textContent = "Erreur de chargement.";
      return;
    }

    if (!payload.teams.length) {
      listEl.textContent = "Aucune équipe en jeu.";
      return;
    }

    listEl.innerHTML = payload.teams
      .map((team) => {
        return `<div style="padding:8px 0;border-bottom:1px solid #2b3240">
          <strong>${team.team}</strong><br>
          personnage : ${team.personnage.nom || "(sans nom)"} (#${team.personnage.id})<br>
          état : ${team.state}<br>
          temps : ${fmt(team.remaining_or_eta_seconds)}<br>
          position file : ${team.queue_position}
        </div>`;
      })
      .join("");
  }

  refresh();
  setInterval(refresh, 2000);
})();
