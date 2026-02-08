(function () {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const characterNameEl = document.getElementById("characterName");
  const currentEl = document.getElementById("currentTeam");
  const queueEl = document.getElementById("queue");

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

    if (!payload.current) {
      currentEl.innerHTML = "<h3>Équipe en cours</h3><p>Aucune équipe active.</p>";
    } else {
      currentEl.innerHTML = `
        <h3>Équipe en cours</h3>
        <p><strong>${payload.current.team}</strong></p>
        <p>Temps restant : ${fmt(payload.current.remaining_seconds)}</p>
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

    if (!payload.queue.length) {
      queueEl.innerHTML = "<h3>File d'attente</h3><p>Personne en attente.</p>";
      return;
    }

    queueEl.innerHTML = `<h3>File d'attente</h3>${payload.queue
      .map((team) => `<div>${team.position}. ${team.team} (${fmt(team.estimated_seconds)})</div>`)
      .join("")}`;
  }

  refresh();
  setInterval(refresh, 2000);
})();
