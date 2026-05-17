import { getCurrentUserAndProfile, supabase } from "../js/supabaseClient.js";

const scriptUrl = document.currentScript?.src || import.meta.url;
const publicLoginMode = document.currentScript?.dataset.publicLogin === "true";
const loginUrl = new URL("../pages/login.html", scriptUrl).href;
const profileUrl = new URL("../pages/profile.html", scriptUrl).href;

let gate;
let form;
let codeInput;
let submitButton;
let message;
let currentUser = null;
let currentProfile = null;
let isClaiming = false;

function ensureGate() {
  if (gate) return gate;

  gate = document.createElement("div");
  gate.className = "um-access-gate";
  gate.setAttribute("role", "dialog");
  gate.setAttribute("aria-modal", "true");
  gate.setAttribute("aria-labelledby", "umAccessTitle");
  gate.innerHTML = `
    <section class="um-access-card">
      <p class="um-access-eyebrow">Subscriber Gate</p>
      <h2 id="umAccessTitle">Access Required</h2>
      <p data-access-copy>Enter your 7-digit subscriber access code.</p>
      <form class="um-access-form" data-access-form>
        <label>
          7-digit access code
          <input data-access-input class="um-access-code-input" type="text" inputmode="numeric" pattern="[0-9]{7}" maxlength="7" autocomplete="one-time-code" placeholder="4839201" aria-describedby="umAccessMessage" />
        </label>
        <div class="um-access-actions">
          <button class="um-access-button" data-access-submit type="submit" disabled>Unlock</button>
          <a class="um-access-button secondary" data-access-login href="${loginUrl}">Login / Sign up</a>
          <a class="um-access-button secondary" data-access-profile href="${profileUrl}">Profile</a>
        </div>
        <p id="umAccessMessage" class="um-access-message" data-access-message aria-live="polite"></p>
      </form>
    </section>
  `;

  form = gate.querySelector("[data-access-form]");
  codeInput = gate.querySelector("[data-access-input]");
  submitButton = gate.querySelector("[data-access-submit]");
  message = gate.querySelector("[data-access-message]");
  codeInput.addEventListener("input", handleCodeInput);
  form.addEventListener("submit", claimCode);
  return gate;
}

function lockPage() {
  document.body.appendChild(ensureGate());
  document.documentElement.classList.add("um-access-locked");
}

function unlockPage() {
  gate?.remove();
  document.documentElement.classList.remove("um-access-locked");
  window.dispatchEvent(new CustomEvent("um:access-granted", {
    detail: {
      user: currentUser,
      profile: currentProfile
    }
  }));
}

function setGateMode(mode, detail = "") {
  const copy = ensureGate().querySelector("[data-access-copy]");
  const login = ensureGate().querySelector("[data-access-login]");
  const profile = ensureGate().querySelector("[data-access-profile]");
  const showCodeForm = mode !== "logged-out" && mode !== "checking";

  codeInput.disabled = !showCodeForm;
  syncSubmitState(showCodeForm);
  form.classList.toggle("is-checking", mode === "checking");
  login.style.display = mode === "logged-out" ? "inline-flex" : "none";
  profile.style.display = mode === "missing-profile" ? "inline-flex" : "none";

  if (mode === "checking") {
    copy.textContent = "Checking your login and access code status.";
    setMessage("Checking access...");
    return;
  }

  if (mode === "logged-out") {
    copy.textContent = "Log in or sign up first, then enter your 7-digit subscriber access code.";
    setMessage("Not signed in.", "error");
    return;
  }

  if (mode === "missing-profile") {
    copy.textContent = "Enter your 7-digit subscriber access code.";
    setMessage(detail || "Profile missing.", "error");
    codeInput.focus();
    return;
  }

  copy.textContent = "Enter your 7-digit subscriber access code.";
  setMessage(detail || "Enter your 7-digit subscriber access code.");
  codeInput.focus();
}

function setMessage(text, type = "") {
  if (!message) return;
  message.className = `um-access-message ${type}`.trim();
  message.textContent = text;
}

function cleanAccessCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 7);
}

function isValidAccessCode(value) {
  return /^[0-9]{7}$/.test(String(value || ""));
}

function syncSubmitState(showCodeForm = !codeInput.disabled) {
  submitButton.disabled = isClaiming || !showCodeForm || !isValidAccessCode(codeInput.value);
}

function handleCodeInput() {
  const cleaned = cleanAccessCode(codeInput.value);
  if (codeInput.value !== cleaned) {
    codeInput.value = cleaned;
  }
  syncSubmitState();
  if (!cleaned) {
    setMessage("Enter your 7-digit subscriber access code.");
  } else if (!isValidAccessCode(cleaned)) {
    setMessage("Code must be exactly 7 digits.");
  } else {
    setMessage("Ready to unlock.");
  }
}

async function checkAccessStatus() {
  const { data, error } = await supabase.rpc("check_access_status");
  if (error) {
    console.error("Access status check failed:", error);
    throw error;
  }
  return data;
}

async function checkAccess() {
  lockPage();
  setGateMode("checking");

  const auth = await getCurrentUserAndProfile();
  currentUser = auth.user;
  currentProfile = auth.profile;

  if (auth.error) {
    console.error("Access gate auth/profile check failed:", auth.error);
  }

  if (!currentUser) {
    if (publicLoginMode) {
      unlockPage();
      return true;
    }
    setGateMode("logged-out");
    return false;
  }

  if (!currentProfile) {
    setGateMode("missing-profile");
    return false;
  }

  try {
    const access = await checkAccessStatus();
    if (access?.ok === true) {
      unlockPage();
      return true;
    }
    setGateMode("code", access?.error || "Enter your 7-digit subscriber access code.");
    return false;
  } catch (error) {
    setGateMode("code", error.message || "Access check failed. Run the access-code SQL setup in Supabase.");
    return false;
  }
}

async function claimCode(event) {
  event.preventDefault();
  const code = cleanAccessCode(codeInput.value);
  codeInput.value = code;

  if (!isValidAccessCode(code)) {
    syncSubmitState();
    setMessage("Enter your 7-digit subscriber access code.", "error");
    return;
  }

  isClaiming = true;
  syncSubmitState();
  setMessage("Checking code...");

  try {
    const { data, error } = await supabase.rpc("claim_access_code", {
      input_code: code
    });

    if (error) {
      console.error("Access code claim failed:", error);
      throw error;
    }

    if (!data?.ok) {
      setMessage(data?.error || "Invalid code.", "error");
      isClaiming = false;
      syncSubmitState();
      return;
    }

    setMessage(data.message || "Access granted.", "success");
    const refreshed = await getCurrentUserAndProfile();
    currentUser = refreshed.user;
    currentProfile = refreshed.profile;
    window.setTimeout(unlockPage, 450);
  } catch (error) {
    setMessage(error.message || "Access code check failed.", "error");
    isClaiming = false;
    syncSubmitState();
  }
}

window.UMAccessGate = {
  checkAccess,
  unlockPage
};

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    window.setTimeout(() => {
      void checkAccess();
    }, 0);
    return;
  }

  if (publicLoginMode) {
    unlockPage();
    return;
  }

  window.setTimeout(() => {
    void checkAccess();
  }, 0);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkAccess, { once: true });
} else {
  void checkAccess();
}
