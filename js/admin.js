document.addEventListener("DOMContentLoaded", async () => {
  const PIN_KEY = "cluedo_admin_pin";
  let adminPin = sessionStorage.getItem(PIN_KEY) || "";
  let isPinEnabled = true;

  async function verifyPin(pin) {
    const query = new URLSearchParams({ t: Date.now().toString() });
    if (pin) {
      query.set("admin_pin", pin);
    }

    const response = await fetch(`./api/admin_auth.php?${query.toString()}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, pinEnabled: payload.pin_enabled !== false };
    }

    return { ok: !!payload.ok, pinEnabled: payload.pin_enabled !== false };
  }

  const authStatus = await verifyPin(adminPin);
  isPinEnabled = authStatus.pinEnabled;

  while (isPinEnabled && (!adminPin || !(await verifyPin(adminPin)).ok)) {
    adminPin = window.prompt("Code administration :", adminPin || "") || "";
    if (!adminPin) {
      document.body.innerHTML = "<p style='color:white;padding:20px'>Accès refusé.</p>";
      return;
    }
  }

  if (isPinEnabled) {
    sessionStorage.setItem(PIN_KEY, adminPin);
  } else {
    sessionStorage.removeItem(PIN_KEY);
  }

  const adminFetch = (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (isPinEnabled) {
      headers["X-Admin-Pin"] = adminPin;
    }
    return fetch(url, { ...options, headers });
  };

  document.body.innerHTML = `
    <div style="max-width:600px;margin:20px auto;color:white;font-family:Arial">
      <h1>Admin Cluedo</h1>
      <p style="color:#aaa">Gestion des personnages</p>
      ${isPinEnabled ? "" : '<p style="color:#6ee7b7;margin-top:-6px">Aucun code configuré, accès libre.</p>'}
      <div id="list">Chargement…</div>
      <button id="save" style="width:100%;padding:14px;font-size:18px;margin-top:20px">
        💾 Enregistrer
      </button>
    </div>
  `;

  const list = document.getElementById("list");
  const res = await adminFetch("./api/get.php?ts=" + Date.now());
  if (!res.ok) {
    list.innerHTML = "<p>Accès refusé.</p>";
    return;
  }

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

      <label>Temps de passage (secondes)</label>
      <input type="number" min="1" class="time-per-player" data-id="${id}"
        value="${p.time_per_player ?? 120}"
        style="width:100%;padding:12px;font-size:16px">
    `;

    list.appendChild(div);
  }

  document.querySelectorAll(".photo").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.dataset.id;
      const file = input.files[0];
      if (!file) return;

      const fd = new FormData();
      fd.append("id", id);
      fd.append("file", file);

      alert("Upload en cours…");

      const r = await adminFetch("./api/upload.php", {
        method: "POST",
        body: fd,
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

  document.getElementById("save").onclick = async () => {
    document.querySelectorAll(".nom").forEach((i) => {
      data[i.dataset.id].nom = i.value;
    });

    document.querySelectorAll(".time-per-player").forEach((i) => {
      const parsed = parseInt(i.value, 10);
      data[i.dataset.id].time_per_player = Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
    });

    const r = await adminFetch("./api/save.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    alert(r.ok ? "Configuration sauvegardée ✅" : "Erreur sauvegarde");
  };
});
