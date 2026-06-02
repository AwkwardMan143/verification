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

async function checkToken() {
  if (!token) {
    errorMessageEl.textContent = "No verification token in the link.";
    show(errorEl);
    return;
  }

  if (!apiBase() || apiBase().includes("REPLACE-WITH-YOUR-PUBLIC-BOT-URL")) {
    errorMessageEl.textContent =
      "This page is not configured yet. Edit config.js with your public bot API URL.";
    show(errorEl);
    return;
  }

  try {
    const res = await fetch(
      `${apiBase()}/web-verify/status?token=${encodeURIComponent(token)}`,
      { headers: apiHeaders() }
    );
    let data;
    try {
      data = await res.json();
    } catch (_parseErr) {
      errorMessageEl.textContent =
        "Verification server returned an invalid response. Check ngrok is running and config.js has the correct URL.";
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
    errorMessageEl.textContent =
      "Could not reach the verification server. Keep bot.py and ngrok running, and confirm config.js on GitHub has your current ngrok URL.";
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
    const data = await res.json();

    if (!res.ok || !data.ok) {
      const messages = {
        invalid_token: "This verification link is invalid.",
        expired: "This verification link has expired.",
        confirmation_required: "Check the confirmation box first.",
        verify_failed: "Verification failed on the server.",
      };
      errorMessageEl.textContent = messages[data.error] || "Verification failed.";
      show(errorEl);
      return;
    }

    show(doneEl);
  } catch (err) {
    console.error(err);
    errorMessageEl.textContent = "Could not reach the verification server.";
    show(errorEl);
  }
});

checkToken();
