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
    <div class="container admin-page">
      <nav class="admin-top-nav" aria-label="Navigation admin">
        <a href="./index.html" class="admin-hub-link">Retour au Hub</a>
      </nav>
      <h1>Admin Cluedo</h1>
      <p class="admin-subtitle">Gestion des personnages</p>
      ${isPinEnabled ? "" : '<p class="admin-open-access">Aucun code configuré, accès libre.</p>'}

      <section id="quick-nav" class="card admin-quick-nav">
        <h2>Accès rapide</h2>
        <div id="quick-nav-list" class="admin-quick-nav-list">Chargement…</div>
      </section>

      <section class="card admin-global-actions">
        <h2>Actions globales</h2>
        <div class="admin-global-actions-row">
          <label for="global-time" class="admin-label">Temps de passage pour tous (secondes)</label>
          <div class="admin-global-actions-controls">
            <input id="global-time" type="number" min="1" value="120" class="admin-input" />
            <button id="apply-global-time" class="admin-button">Appliquer à tous</button>
          </div>
        </div>
      </section>

      <div id="list" class="admin-grid">Chargement…</div>

      <div class="admin-save-wrap"><button id="save" class="admin-save-button">💾 Enregistrer</button></div>
    </div>
  `;

  const list = document.getElementById("list");
  const quickNavList = document.getElementById("quick-nav-list");

  const res = await adminFetch("./api/get.php?ts=" + Date.now());
  if (!res.ok) {
    list.innerHTML = "<p>Accès refusé.</p>";
    quickNavList.innerHTML = "<p>Accès refusé.</p>";
    return;
  }

  const data = await res.json();
  list.innerHTML = "";
  quickNavList.innerHTML = "";

  const ids = Object.keys(data).sort((a, b) => Number(a) - Number(b));

  const setPhotoPreview = (id, src) => {
    const card = document.getElementById(`player-${id}`);
    if (!card) return;
    const preview = card.querySelector(".admin-photo");
    if (!preview) return;

    if (!src) {
      preview.classList.add("is-hidden");
      preview.removeAttribute("src");
      return;
    }

    preview.src = src;
    preview.classList.remove("is-hidden");
  };

  for (const id of ids) {
    const p = data[id];

    const navButton = document.createElement("button");
    navButton.className = "admin-nav-button";
    navButton.type = "button";
    navButton.textContent = `${id} - ${p.nom || "Sans nom"}`;
    navButton.addEventListener("click", () => {
      const target = document.getElementById(`player-${id}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    quickNavList.appendChild(navButton);

    const card = document.createElement("section");
    card.id = `player-${id}`;
    card.className = "card admin-player-card";

    card.innerHTML = `
      <h3>#${id}</h3>

      <label class="admin-label">Nom</label>
      <input class="nom admin-input" data-id="${id}" value="${p.nom || ""}" />

      <label class="admin-label">Photo</label>
      <img alt="Photo ${p.nom || `personnage ${id}`}" class="admin-photo is-hidden" />
      <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" class="photo" data-id="${id}" />

      <label class="admin-label">Temps de passage (secondes)</label>
      <input type="number" min="1" class="time-per-player admin-input" data-id="${id}" value="${p.time_per_player ?? 120}" />

      <label class="admin-label">Emplacement (location)</label>
      <input class="location admin-input" data-id="${id}" value="${p.location || ""}" maxlength="160" />

      <label class="admin-label admin-toggle-label">
        <input type="checkbox" class="active-flag" data-id="${id}" ${p.active !== false ? "checked" : ""} />
        Personnage actif
      </label>
    `;

    list.appendChild(card);
    setPhotoPreview(id, p.photo || "");
  }

  document.getElementById("apply-global-time").addEventListener("click", () => {
    const input = document.getElementById("global-time");
    const parsed = parseInt(input.value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      alert("Veuillez saisir une valeur valide (> 0).");
      return;
    }

    document.querySelectorAll(".time-per-player").forEach((field) => {
      field.value = parsed;
    });
  });

  document.querySelectorAll(".photo").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.dataset.id;
      await window.CluedoPhotoUpload.uploadFromInput({
        id,
        input,
        getPreviousPhoto: () => data[id].photo || "",
        setPhotoPreview: (src) => setPhotoPreview(id, src),
        sendUploadRequest: async ({ id: uploadId, file }) => {
          const fd = new FormData();
          fd.append("id", uploadId);
          fd.append("file", file);

          const response = await adminFetch("./api/upload.php", {
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
            const responseHint = !payload.error && rawResponse ? ` (réponse serveur: ${rawResponse.slice(0, 120)})` : "";
            const reason = typeof payload.error === "string" && payload.error.trim() !== "" ? payload.error : `Erreur upload${responseHint}`;
            return { ok: false, error: reason };
          }

          const persistedPhoto = payload.photo || payload.path || "";
          data[uploadId].photo = persistedPhoto;
          return { ok: true, photo: persistedPhoto };
        },
      });
    });
  });

  document.getElementById("save").onclick = async () => {
    document.querySelectorAll(".nom").forEach((input) => {
      data[input.dataset.id].nom = input.value;
    });

    document.querySelectorAll(".time-per-player").forEach((input) => {
      const parsed = parseInt(input.value, 10);
      data[input.dataset.id].time_per_player = Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
    });

    document.querySelectorAll(".location").forEach((input) => {
      data[input.dataset.id].location = input.value.trim();
    });

    document.querySelectorAll(".active-flag").forEach((input) => {
      data[input.dataset.id].active = input.checked;
    });

    const r = await adminFetch("./api/save.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    alert(r.ok ? "Configuration sauvegardée ✅" : "Erreur sauvegarde");
  };
});
