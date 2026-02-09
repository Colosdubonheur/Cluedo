(() => {
  const VERSION_ENDPOINT = "./api/version.php";

  const applyVersion = async () => {
    const targets = document.querySelectorAll("[data-app-version]");
    if (targets.length === 0) {
      return;
    }

    let versionLabel = "Version indisponible";

    try {
      const response = await fetch(VERSION_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const version = typeof payload.version === "string" ? payload.version.trim() : "";

      if (!version) {
        throw new Error("Réponse sans version exploitable");
      }

      versionLabel = version;
    } catch (error) {
      console.error("Impossible de charger la version applicative.", error);
    }

    for (const target of targets) {
      target.textContent = versionLabel;
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    void applyVersion();
  });
})();
