(function () {
  const ENDPOINT = "https://dbkrtdzppymjxutivsmo.supabase.co/functions/v1/chat";
  const HISTORY_KEY = "umArchivistAiHistory";
  const OPEN_KEY = "umArchivistAiOpen";
  const MAX_HISTORY = 30;
  const API_MESSAGE_LIMIT = 4;
  const REQUEST_TIMEOUT_MS = 20000;
  const DEBUG = window.localStorage.getItem("umArchivistAiDebug") === "1";
  const FALLBACK_REPLY = "Archivist AI is having trouble reaching the archive right now. Give it a minute and try again.";
  const TIMEOUT_REPLY = "Archivist AI took too long to answer. Free robot brain is slow today.";
  const VALID_NAV_PATHS = new Set([
    "/",
    "/pages/profile.html",
    "/pages/login.html",
    "/pages/forum.html",
    "/pages/games.html",
    "/pages/live.html",
    "/pages/chat.html",
    "/pages/archive.html"
  ]);
  const NAV_ROUTES = [
    {
      path: "/pages/games.html",
      phrases: [
        "games",
        "game page",
        "arcade",
        "leaderboard",
        "leaderboards",
        "scores",
        "high scores"
      ]
    },
    {
      path: "/pages/forum.html",
      phrases: [
        "forum",
        "forums",
        "posts",
        "discussion",
        "discussions"
      ]
    },
    {
      path: "/pages/archive.html",
      phrases: [
        "archive",
        "audio",
        "speeches",
        "historical speeches",
        "speech",
        "old speeches",
        "recordings"
      ]
    },
    {
      path: "/pages/live.html",
      phrases: [
        "live",
        "livestream",
        "stream",
        "youtube",
        "broadcast"
      ]
    },
    {
      path: "/pages/chat.html",
      phrases: [
        "chat",
        "chat rooms",
        "rooms",
        "global chat",
        "stream chat"
      ]
    },
    {
      path: "/pages/profile.html",
      phrases: [
        "profile",
        "my profile",
        "account"
      ]
    },
    {
      path: "/pages/login.html",
      phrases: [
        "login",
        "log in",
        "sign in",
        "signup",
        "sign up"
      ]
    },
    {
      path: "/",
      phrases: [
        "home",
        "homepage",
        "main page"
      ]
    }
  ];
  const NAV_ACTION_WORDS = new Set([
    "open",
    "go",
    "take",
    "show",
    "pull",
    "bring",
    "send",
    "navigate",
    "launch"
  ]);

  if (window.UMArchivistAIWidgetLoaded) return;
  window.UMArchivistAIWidgetLoaded = true;

  let history = loadHistory();
  let panel;
  let historyNode;
  let input;
  let sendButton;
  let pending = false;

  function loadHistory() {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((message) => {
          return (
            message &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" &&
            message.content.trim()
          );
        })
        .map((message) => ({
          role: message.role,
          content: message.content,
          navigateTo: validNavigatePath(message.navigateTo) ? message.navigateTo : ""
        }))
        .slice(-MAX_HISTORY);
    } catch (error) {
      console.error("Archivist AI history load failed:", error);
      return [];
    }
  }

  function saveHistory() {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
    } catch (error) {
      console.error("Archivist AI history save failed:", error);
    }
  }

  function setOpen(isOpen) {
    panel.hidden = !isOpen;
    try {
      window.localStorage.setItem(OPEN_KEY, isOpen ? "1" : "0");
    } catch (error) {
      console.error("Archivist AI open state save failed:", error);
    }

    if (isOpen) {
      window.setTimeout(() => input.focus(), 0);
    }
  }

  function wasOpen() {
    try {
      return window.localStorage.getItem(OPEN_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function messageNode(message, options = {}) {
    const item = createElement("article", `um-ai-message ${message.role}${options.pending ? " pending" : ""}`);
    const role = createElement("span", "um-ai-message-role", message.role === "user" ? "You" : "Archivist AI");
    const copy = createElement("p", "um-ai-message-text", message.content);
    item.append(role, copy);

    if (validNavigatePath(message.navigateTo)) {
      const link = createElement("a", "um-ai-message-link", "Open page");
      link.href = message.navigateTo;
      item.appendChild(link);
    }

    return item;
  }

  function renderHistory() {
    historyNode.replaceChildren();

    const intro = createElement(
      "div",
      "um-ai-intro",
      "I am Archivist AI. Ask me to help find speeches, PDFs, livestream info, games, forum context, or anything else around Uncensored Media."
    );
    historyNode.appendChild(intro);

    history.forEach((message) => historyNode.appendChild(messageNode(message)));

    if (pending) {
      historyNode.appendChild(messageNode({
        role: "assistant",
        content: "Archivist AI is typing..."
      }, { pending: true }));
    }

    historyNode.scrollTop = historyNode.scrollHeight;
  }

  function setSending(isSending) {
    pending = isSending;
    input.disabled = isSending;
    sendButton.disabled = isSending;
    sendButton.textContent = isSending ? "Sending" : "Send";
    renderHistory();
  }

  function waitForNextFrame() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  function isTimeoutError(error) {
    const message = String(error?.message || "").toLowerCase();
    return (
      error?.name === "AbortError" ||
      message.includes("timed out") ||
      message.includes("taking too long") ||
      message.includes("aborted")
    );
  }

  function validNavigatePath(path) {
    return typeof path === "string" && VALID_NAV_PATHS.has(path);
  }

  function normalizeNavigationText(message) {
    return String(message || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasNavigationAction(cleanText) {
    return cleanText.split(" ").some((word) => NAV_ACTION_WORDS.has(word));
  }

  function hasRoutePhrase(cleanText, phrase) {
    return new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "i").test(cleanText);
  }

  function detectNavigationIntent(message) {
    const cleanText = normalizeNavigationText(message);
    console.log("Navigation intent checked", cleanText);

    if (!cleanText) {
      console.log("No navigation intent", cleanText);
      return "";
    }

    const exactRoute = NAV_ROUTES.find((route) => route.phrases.includes(cleanText));
    if (exactRoute) {
      console.log("Navigation matched", exactRoute.path);
      return exactRoute.path;
    }

    if (!hasNavigationAction(cleanText)) {
      console.log("No navigation intent", cleanText);
      return "";
    }

    const matchedRoute = NAV_ROUTES.find((route) => route.phrases.some((phrase) => hasRoutePhrase(cleanText, phrase)));
    if (matchedRoute) {
      console.log("Navigation matched", matchedRoute.path);
      return matchedRoute.path;
    }

    console.log("No navigation intent", cleanText);
    return "";
  }

  function navigateAfterRender(path) {
    if (!validNavigatePath(path)) {
      console.error("Archivist AI refused invalid navigateTo path:", path);
      return;
    }

    console.log("Archivist navigation requested", path);
    window.setTimeout(() => {
      try {
        window.location.href = path;
      } catch (error) {
        console.error("Archivist AI navigation failed:", {
          navigateTo: path,
          error
        });
        renderHistory();
      }
    }, 300);
  }

  async function fetchReply(messages) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const apiMessages = messages.slice(-API_MESSAGE_LIMIT).map((message) => ({
      role: message.role,
      content: message.content
    }));

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal
      });

      const responseText = await response.text();

      if (!response.ok) {
        console.error("Archivist AI endpoint failed:", {
          status: response.status,
          statusText: response.statusText,
          responseText
        });

        let details = responseText;
        try {
          const errorJson = responseText ? JSON.parse(responseText) : null;
          details = errorJson?.details || errorJson?.error || responseText;
        } catch (parseError) {
          console.error("Archivist AI error response JSON parse failed:", {
            status: response.status,
            statusText: response.statusText,
            responseText,
            parseError
          });
        }

        throw new Error(details || `Archivist endpoint returned ${response.status}.`);
      }

      let data = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
        console.error("Archivist AI response JSON parse failed:", {
          status: response.status,
          statusText: response.statusText,
          responseText,
          parseError
        });
        throw new Error("Archivist endpoint returned invalid JSON.");
      }

      const reply = String(data?.reply || "").trim();
      if (!reply) {
        console.error("Archivist AI response missing reply:", {
          status: response.status,
          statusText: response.statusText,
          responseText,
          parsedResponse: data
        });
        throw new Error(data?.error || "Archivist endpoint returned an empty reply.");
      }

      const navigateTo = String(data?.navigateTo || "").trim();
      if (navigateTo && !validNavigatePath(navigateTo)) {
        console.error("Archivist AI received invalid navigateTo path:", {
          navigateTo,
          parsedResponse: data
        });
      }

      return {
        reply,
        navigateTo: validNavigatePath(navigateTo) ? navigateTo : ""
      };
    } catch (error) {
      if (isTimeoutError(error)) {
        if (DEBUG) {
          console.error("Archivist AI request timed out:", {
            timeoutMs: REQUEST_TIMEOUT_MS,
            error
          });
        }
        throw new Error(TIMEOUT_REPLY);
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    const content = input.value.trim();
    if (!content || pending) return;

    const route = detectNavigationIntent(content);

    if (route) {
      input.value = "";
      history = [...history, {
        role: "user",
        content
      }, {
        role: "assistant",
        content: "Fine. Opening it now, genius.",
        navigateTo: route
      }].slice(-MAX_HISTORY);
      saveHistory();
      renderHistory();
      navigateAfterRender(route);
      return;
    }

    input.value = "";
    history = [...history, { role: "user", content }].slice(-MAX_HISTORY);
    saveHistory();
    setSending(true);

    let navigateTo = "";

    try {
      await waitForNextFrame();
      const result = await fetchReply(history);
      navigateTo = result.navigateTo;
      history = [...history, {
        role: "assistant",
        content: result.reply,
        navigateTo
      }].slice(-MAX_HISTORY);
    } catch (error) {
      if (isTimeoutError(error)) {
        if (DEBUG) console.error("Archivist AI request failed:", error);
      } else {
        console.error("Archivist AI request failed:", error);
      }
      const reply = isTimeoutError(error) ? TIMEOUT_REPLY : FALLBACK_REPLY;
      history = [...history, { role: "assistant", content: reply }].slice(-MAX_HISTORY);
    } finally {
      saveHistory();
      setSending(false);
      if (navigateTo) navigateAfterRender(navigateTo);
    }
  }

  function clearChat() {
    history = [];
    saveHistory();
    renderHistory();
    input.focus();
  }

  function buildWidget() {
    const root = createElement("div", "um-ai-widget");
    root.setAttribute("aria-live", "polite");

    panel = createElement("section", "um-ai-panel");
    panel.hidden = true;
    panel.setAttribute("aria-label", "Archivist AI chat panel");

    const header = createElement("div", "um-ai-header");
    const title = createElement("div", "um-ai-title");
    title.append(createElement("strong", "", "Archivist AI"), createElement("span", "", "Site assistant"));

    const actions = createElement("div", "um-ai-actions");
    const clearButton = createElement("button", "um-ai-icon-button", "Clear");
    clearButton.type = "button";
    clearButton.setAttribute("aria-label", "Clear Archivist AI chat");
    clearButton.addEventListener("click", clearChat);

    const closeButton = createElement("button", "um-ai-icon-button", "X");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Minimize Archivist AI");
    closeButton.addEventListener("click", () => setOpen(false));

    actions.append(clearButton, closeButton);
    header.append(title, actions);

    historyNode = createElement("div", "um-ai-history");
    historyNode.setAttribute("role", "log");
    historyNode.setAttribute("aria-label", "Archivist AI message history");

    const form = createElement("form", "um-ai-form");
    const inputRow = createElement("div", "um-ai-input-row");
    input = createElement("input", "um-ai-input");
    input.type = "text";
    input.maxLength = 1200;
    input.placeholder = "Ask Archivist AI...";
    input.autocomplete = "off";

    sendButton = createElement("button", "um-ai-send", "Send");
    sendButton.type = "submit";
    inputRow.append(input, sendButton);
    form.append(inputRow, createElement("div", "um-ai-helper", "Saved locally on this device. No API keys are stored in the browser."));
    form.addEventListener("submit", sendMessage);

    panel.append(header, historyNode, form);

    const toggle = createElement("button", "um-ai-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Open Archivist AI");
    toggle.append(createElement("span", "um-ai-toggle-mark", "AI"), document.createTextNode("Archivist AI"));
    toggle.addEventListener("click", () => setOpen(panel.hidden));

    root.append(panel, toggle);
    document.body.appendChild(root);
    document.body.classList.add("um-ai-widget-present");

    renderHistory();
    setOpen(wasOpen());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget, { once: true });
  } else {
    buildWidget();
  }
})();
