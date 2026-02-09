(function () {
  const PIN_KEY = "cluedo_admin_pin";

  async function verifyAdminPin(pin) {
    const query = new URLSearchParams({ t: Date.now().toString() });
    if (pin) {
      query.set("admin_pin", pin);
    }

    const response = await fetch(`./api/admin_auth.php?${query.toString()}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        pinEnabled: payload.pin_enabled !== false,
      };
    }

    return {
      ok: !!payload.ok,
      pinEnabled: payload.pin_enabled !== false,
      created: payload.created === true,
    };
  }

  async function requireAdminAccess(options = {}) {
    const {
      allowPinCreation = false,
      firstSetupPrompt = "Aucun code admin configuré. Définissez le code admin :",
      promptLabel = "Code administration :",
      deniedMessage = "Accès refusé.",
    } = options;

    let adminPin = sessionStorage.getItem(PIN_KEY) || "";
    let authStatus = await verifyAdminPin(adminPin);

    if (!authStatus.pinEnabled && allowPinCreation) {
      adminPin = window.prompt(firstSetupPrompt, "") || "";
      if (!adminPin) {
        document.body.innerHTML = `<p style='color:white;padding:20px'>${deniedMessage}</p>`;
        return { ok: false, pinEnabled: false, pin: "" };
      }

      authStatus = await verifyAdminPin(adminPin);
      if (!authStatus.ok || !authStatus.pinEnabled) {
        document.body.innerHTML = `<p style='color:white;padding:20px'>${deniedMessage}</p>`;
        return { ok: false, pinEnabled: false, pin: "" };
      }
    }

    while (authStatus.pinEnabled && (!adminPin || !authStatus.ok)) {
      adminPin = window.prompt(promptLabel, adminPin || "") || "";
      if (!adminPin) {
        document.body.innerHTML = `<p style='color:white;padding:20px'>${deniedMessage}</p>`;
        return { ok: false, pinEnabled: true, pin: "" };
      }
      authStatus = await verifyAdminPin(adminPin);
    }

    if (authStatus.pinEnabled) {
      sessionStorage.setItem(PIN_KEY, adminPin);
    } else {
      sessionStorage.removeItem(PIN_KEY);
    }

    return { ok: true, pinEnabled: authStatus.pinEnabled, pin: adminPin };
  }

  window.CluedoAuth = {
    requireAdminAccess,
  };
})();
