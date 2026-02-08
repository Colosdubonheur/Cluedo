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

  const CROPPED_SIZE = 600;
  const CROPPED_QUALITY = 0.84;
  const IOS_HEIC_MIME_TYPES = new Set([
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
  ]);
  const SUPPORTED_INPUT_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

  const getFileExtension = (filename) => {
    const name = typeof filename === "string" ? filename.trim().toLowerCase() : "";
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex < 0) return "";
    return name.slice(dotIndex + 1);
  };

  const isHeicLikeFile = (file) => {
    const mime = String(file?.type || "").toLowerCase();
    const ext = getFileExtension(file?.name || "");
    return IOS_HEIC_MIME_TYPES.has(mime) || ext === "heic" || ext === "heif";
  };

  const isSupportedImageForCrop = (file) => {
    const mime = String(file?.type || "").toLowerCase();
    if (SUPPORTED_INPUT_MIME_TYPES.has(mime)) {
      return true;
    }

    const ext = getFileExtension(file?.name || "");
    return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp";
  };

  const loadImageFromFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      const image = new Image();

      reader.onload = () => {
        image.src = String(reader.result || "");
      };

      reader.onerror = () => {
        reject(new Error("Impossible de lire le fichier sélectionné"));
      };

      image.onload = () => {
        resolve(image);
      };

      image.onerror = () => {
        reject(new Error("Impossible de lire l'image sélectionnée"));
      };

      reader.readAsDataURL(file);
    });

  const openCropModal = (file) =>
    new Promise(async (resolve, reject) => {
      const image = await loadImageFromFile(file);
      const box = Math.min(image.naturalWidth, image.naturalHeight);
      const state = {
        x: Math.round((image.naturalWidth - box) / 2),
        y: Math.round((image.naturalHeight - box) / 2),
      };

      const modal = document.createElement("div");
      modal.className = "crop-modal";
      modal.innerHTML = `
        <div class="crop-dialog" role="dialog" aria-modal="true" aria-label="Recadrer la photo">
          <h3>Recadrage obligatoire (format carré)</h3>
          <p class="crop-help">Déplacez le cadre, puis validez pour enregistrer l'image finale.</p>
          <div class="crop-stage-wrap">
            <div class="crop-stage">
              <img alt="Prévisualisation du recadrage" class="crop-image" />
              <div class="crop-selection" aria-hidden="true"></div>
            </div>
          </div>
          <div class="crop-actions">
            <button type="button" class="admin-button crop-cancel">Annuler</button>
            <button type="button" class="admin-button crop-confirm">Valider le crop</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      const stage = modal.querySelector(".crop-stage");
      const preview = modal.querySelector(".crop-image");
      const selection = modal.querySelector(".crop-selection");

      preview.src = image.src;

      const STAGE_SIZE = Math.max(240, Math.min(420, window.innerWidth - 72, window.innerHeight - 280));
      stage.style.width = `${STAGE_SIZE}px`;
      stage.style.height = `${STAGE_SIZE}px`;

      const scale = Math.min(STAGE_SIZE / image.naturalWidth, STAGE_SIZE / image.naturalHeight);
      const displayedWidth = image.naturalWidth * scale;
      const displayedHeight = image.naturalHeight * scale;
      const offsetLeft = (STAGE_SIZE - displayedWidth) / 2;
      const offsetTop = (STAGE_SIZE - displayedHeight) / 2;
      const displayedBox = box * scale;

      preview.style.width = `${displayedWidth}px`;
      preview.style.height = `${displayedHeight}px`;
      preview.style.left = `${offsetLeft}px`;
      preview.style.top = `${offsetTop}px`;

      const syncSelection = () => {
        selection.style.width = `${displayedBox}px`;
        selection.style.height = `${displayedBox}px`;
        selection.style.left = `${offsetLeft + state.x * scale}px`;
        selection.style.top = `${offsetTop + state.y * scale}px`;
      };

      syncSelection();

      let drag = null;
      const onMove = (clientX, clientY) => {
        if (!drag) return;
        const nextX = drag.startX + (clientX - drag.pointerX) / scale;
        const nextY = drag.startY + (clientY - drag.pointerY) / scale;
        const maxX = image.naturalWidth - box;
        const maxY = image.naturalHeight - box;
        state.x = Math.max(0, Math.min(maxX, Math.round(nextX)));
        state.y = Math.max(0, Math.min(maxY, Math.round(nextY)));
        syncSelection();
      };

      const startDrag = (clientX, clientY) => {
        drag = {
          pointerX: clientX,
          pointerY: clientY,
          startX: state.x,
          startY: state.y,
        };
      };

      const stopDrag = () => {
        drag = null;
      };

      selection.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        startDrag(event.clientX, event.clientY);
        if (typeof selection.setPointerCapture === "function") {
          selection.setPointerCapture(event.pointerId);
        }
      });

      selection.addEventListener("pointermove", (event) => {
        onMove(event.clientX, event.clientY);
      });
      selection.addEventListener("pointerup", stopDrag);
      selection.addEventListener("pointercancel", stopDrag);

      selection.addEventListener("touchstart", (event) => {
        if (!event.touches[0]) return;
        event.preventDefault();
        startDrag(event.touches[0].clientX, event.touches[0].clientY);
      });
      selection.addEventListener("touchmove", (event) => {
        if (!event.touches[0]) return;
        event.preventDefault();
        onMove(event.touches[0].clientX, event.touches[0].clientY);
      });
      selection.addEventListener("touchend", stopDrag);
      selection.addEventListener("touchcancel", stopDrag);

      const onMouseDown = (event) => {
        event.preventDefault();
        startDrag(event.clientX, event.clientY);
      };
      const onMouseMove = (event) => {
        onMove(event.clientX, event.clientY);
      };

      selection.addEventListener("mousedown", onMouseDown);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", stopDrag);

      const close = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", stopDrag);
        selection.removeEventListener("mousedown", onMouseDown);
        modal.remove();
      };

      modal.querySelector(".crop-cancel").addEventListener("click", () => {
        close();
        resolve(null);
      });

      modal.querySelector(".crop-confirm").addEventListener("click", () => {
        const canvas = document.createElement("canvas");
        canvas.width = CROPPED_SIZE;
        canvas.height = CROPPED_SIZE;
        const ctx = canvas.getContext("2d");

        ctx.drawImage(image, state.x, state.y, box, box, 0, 0, CROPPED_SIZE, CROPPED_SIZE);
        canvas.toBlob(
          (blob) => {
            close();
            if (!blob) {
              reject(new Error("Impossible de générer l'image recadrée"));
              return;
            }
            resolve(
              new File([blob], `perso_${Date.now()}.jpg`, {
                type: "image/jpeg",
              })
            );
          },
          "image/jpeg",
          CROPPED_QUALITY
        );
      });
    });

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
      <input type="file" accept="image/*" class="photo" data-id="${id}" />

      <label class="admin-label">Temps de passage (secondes)</label>
      <input type="number" min="1" class="time-per-player admin-input" data-id="${id}" value="${p.time_per_player ?? 120}" />
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
      const file = input.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        alert("Le fichier sélectionné n'est pas une image.");
        input.value = "";
        return;
      }

      if (isHeicLikeFile(file)) {
        alert("Format d'image non supporté sur iPhone (HEIC/HEIF). Merci d'utiliser une photo JPEG ou PNG.");
        input.value = "";
        return;
      }

      if (!isSupportedImageForCrop(file)) {
        alert("Format d'image non supporté. Merci d'utiliser une photo JPEG, PNG ou WEBP.");
        input.value = "";
        return;
      }

      let croppedFile;
      try {
        croppedFile = await openCropModal(file);
      } catch (error) {
        alert(error instanceof Error ? error.message : "Le recadrage a échoué.");
        input.value = "";
        return;
      }

      if (!croppedFile) {
        input.value = "";
        return;
      }

      const previousPhoto = data[id].photo || "";
      const previewUrl = URL.createObjectURL(croppedFile);
      setPhotoPreview(id, previewUrl);

      const fd = new FormData();
      fd.append("id", id);
      fd.append("file", croppedFile);

      alert("Upload en cours…");

      const r = await adminFetch("./api/upload.php", {
        method: "POST",
        body: fd,
      });

      const j = await r.json().catch(() => ({}));
      if (!j.ok) {
        URL.revokeObjectURL(previewUrl);
        setPhotoPreview(id, previousPhoto);
        const reason = typeof j.error === "string" && j.error.trim() !== "" ? j.error : "Erreur upload";
        alert(`Upload impossible : ${reason}`);
        return;
      }

      const persistedPhoto = j.photo || j.path;
      data[id].photo = persistedPhoto;
      setPhotoPreview(id, persistedPhoto);
      URL.revokeObjectURL(previewUrl);
      alert("Photo enregistrée 👍");
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

    const r = await adminFetch("./api/save.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    alert(r.ok ? "Configuration sauvegardée ✅" : "Erreur sauvegarde");
  };
});
