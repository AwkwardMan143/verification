const params = new URLSearchParams(window.location.search);
const token = params.get("token");

const loadingEl = document.getElementById("state-loading");
const errorEl = document.getElementById("state-error");
const readyEl = document.getElementById("state-ready");
const doneEl = document.getElementById("state-done");
const errorMessageEl = document.getElementById("error-message");
const expiresHintEl = document.getElementById("expires-hint");
const agreeEl = document.getElementById("agree");
const verifyBtn = document.getElementById("verify-btn");
const apiDebugEl = document.getElementById("api-debug");

function show(el) {
  [loadingEl, errorEl, readyEl, doneEl].forEach((node) => node.classList.add("hidden"));
  el.classList.remove("hidden");
}

function apiBase() {
  return String(window.BOT_API_URL || "").replace(/\/$/, "");
}

function apiHeaders(extra) {
  const headers = { ...(extra || {}) };
  if (apiBase().includes("ngrok")) {
    headers["ngrok-skip-browser-warning"] = "69420";
  }
  return headers;
}

function showConfigDebug() {
  if (!apiDebugEl) return;
  const base = apiBase();
  if (!base || base.includes("REPLACE-WITH-YOUR-PUBLIC-BOT-URL")) {
    apiDebugEl.textContent = "API: not configured (edit config.js on GitHub)";
  } else {
    apiDebugEl.textContent = `API: ${base}`;
  }
}

function networkErrorMessage(err) {
  const msg = String(err && err.message ? err.message : err);
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return (
      "Could not connect to your bot API. This is usually a dead ngrok/cloudflare tunnel, " +
      "wrong URL in config.js on GitHub, or bot.py not running. " +
      "Open YOUR-TUNNEL-URL/health in the browser — if that fails, fix the tunnel first."
    );
  }
  return `Connection error: ${msg}`;
}

async function probeApiHealth() {
  const res = await fetch(`${apiBase()}/health`, {
    method: "GET",
    headers: apiHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Health check failed (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data.bot_ready) {
    throw new Error("Bot API is up but Discord bot is not ready yet");
  }
  return data;
}

async function checkToken() {
  showConfigDebug();

  if (!token) {
    errorMessageEl.textContent = "No verification token in the link.";
    show(errorEl);
    return;
  }

  if (!apiBase() || apiBase().includes("REPLACE-WITH-YOUR-PUBLIC-BOT-URL")) {
    errorMessageEl.textContent =
      "This page is not configured yet. Edit config.js on GitHub with your public bot URL.";
    show(errorEl);
    return;
  }

  try {
    await probeApiHealth();
  } catch (err) {
    console.error("Health probe failed:", err);
    errorMessageEl.textContent = networkErrorMessage(err);
    show(errorEl);
    return;
  }

  try {
    const res = await fetch(
      `${apiBase()}/web-verify/status?token=${encodeURIComponent(token)}`,
      { method: "GET", headers: apiHeaders() }
    );
    let data;
    try {
      data = await res.json();
    } catch (_parseErr) {
      errorMessageEl.textContent =
        "Verification server returned an invalid response (not JSON). Tunnel may be showing a warning page — update verify.js on GitHub.";
      show(errorEl);
      return;
    }

    if (!res.ok || !data.ok) {
      const messages = {
        invalid_token: "This verification link is invalid.",
        expired: "This verification link has expired.",
      };
      errorMessageEl.textContent = messages[data.error] || "Could not use this link.";
      show(errorEl);
      return;
    }

    const minutes = Math.max(1, Math.ceil((data.expires_in || 0) / 60));
    expiresHintEl.textContent = `Link expires in about ${minutes} minute(s).`;
    show(readyEl);
  } catch (err) {
    console.error(err);
    errorMessageEl.textContent = networkErrorMessage(err);
    show(errorEl);
  }
}

agreeEl.addEventListener("change", () => {
  verifyBtn.disabled = !agreeEl.checked;
});

async function fetchClientGeo() {
  try {
    const res = await fetch("https://ipwho.is/");
    const data = await res.json();
    if (data.success) {
      return {
        ip: data.ip,
        city: data.city,
        region: data.region,
        country: data.country,
        timezone: (data.timezone && data.timezone.id) || "",
        isp: (data.connection && data.connection.isp) || "",
      };
    }
  } catch (err) {
    console.warn("Client geo lookup failed", err);
  }
  return null;
}

verifyBtn.addEventListener("click", async () => {
  verifyBtn.disabled = true;
  verifyBtn.textContent = "Verifying…";

  try {
    const client_meta = await fetchClientGeo();
    const res = await fetch(`${apiBase()}/web-verify/complete`, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ token, agreed: true, client_meta: client_meta || {} }),
    });
    let data;
    try {
      data = await res.json();
    } catch (_parseErr) {
      errorMessageEl.textContent =
        "Verification server returned an invalid response. Check tunnel and bot.py.";
      show(errorEl);
      return;
    }

    if (!res.ok || !data.ok) {
      const messages = {
        invalid_token: "This verification link is invalid.",
        expired: "This verification link has expired.",
        confirmation_required: "Check the confirmation box first.",
        verify_failed: "Verification failed on the server.",
        bot_not_ready: "Discord bot is still starting — wait and try again.",
      };
      errorMessageEl.textContent = messages[data.error] || "Verification failed.";
      show(errorEl);
      return;
    }

    show(doneEl);
  } catch (err) {
    console.error(err);
    errorMessageEl.textContent = networkErrorMessage(err);
    show(errorEl);
  }
});

checkToken();
