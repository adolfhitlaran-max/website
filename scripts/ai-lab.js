const AI_CHAT_ENDPOINT = "https://dbkrtdzppymjxutivsmo.supabase.co/functions/v1/ai-chat";

const tools = [
  {
    id: "chat",
    title: "Chat AI",
    icon: "CH",
    description: "Ask the backend AI directly. This one is live, so try to ask something better than a printer diagnostic.",
    prompt: "Ask Archivist AI anything...",
    meta: "Tone, format, or context",
    action: "Send",
    live: true
  },
  {
    id: "image",
    title: "Image Generator",
    icon: "IM",
    description: "Draft image prompts and mock image generation jobs before a real image provider gets plugged in.",
    prompt: "Describe the image...",
    meta: "Style, size, mood",
    action: "Generate Image",
    upload: { accept: "image/*", multiple: false }
  },
  {
    id: "video",
    title: "Video Generator",
    icon: "VI",
    description: "Plan short video generations with a prompt, target format, and optional reference upload.",
    prompt: "Describe the video scene...",
    meta: "Duration, aspect ratio, pacing",
    action: "Generate Video",
    upload: { accept: "image/*,video/*", multiple: false }
  },
  {
    id: "ocr",
    title: "OCR",
    icon: "OC",
    description: "Mock text extraction from images or PDFs. Real OCR can drop into this slot later.",
    prompt: "What should the OCR focus on?",
    meta: "Language or extraction notes",
    action: "Extract Text",
    upload: { accept: "image/*,.pdf", multiple: false }
  },
  {
    id: "background",
    title: "Background Remover",
    icon: "BG",
    description: "Queue a background removal job with a source image and output notes.",
    prompt: "Describe what should stay in the image...",
    meta: "Output background or edge style",
    action: "Remove Background",
    upload: { accept: "image/*", multiple: false }
  },
  {
    id: "upscaler",
    title: "Upscaler",
    icon: "UP",
    description: "Mock an image upscaling request with target detail level and cleanup notes.",
    prompt: "Describe enhancement priorities...",
    meta: "Scale factor or target use",
    action: "Upscale",
    upload: { accept: "image/*", multiple: false }
  },
  {
    id: "voice",
    title: "Voice AI",
    icon: "VO",
    description: "Draft voice generation or voice cleanup jobs with optional reference audio.",
    prompt: "Write the voice line or describe the voice task...",
    meta: "Voice style, speed, emotion",
    action: "Generate Voice",
    upload: { accept: "audio/*", multiple: false }
  },
  {
    id: "music",
    title: "Music Generator",
    icon: "MU",
    description: "Sketch a music generation brief: genre, tempo, mood, and where the track should go.",
    prompt: "Describe the track...",
    meta: "Genre, BPM, length",
    action: "Generate Music"
  },
  {
    id: "prompt",
    title: "Prompt Enhancer",
    icon: "PE",
    description: "Turn rough prompts into cleaner, more controllable prompts for other AI tools.",
    prompt: "Paste the messy prompt...",
    meta: "Target model or output format",
    action: "Enhance Prompt"
  },
  {
    id: "lore",
    title: "Lore Generator",
    icon: "LO",
    description: "Generate worldbuilding notes, factions, artifacts, timelines, and strange little backstory piles.",
    prompt: "Describe the world, character, faction, or artifact...",
    meta: "Tone, era, genre",
    action: "Generate Lore"
  },
  {
    id: "code",
    title: "Code Helper",
    icon: "CO",
    description: "Ask for code help, debugging notes, or implementation planning. Uploads are mocked for now.",
    prompt: "Describe the bug or feature...",
    meta: "Language, framework, file path",
    action: "Help With Code",
    upload: { accept: ".txt,.js,.ts,.html,.css,.json,.md", multiple: true }
  }
];

const state = {
  activeId: tools[0].id,
  chatMessages: []
};

const els = {
  tabs: document.getElementById("toolTabs"),
  kicker: document.getElementById("toolKicker"),
  title: document.getElementById("toolTitle"),
  description: document.getElementById("toolDescription"),
  status: document.getElementById("toolStatus"),
  form: document.getElementById("toolForm"),
  prompt: document.getElementById("toolPrompt"),
  meta: document.getElementById("toolMeta"),
  uploadRow: document.getElementById("uploadRow"),
  file: document.getElementById("toolFile"),
  fileList: document.getElementById("fileList"),
  button: document.getElementById("generateButton"),
  clear: document.getElementById("clearButton"),
  output: document.getElementById("toolOutput"),
  activeToolStat: document.getElementById("activeToolStat"),
  backendStat: document.getElementById("backendStat")
};

function activeTool() {
  return tools.find((tool) => tool.id === state.activeId) || tools[0];
}

function renderTabs() {
  els.tabs.replaceChildren(...tools.map((tool) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = tool.id === state.activeId ? "tool-tab active" : "tool-tab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", tool.id === state.activeId ? "true" : "false");
    button.dataset.tool = tool.id;

    const icon = document.createElement("i");
    icon.textContent = tool.icon;
    const label = document.createElement("span");
    label.textContent = tool.title;
    button.append(icon, label);
    button.addEventListener("click", () => selectTool(tool.id));
    return button;
  }));
}

function selectTool(id) {
  state.activeId = id;
  const tool = activeTool();
  renderTabs();
  renderTool(tool);
}

function renderTool(tool) {
  els.kicker.textContent = tool.live ? "Live Backend" : "Mock Tool";
  els.title.textContent = tool.title;
  els.description.textContent = tool.description;
  els.prompt.placeholder = tool.prompt;
  els.meta.placeholder = tool.meta;
  els.button.textContent = tool.action;
  els.activeToolStat.textContent = tool.title;
  els.backendStat.textContent = tool.live ? "ai-chat" : "mock";
  els.output.textContent = tool.live ? renderChatHistory() || "Ask a question and the ai-chat function will answer here." : "Output will show up here.";
  setStatus(tool.live ? "Chat AI is connected to the ai-chat backend." : "Provider not wired yet. This tool returns a clean mock response.", tool.live ? "ok" : "");
  setUpload(tool);
  setLoading(false);
}

function setUpload(tool) {
  els.file.value = "";
  els.fileList.textContent = "No file selected.";

  if (!tool.upload) {
    els.uploadRow.classList.remove("active");
    els.file.removeAttribute("accept");
    els.file.removeAttribute("multiple");
    return;
  }

  els.uploadRow.classList.add("active");
  els.file.accept = tool.upload.accept;
  els.file.multiple = Boolean(tool.upload.multiple);
}

function setStatus(message, type = "") {
  els.status.className = `status-line ${type}`.trim();
  els.status.textContent = message;
}

function setLoading(isLoading) {
  els.button.disabled = isLoading;
  els.button.textContent = isLoading ? "Working..." : activeTool().action;
  els.output.classList.toggle("loading", isLoading);
}

function selectedFiles() {
  return [...(els.file.files || [])];
}

function fileSummary() {
  const files = selectedFiles();
  if (!files.length) return "No file uploaded.";
  return files.map((file) => `${file.name} (${formatBytes(file.size)})`).join(", ");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

async function handleSubmit(event) {
  event.preventDefault();

  const tool = activeTool();
  const prompt = els.prompt.value.trim();
  const meta = els.meta.value.trim();

  if (!prompt && !selectedFiles().length) {
    setStatus("Give the tool a prompt or a file. Ideally both, because we are not mind readers.", "error");
    return;
  }

  setLoading(true);
  setStatus(`${tool.title} is working...`);
  els.output.textContent = "Thinking. Dramatically, of course.";

  try {
    if (tool.id === "chat") {
      await runChat([prompt, meta && `Context: ${meta}`].filter(Boolean).join("\n\n"));
      return;
    }

    const text = await runMockTool(tool, prompt, meta);
    els.output.textContent = text;
    setStatus(`${tool.title} mock output ready. Provider wiring can come next.`, "ok");
  } catch (error) {
    console.error(`${tool.title} failed:`, error);
    els.output.textContent = error.message || "The tool fell over. Very elegant.";
    setStatus(`${tool.title} failed. Check the console for the ugly bits.`, "error");
  } finally {
    setLoading(false);
  }
}

async function runChat(prompt) {
  if (!prompt) {
    throw new Error("Type a chat message first. Revolutionary concept.");
  }

  state.chatMessages = [...state.chatMessages, { role: "user", content: prompt }].slice(-8);

  const response = await fetch(AI_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: state.chatMessages.slice(-6)
    })
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    console.error("ai-chat JSON parse failed:", { responseText, error });
    throw new Error("ai-chat returned invalid JSON.");
  }

  if (!response.ok || data?.ok === false) {
    console.error("ai-chat request failed:", {
      status: response.status,
      responseText,
      data
    });
    throw new Error(data?.details || data?.error || `ai-chat returned ${response.status}.`);
  }

  const reply = String(data?.text || data?.reply || "").trim();
  if (!reply) throw new Error("ai-chat returned an empty response.");

  state.chatMessages = [...state.chatMessages, { role: "assistant", content: reply }].slice(-8);
  els.output.textContent = renderChatHistory();
  setStatus(`Chat AI replied through ${data?.provider || "ai-chat"}${data?.model ? ` (${data.model})` : ""}.`, "ok");
}

function runMockTool(tool, prompt, meta) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve([
        `${tool.title} mock response`,
        "",
        `Prompt: ${prompt || "No prompt supplied."}`,
        `Details: ${meta || "No extra details."}`,
        `Uploads: ${fileSummary()}`,
        "",
        mockSuggestion(tool.id, prompt)
      ].join("\n"));
    }, 700);
  });
}

function mockSuggestion(id, prompt) {
  const clean = prompt || "your idea";
  const suggestions = {
    image: `Image brief drafted for: ${clean}. Next provider should return preview URLs and seed info.`,
    video: `Video brief staged for: ${clean}. Next provider should return storyboard beats and a render job id.`,
    ocr: "OCR placeholder ready. Real provider should return extracted text plus confidence notes.",
    background: "Background removal placeholder ready. Real provider should return a transparent PNG URL.",
    upscaler: "Upscale placeholder ready. Real provider should return original/enhanced comparison data.",
    voice: "Voice job placeholder ready. Real provider should return an audio URL and transcript.",
    music: "Music brief placeholder ready. Real provider should return track URL, duration, and license notes.",
    prompt: `Enhanced prompt draft: Create a precise, high-signal version of "${clean}" with constraints, style, and output format.`,
    lore: `Lore seed: ${clean} becomes a faction, relic, or timeline entry with motive, conflict, and consequence.`,
    code: "Code helper placeholder ready. Real provider should return patch suggestions, risks, and test notes."
  };

  return suggestions[id] || "Mock output ready.";
}

function renderChatHistory() {
  return state.chatMessages
    .map((message) => `${message.role === "user" ? "You" : "AI"}: ${message.content}`)
    .join("\n\n");
}

function clearTool() {
  els.prompt.value = "";
  els.meta.value = "";
  els.file.value = "";
  els.fileList.textContent = "No file selected.";

  if (activeTool().id === "chat") state.chatMessages = [];
  renderTool(activeTool());
}

function boot() {
  renderTabs();
  renderTool(activeTool());
  els.form.addEventListener("submit", handleSubmit);
  els.clear.addEventListener("click", clearTool);
  els.file.addEventListener("change", () => {
    els.fileList.textContent = fileSummary();
  });
}

boot();
