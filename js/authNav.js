(function () {
  const DEFAULT_LABEL = "Sign in";
  const FLOATING_LINK_ID = "umAuthFloatingLink";
  const DISPLAY_CACHE_KEY = "um.auth.displayName";
  const NAV_OFFSET_VAR = "--um-auth-nav-offset";
  const SCRIPT_URL = document.currentScript?.src || new URL("./authNav.js", window.location.href).href;
  const AUTH_MODULE_URL = new URL("./supabaseClient.js", SCRIPT_URL).href;

  let resolveInitialAuth;
  window.UMAuth = { signedIn: false, user: null, profile: null, displayName: DEFAULT_LABEL };
  window.UMAuthReady = new Promise((resolve) => {
    resolveInitialAuth = resolve;
  });

  function loginUrl() {
    return new URL("../pages/login.html", SCRIPT_URL).href;
  }

  function profileUrl() {
    return new URL("../pages/profile.html", SCRIPT_URL).href;
  }

  function cachedLabel() {
    try {
      return localStorage.getItem(DISPLAY_CACHE_KEY) || "";
    } catch (_error) {
      return "";
    }
  }

  function cacheLabel(label) {
    try {
      if (label && label !== DEFAULT_LABEL) localStorage.setItem(DISPLAY_CACHE_KEY, label);
      else localStorage.removeItem(DISPLAY_CACHE_KEY);
    } catch (_error) {}
  }

  function ensureFloatingAuthLink() {
    const existing = document.getElementById(FLOATING_LINK_ID);
    if (existing) return existing;

    if (document.querySelector(".topbar, .sidebar")) {
      document.documentElement.classList.add("um-auth-has-site-nav");
    }

    const link = document.createElement("a");
    link.id = FLOATING_LINK_ID;
    link.href = loginUrl();
    link.dataset.authLink = "";
    link.dataset.authFloating = "";
    link.textContent = cachedLabel() || DEFAULT_LABEL;
    link.setAttribute("aria-label", "Account");

    const style = document.createElement("style");
    style.textContent = `
      #${FLOATING_LINK_ID} {
        position: fixed;
        top: max(0.65rem, env(safe-area-inset-top));
        left: max(0.65rem, env(safe-area-inset-left));
        z-index: 2147483000;
        max-width: min(13rem, calc(100vw - 1.3rem));
        min-height: 2.35rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 999px;
        padding: 0.55rem 0.82rem;
        background: rgba(5, 6, 7, 0.78);
        color: #fff;
        box-shadow: 0 14px 38px rgba(0,0,0,0.38);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        font: 800 0.82rem/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        touch-action: manipulation;
      }

      #${FLOATING_LINK_ID}:hover {
        border-color: rgba(255,255,255,0.36);
        background: rgba(20, 24, 28, 0.88);
      }

      @media (max-width: 560px) {
        #${FLOATING_LINK_ID} {
          top: max(0.45rem, env(safe-area-inset-top));
          left: max(0.45rem, env(safe-area-inset-left));
          min-height: 2rem;
          max-width: min(10.5rem, calc(100vw - 0.9rem));
          padding: 0.45rem 0.66rem;
          font-size: 0.74rem;
        }
      }

      .um-auth-has-site-nav #${FLOATING_LINK_ID} {
        top: calc(max(0.65rem, env(safe-area-inset-top)) + var(${NAV_OFFSET_VAR}, 4.35rem));
      }

      @media (max-width: 720px) {
        .um-auth-has-site-nav #${FLOATING_LINK_ID} {
          top: calc(max(0.45rem, env(safe-area-inset-top)) + var(${NAV_OFFSET_VAR}, 5.8rem));
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(link);
    updateFloatingOffset();
    return link;
  }

  function updateFloatingOffset() {
    const topbar = document.querySelector(".topbar");
    if (!topbar) {
      document.documentElement.style.removeProperty(NAV_OFFSET_VAR);
      return;
    }

    const height = Math.ceil(topbar.getBoundingClientRect().height);
    document.documentElement.style.setProperty(NAV_OFFSET_VAR, `${height + 10}px`);
  }

  function setAuthLabel(link, label, signedIn = false) {
    const icon = link.querySelector("svg, i");
    link.textContent = "";
    link.href = signedIn ? profileUrl() : loginUrl();

    if (icon) {
      link.appendChild(icon);
      link.append(" ");
    }

    link.append(label);
    link.title = label === DEFAULT_LABEL ? "Sign in" : `Signed in as ${label}`;
  }

  function publishAuthState(authState) {
    window.UMAuth = authState;
    document.documentElement.dataset.authState = authState.signedIn ? "signed-in" : "signed-out";

    if (resolveInitialAuth) {
      resolveInitialAuth(window.UMAuth);
      resolveInitialAuth = null;
    }

    window.dispatchEvent(new CustomEvent("um:auth-ready", { detail: window.UMAuth }));
  }

  function paint(label, signedIn = false) {
    ensureFloatingAuthLink();
    document.querySelectorAll("[data-auth-link]").forEach((link) => {
      setAuthLabel(link, label, signedIn);
    });
  }

  function withAuthTimeout(promise) {
    let timeoutId;
    const timeout = new Promise((resolve) => {
      timeoutId = window.setTimeout(() => {
        resolve({
          user: null,
          profile: null,
          error: new Error("Auth nav check timed out.")
        });
      }, 7000);
    });

    return Promise.race([promise, timeout]).finally(() => {
      window.clearTimeout(timeoutId);
    });
  }

  async function renderAuthNav() {
    const cached = cachedLabel();
    paint(cached || DEFAULT_LABEL, !!cached);

    try {
      const auth = await import(AUTH_MODULE_URL);
      const result = await withAuthTimeout(auth.getCurrentUserAndProfile());
      const user = result.user;

      if (result.error || !user) {
        if (result.error) console.error("Auth nav profile check failed:", result.error);
        cacheLabel("");
        paint(DEFAULT_LABEL, false);
        publishAuthState({ signedIn: false, user: null, profile: null, displayName: DEFAULT_LABEL });
        return;
      }

      const profile = result.profile;
      const label = auth.displayName(profile, user.email?.split("@")[0] || "Profile");
      cacheLabel(label);
      paint(label, true);
      publishAuthState({ signedIn: true, user, profile, displayName: label });
    } catch (_error) {
      const fallback = cachedLabel() || DEFAULT_LABEL;
      paint(fallback, fallback !== DEFAULT_LABEL);
      publishAuthState({ signedIn: fallback !== DEFAULT_LABEL, user: null, profile: null, displayName: fallback });
    }
  }

  ensureFloatingAuthLink();
  renderAuthNav();

  window.addEventListener("resize", updateFloatingOffset);
  window.addEventListener("orientationchange", () => {
    window.setTimeout(updateFloatingOffset, 150);
  });

  if (window.ResizeObserver) {
    const topbar = document.querySelector(".topbar");
    if (topbar) {
      const observer = new ResizeObserver(updateFloatingOffset);
      observer.observe(topbar);
    }
  }

  window.addEventListener("um:profile-updated", (event) => {
    const profile = event.detail || null;
    const label = profile?.display_name || profile?.username || cachedLabel() || DEFAULT_LABEL;
    cacheLabel(label);
    paint(label, label !== DEFAULT_LABEL);
    renderAuthNav();
  });

  import(AUTH_MODULE_URL).then((auth) => {
    auth.supabase.auth.onAuthStateChange(() => {
      renderAuthNav();
    });
  }).catch(() => {});
})();
