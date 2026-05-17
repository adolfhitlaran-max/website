(function () {
  const script = document.currentScript;
  const title = script?.dataset.title || "This page";
  const backHref = script?.dataset.back || "../";

  const style = document.createElement("style");
  style.textContent = `
    html.um-coming-soon-locked,
    html.um-coming-soon-locked body {
      overflow: hidden !important;
    }

    .um-coming-soon-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483300;
      display: grid;
      place-items: center;
      padding: 1rem;
      background:
        linear-gradient(135deg, rgba(229, 36, 42, 0.18), transparent 32rem),
        linear-gradient(315deg, rgba(0, 213, 255, 0.14), transparent 32rem),
        rgba(5, 6, 7, 0.94);
      color: #f5efe2;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .um-coming-soon-card {
      width: min(100%, 32rem);
      border: 1px solid rgba(255, 184, 61, 0.34);
      border-radius: 8px;
      padding: clamp(1rem, 4vw, 1.35rem);
      background: rgba(10, 13, 15, 0.94);
      box-shadow: 0 28px 80px rgba(0, 0, 0, 0.52);
    }

    .um-coming-soon-card p {
      margin: 0 0 1rem;
      color: rgba(245, 239, 226, 0.76);
    }

    .um-coming-soon-card h1 {
      margin: 0 0 0.75rem;
      color: #fff;
      font-size: clamp(2rem, 8vw, 3.2rem);
      line-height: 0.95;
      text-transform: uppercase;
    }

    .um-coming-soon-kicker {
      color: #ffb83d;
      font-size: 0.76rem;
      font-weight: 950;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .um-coming-soon-button {
      min-height: 3rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(245, 239, 226, 0.18);
      border-radius: 999px;
      padding: 0.72rem 1rem;
      background: #f5efe2;
      color: #050607;
      font-weight: 950;
      text-decoration: none;
    }
  `;
  document.head.appendChild(style);
  document.documentElement.classList.add("um-coming-soon-locked");

  function showOverlay() {
    if (document.querySelector(".um-coming-soon-overlay")) return;
    const overlay = document.createElement("div");
    overlay.className = "um-coming-soon-overlay";
    overlay.innerHTML = `
      <section class="um-coming-soon-card">
        <p class="um-coming-soon-kicker">Coming Soon</p>
        <h1>${title}</h1>
        <p>This game is visible on the shelf, but it is disabled until it is ready for launch.</p>
        <a class="um-coming-soon-button" href="${backHref}">Back to Games</a>
      </section>
    `;
    document.body.appendChild(overlay);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showOverlay, { once: true });
  } else {
    showOverlay();
  }
})();
