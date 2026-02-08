(() => {
  const VERSION_ENDPOINT = "./api/version.php";

  const applyVersion = async () => {
    const targets = document.querySelectorAll("[data-app-version]");
    if (targets.length === 0) {
      return;
    }

    let version = "";

    try {
      const response = await fetch(VERSION_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Version indisponible");
      }

      const payload = await response.json();
      version = typeof payload.version === "string" ? payload.version.trim() : "";
    } catch (error) {
      version = "";
    }

    for (const target of targets) {
      target.textContent = version;
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    void applyVersion();
  });
})();
