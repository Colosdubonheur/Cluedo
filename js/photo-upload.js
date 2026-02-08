(function () {
  const CROPPED_SIZE = 600;
  const CROPPED_QUALITY = 0.84;
  const IOS_HEIC_MIME_TYPES = new Set([
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
  ]);
  const SUPPORTED_INPUT_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const HEIC_SIGNATURES = ["ftypheic", "ftypheix", "ftyphevc", "ftyphevx", "ftypmif1", "ftypmsf1"];
  const MIME_SIGNATURES = {
    jpeg: [0xff, 0xd8, 0xff],
    png: [0x89, 0x50, 0x4e, 0x47],
    webp: [0x52, 0x49, 0x46, 0x46],
  };

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

  const fileStartsWith = (bytes, signature) => signature.every((value, index) => bytes[index] === value);

  const detectMimeFromHeader = async (file) => {
    const headerBuffer = await file.slice(0, 32).arrayBuffer();
    const bytes = new Uint8Array(headerBuffer);

    if (fileStartsWith(bytes, MIME_SIGNATURES.jpeg)) {
      return "image/jpeg";
    }
    if (fileStartsWith(bytes, MIME_SIGNATURES.png)) {
      return "image/png";
    }
    if (fileStartsWith(bytes, MIME_SIGNATURES.webp) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
      return "image/webp";
    }

    const boxType = String.fromCharCode(...bytes.slice(4, 12)).toLowerCase();
    if (HEIC_SIGNATURES.includes(boxType)) {
      return "image/heic";
    }

    return "";
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

  const uploadFromInput = async ({ id, input, getPreviousPhoto, setPhotoPreview, sendUploadRequest }) => {
    const file = input?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Le fichier sélectionné n'est pas une image.");
      input.value = "";
      return;
    }

    const sniffedMime = await detectMimeFromHeader(file).catch(() => "");
    const effectiveMime = String(file.type || sniffedMime || "").toLowerCase();
    const normalizedFile =
      effectiveMime && effectiveMime !== file.type
        ? new File([file], file.name || `photo_${Date.now()}`, { type: effectiveMime })
        : file;

    if (isHeicLikeFile(normalizedFile) || effectiveMime === "image/heic" || effectiveMime === "image/heif") {
      alert("Format d'image non supporté sur iPhone (HEIC/HEIF). Merci d'utiliser une photo JPEG ou PNG.");
      input.value = "";
      return;
    }

    if (!isSupportedImageForCrop(normalizedFile)) {
      alert("Format d'image non supporté. Merci d'utiliser une photo JPEG, PNG ou WEBP.");
      input.value = "";
      return;
    }

    let croppedFile;
    try {
      croppedFile = await openCropModal(normalizedFile);
    } catch (error) {
      const fallbackMessage =
        effectiveMime === "image/heic" || effectiveMime === "image/heif"
          ? "Le format de cette photo n'est pas supporté. Merci d'utiliser une image JPEG ou PNG."
          : "Le recadrage a échoué. Merci d'utiliser une image JPEG ou PNG.";
      alert(error instanceof Error && error.message ? error.message : fallbackMessage);
      input.value = "";
      return;
    }

    if (!croppedFile) {
      input.value = "";
      return;
    }

    const previousPhoto = typeof getPreviousPhoto === "function" ? getPreviousPhoto() : "";
    const previewUrl = URL.createObjectURL(croppedFile);
    setPhotoPreview(previewUrl);

    try {
      const response = await sendUploadRequest({ id, file: croppedFile });
      if (!response?.ok) {
        setPhotoPreview(previousPhoto);
        const reason = response?.error || "Erreur upload";
        alert(`Upload impossible : ${reason}`);
        return;
      }

      const persistedPhoto = response.photo || response.path || "";
      setPhotoPreview(persistedPhoto);
      alert("Photo enregistrée 👍");
    } catch (_error) {
      setPhotoPreview(previousPhoto);
      alert("Upload impossible : problème réseau pendant l'envoi de la photo.");
    } finally {
      URL.revokeObjectURL(previewUrl);
      input.value = "";
    }
  };

  window.CluedoPhotoUpload = {
    uploadFromInput,
  };
})();
