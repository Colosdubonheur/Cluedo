document.addEventListener("DOMContentLoaded", async () => {
  document.body.innerHTML = `
    <div style="max-width:600px;margin:20px auto;color:white;font-family:Arial">
      <h1>Admin Cluedo</h1>
      <p style="color:#aaa">Gestion des personnages</p>
      <div id="list">Chargement…</div>
      <button id="save" style="width:100%;padding:14px;font-size:18px;margin-top:20px">
        💾 Enregistrer
      </button>
    </div>
  `;

  const list = document.getElementById("list");
  const res = await fetch("./api/get.php?ts=" + Date.now());
  const data = await res.json();
  list.innerHTML = "";

  for (const id in data) {
    const p = data[id];

    const div = document.createElement("div");
    div.style.background = "#171a21";
    div.style.padding = "14px";
    div.style.marginBottom = "16px";
    div.style.borderRadius = "12px";

    div.innerHTML = `
      <h3>#${id}</h3>

      <label>Nom</label>
      <input class="nom" data-id="${id}" value="${p.nom || ""}"
        style="width:100%;padding:12px;font-size:16px;margin-bottom:10px">

      <label>Photo</label><br>
      ${p.photo ? `<img src="${p.photo}" style="width:100%;max-height:200px;object-fit:contain;border-radius:10px;margin-bottom:8px">` : ""}
      <input type="file" accept="image/*" class="photo" data-id="${id}"
        style="font-size:16px;margin-bottom:10px">

      <label>Temps</label>
      <select class="mode" data-id="${id}"
        style="width:100%;padding:12px;font-size:16px;margin-bottom:10px">
        ${["random","30s","1mn","2mn","3mn","5mn","custom"].map(m =>
          `<option value="${m}" ${p.mode===m?"selected":""}>${m}</option>`
        ).join("")}
      </select>

      <input type="number" placeholder="Secondes (si custom)"
        class="custom" data-id="${id}" value="${p.custom ?? ""}"
        style="width:100%;padding:12px;font-size:16px">
    `;

    list.appendChild(div);
  }

  // upload photo
  document.querySelectorAll(".photo").forEach(input => {
    input.addEventListener("change", async () => {
      const id = input.dataset.id;
      const file = input.files[0];
      if (!file) return;

      const fd = new FormData();
      fd.append("id", id);
      fd.append("file", file);

      alert("Upload en cours…");

      const r = await fetch("./api/upload.php", {
        method: "POST",
        body: fd
      });

      const j = await r.json();
      if (!j.ok) {
        alert("Erreur upload");
        return;
      }

      data[id].photo = j.path;
      alert("Photo enregistrée 👍");
    });
  });

  // save config
  document.getElementById("save").onclick = async () => {
    document.querySelectorAll(".nom").forEach(i => {
      data[i.dataset.id].nom = i.value;
    });

    document.querySelectorAll(".mode").forEach(i => {
      data[i.dataset.id].mode = i.value;
    });

    document.querySelectorAll(".custom").forEach(i => {
      data[i.dataset.id].custom = i.value ? parseInt(i.value,10) : null;
    });

    const r = await fetch("./api/save.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    alert(r.ok ? "Configuration sauvegardée ✅" : "Erreur sauvegarde");
  };
});