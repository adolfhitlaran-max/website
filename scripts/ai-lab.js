import { getCurrentUserAndProfile, supabase } from "../js/supabaseClient.js";

const AI_CHAT_ENDPOINT = "https://dbkrtdzppymjxutivsmo.supabase.co/functions/v1/ai-chat";
const AI_IMAGE_ENDPOINT = "https://dbkrtdzppymjxutivsmo.supabase.co/functions/v1/ai-image";

const tools = [
  {
    id: "chat",
    title: "Chat AI",
    icon: "CH",
    description: "Ask the backend AI directly. This one is live, so try to ask something better than a printer diagnostic.",
    prompt: "Ask Archivist AI anything...",
    meta: "Tone, format, or context",
    action: "Send",
    live: true,
    endpoint: "ai-chat"
  },
  {
    id: "image",
    title: "Image Generator",
    icon: "IM",
    description: "Generate real images through the ai-image Hugging Face backend.",
    prompt: "Describe the image...",
    meta: "Style and aspect ratio, like cinematic 16:9",
    action: "Generate Image",
    live: true,
    endpoint: "ai-image"
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
    description: "Extract readable text from images locally in your browser with Tesseract.js.",
    prompt: "Optional OCR notes...",
    meta: "Language or extraction notes",
    action: "Extract Text",
    browserTool: "tesseract",
    upload: { accept: "image/*", multiple: false }
  },
  {
    id: "background",
    title: "Background Remover",
    icon: "BG",
    description: "Remove an image background locally in your browser and export a transparent PNG.",
    prompt: "Optional notes for the cutout...",
    meta: "Optional subject notes",
    action: "Remove Background",
    browserTool: "background-removal",
    upload: { accept: "image/*", multiple: false }
  },
  {
    id: "upscaler",
    title: "Upscaler",
    icon: "UP",
    description: "Upscale images locally with browser canvas smoothing, optional sharpening, and PNG export.",
    prompt: "Optional enhancement notes...",
    meta: "Optional target use",
    action: "Upscale",
    browserTool: "canvas-upscaler",
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
    action: "Enhance Prompt",
    live: true,
    endpoint: "ai-chat"
  },
  {
    id: "lore",
    title: "Lore Generator",
    icon: "LO",
    description: "Generate worldbuilding notes, factions, artifacts, timelines, and strange little backstory piles.",
    prompt: "Describe the world, character, faction, or artifact...",
    meta: "Tone, era, genre",
    action: "Generate Lore",
    live: true,
    endpoint: "ai-chat"
  },
  {
    id: "code",
    title: "Code Helper",
    icon: "CO",
    description: "Debug, explain, refactor, review, or generate code using pasted snippets and uploaded project files.",
    prompt: "Describe the bug or feature...",
    meta: "Language, framework, file path",
    action: "Help With Code",
    live: true,
    endpoint: "ai-chat",
    upload: { accept: ".js,.ts,.html,.css,.json,.md", multiple: true }
  },
  {
    id: "social",
    title: "Social Post Generator",
    icon: "SO",
    description: "Create short X/Twitter-style posts with hooks, punch, and no corporate beige fog.",
    prompt: "What should the post say or promote?",
    meta: "Tone, audience, number of variants",
    action: "Generate Posts",
    aiTool: "social"
  }
];

const aiToolPrompts = {
  social: {
    system: [
      "You write short X/Twitter-style posts.",
      "Create punchy posts with strong hooks, concise wording, and optional hashtags only when useful.",
      "Avoid long threads unless requested.",
      "Default to 5 variants, each under 280 characters."
    ].join(" ")
  }
};

const PROMPT_ENHANCER_SYSTEM_PROMPT = "You are a prompt engineer. Rewrite the user's rough prompt into a detailed, high-quality prompt. Preserve the original idea, add concrete details, style, composition, lighting, mood, constraints, and output format. Do not add commentary. Only return the improved prompt.";
const LORE_GENERATOR_SYSTEM_PROMPT = "You are a worldbuilding and game-lore assistant. Generate rich, usable lore from the user's idea. Include name, summary, visual identity, history, conflict, secrets, hooks, and how it could be used in a game or story. Match the selected type and tone. Avoid generic filler.";
const CODE_HELPER_BASE_PROMPT = "You are a senior software engineering assistant. Use the user's pasted code, request, and uploaded files as context. Preserve indentation in code. Use markdown code blocks for code. Explain important changes, but do not ramble. If something is uncertain, state the assumption briefly.";

const promptModeInstructions = {
  "Image Prompt": "Optimize the improved prompt for image generation. Emphasize subject, visual composition, camera/framing, lighting, style, mood, texture, color, negative constraints if useful, and a clear image output format.",
  "Story/Lore Prompt": "Optimize the improved prompt for worldbuilding and lore generation. Emphasize setting, factions, characters, conflicts, myths, locations, timeline hooks, tone, and the desired structured output.",
  "Code Prompt": "Optimize the improved prompt for coding help. Emphasize goal, environment, language/framework, constraints, expected behavior, error context, deliverables, and verification steps."
};

const codeModePrompts = {
  Debug: "You are a senior debugging assistant. Find the bug, explain the root cause, and propose the smallest safe fix.",
  Explain: "You are a senior code explainer. Explain what the code does, how the important pieces interact, and call out confusing or risky parts.",
  Refactor: "You are a senior software engineer. Refactor the code for readability and maintainability without breaking functionality.",
  Optimize: "You are a performance-minded engineer. Identify practical optimizations, explain tradeoffs, and provide improved code where useful.",
  "Generate Feature": "You are a feature implementation assistant. Generate production-ready code that integrates with the existing project.",
  "Security Review": "You are a security review assistant. Find realistic vulnerabilities, explain impact, and propose safe fixes without inventing issues.",
  "Supabase Help": "You are a Supabase implementation assistant. Help with Supabase auth, RLS, SQL, Edge Functions, storage, and frontend integration."
};

const state = {
  activeId: tools[0].id,
  chatMessages: [],
  lastEnhancedPrompt: "",
  lastPromptEnhanced: "",
  lastLoreOutput: "",
  lastCodeOutput: "",
  lastOcrText: "",
  lastBackgroundBlob: null,
  lastBackgroundUrl: "",
  lastBackgroundOriginalName: "",
  lastUpscaledBlob: null,
  lastUpscaledUrl: "",
  lastUpscalerOriginalUrl: "",
  lastUpscalerOriginalName: "",
  lastImageRequest: null,
  lastImageResult: null,
  galleryLoaded: false
};

let backgroundRemovalModulePromise = null;

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
  imageControls: document.getElementById("imageControls"),
  imageStyle: document.getElementById("imageStyle"),
  imageAspectRatio: document.getElementById("imageAspectRatio"),
  imageNegativePrompt: document.getElementById("imageNegativePrompt"),
  enhanceImagePrompt: document.getElementById("enhanceImagePromptButton"),
  useEnhancedPrompt: document.getElementById("useEnhancedPromptButton"),
  generateSimilar: document.getElementById("generateSimilarButton"),
  copyImagePrompt: document.getElementById("copyImagePromptButton"),
  enhancedPromptPreview: document.getElementById("enhancedPromptPreview"),
  promptControls: document.getElementById("promptControls"),
  promptMode: document.getElementById("promptMode"),
  promptOutputActions: document.getElementById("promptOutputActions"),
  copyEnhancedPrompt: document.getElementById("copyEnhancedPromptButton"),
  sendPromptToImage: document.getElementById("sendPromptToImageButton"),
  sendPromptToLore: document.getElementById("sendPromptToLoreButton"),
  loreControls: document.getElementById("loreControls"),
  loreType: document.getElementById("loreType"),
  loreTone: document.getElementById("loreTone"),
  loreOutputActions: document.getElementById("loreOutputActions"),
  copyLore: document.getElementById("copyLoreButton"),
  sendLoreToPrompt: document.getElementById("sendLoreToPromptButton"),
  sendLoreToImage: document.getElementById("sendLoreToImageButton"),
  codeControls: document.getElementById("codeControls"),
  codeMode: document.getElementById("codeMode"),
  codeLanguage: document.getElementById("codeLanguage"),
  codeOutputActions: document.getElementById("codeOutputActions"),
  copyCode: document.getElementById("copyCodeButton"),
  downloadCodeResponse: document.getElementById("downloadCodeResponseButton"),
  sendCodeToPrompt: document.getElementById("sendCodeToPromptButton"),
  ocrOutputActions: document.getElementById("ocrOutputActions"),
  copyOcrText: document.getElementById("copyOcrTextButton"),
  downloadOcrText: document.getElementById("downloadOcrTextButton"),
  sendOcrToChat: document.getElementById("sendOcrToChatButton"),
  sendOcrToCode: document.getElementById("sendOcrToCodeButton"),
  backgroundOutputActions: document.getElementById("backgroundOutputActions"),
  downloadBackgroundPng: document.getElementById("downloadBackgroundPngButton"),
  sendBackgroundToImage: document.getElementById("sendBackgroundToImageButton"),
  upscalerControls: document.getElementById("upscalerControls"),
  upscalerScale: document.getElementById("upscalerScale"),
  upscalerSharpen: document.getElementById("upscalerSharpen"),
  upscalerOutputActions: document.getElementById("upscalerOutputActions"),
  downloadUpscaledPng: document.getElementById("downloadUpscaledPngButton"),
  button: document.getElementById("generateButton"),
  clear: document.getElementById("clearButton"),
  output: document.getElementById("toolOutput"),
  imageGallery: document.getElementById("imageGallery"),
  imageGalleryStatus: document.getElementById("imageGalleryStatus"),
  imageGalleryGrid: document.getElementById("imageGalleryGrid")
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
  const backendPowered = isBackendTool(tool);
  const imageGenerator = isImageGenerator(tool);
  const browserTool = isBrowserTool(tool);
  els.kicker.textContent = imageGenerator
    ? "Live Image Backend"
    : browserTool
      ? "Live Browser Tool"
      : backendPowered
        ? "Live Ollama Backend"
        : "Prototype Tool";
  els.title.textContent = tool.title;
  els.description.textContent = tool.description;
  els.prompt.placeholder = tool.prompt;
  els.meta.placeholder = tool.meta;
  els.button.textContent = tool.action;
  els.output.textContent = outputIntro(tool);
  setStatus(
    backendPowered || browserTool
      ? backendStatusMessage(tool)
      : "Provider not wired yet. This tool returns a prototype placeholder.",
    backendPowered || browserTool ? "ok" : ""
  );
  setUpload(tool);
  setPromptControls(tool);
  setLoreControls(tool);
  setCodeControls(tool);
  setOcrControls(tool);
  setBackgroundControls(tool);
  setUpscalerControls(tool);
  setImageControls(tool);
  setLoading(false);

  if (isImageGenerator(tool)) {
    void loadImageGallery();
  }
}

function isBackendTool(tool) {
  return Boolean(tool.live || tool.aiTool);
}

function isBrowserTool(tool) {
  return Boolean(tool.browserTool);
}

function isImageGenerator(tool) {
  return tool.id === "image";
}

function isPromptEnhancer(tool) {
  return tool.id === "prompt";
}

function isLoreGenerator(tool) {
  return tool.id === "lore";
}

function isCodeHelper(tool) {
  return tool.id === "code";
}

function isOcrTool(tool) {
  return tool.id === "ocr";
}

function isBackgroundRemover(tool) {
  return tool.id === "background";
}

function isUpscalerTool(tool) {
  return tool.id === "upscaler";
}

function backendStatusMessage(tool) {
  if (tool.endpoint === "ai-image") return "Image Generator is connected to ai-image.";
  if (tool.browserTool === "tesseract") return "OCR is powered by Tesseract.js locally in your browser. No image upload or API key needed.";
  if (tool.browserTool === "background-removal") return "Browser background removal runs locally and exports a transparent PNG. No Supabase upload or API key needed.";
  if (tool.browserTool === "canvas-upscaler") return "Browser Canvas upscales images locally with smoothing and optional sharpening. No Supabase upload or API key needed.";
  if (tool.id === "prompt") return "Prompt Enhancer is connected to ai-chat / Ollama.";
  if (tool.id === "lore") return "Lore Generator is connected to ai-chat / Ollama.";
  if (tool.id === "code") return "Code Helper is connected to ai-chat / Ollama.";
  if (tool.endpoint === "ai-chat") return "Chat AI is connected to ai-chat.";
  return `${tool.title} is connected to ai-chat and the configured Ollama backend.`;
}

function outputIntro(tool) {
  if (tool.id === "chat") {
    return renderChatHistory() || "Ask a question and the ai-chat function will answer here.";
  }

  if (isImageGenerator(tool)) {
    return `${tool.title} output will show up here.`;
  }

  if (isOcrTool(tool)) {
    return "Upload an image and OCR text will show up here.";
  }

  if (isBackgroundRemover(tool)) {
    return "Upload an image and the transparent PNG preview will show up here.";
  }

  if (isUpscalerTool(tool)) {
    return "Upload an image, choose a scale, and the before/after preview will show up here.";
  }

  if (tool.aiTool) {
    return `${tool.title} output will show up here.`;
  }

  return "Output will show up here.";
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

function setImageControls(tool) {
  const active = isImageGenerator(tool);
  els.imageControls.classList.toggle("active", active);
  els.imageGallery.classList.toggle("active", active);
  els.generateSimilar.disabled = !state.lastImageRequest;
  els.useEnhancedPrompt.disabled = !state.lastEnhancedPrompt;
}

function setPromptControls(tool) {
  const active = isPromptEnhancer(tool);
  els.promptControls.classList.toggle("active", active);
  els.promptOutputActions.classList.toggle("active", active);
  setPromptOutputActions();
}

function setPromptOutputActions(isLoading = false) {
  const disabled = isLoading || !state.lastPromptEnhanced;
  els.copyEnhancedPrompt.disabled = disabled;
  els.sendPromptToImage.disabled = disabled;
  els.sendPromptToLore.disabled = disabled;
}

function setLoreControls(tool) {
  const active = isLoreGenerator(tool);
  els.loreControls.classList.toggle("active", active);
  els.loreOutputActions.classList.toggle("active", active);
  setLoreOutputActions();
}

function setLoreOutputActions(isLoading = false) {
  const disabled = isLoading || !state.lastLoreOutput;
  els.copyLore.disabled = disabled;
  els.sendLoreToPrompt.disabled = disabled;
  els.sendLoreToImage.disabled = disabled;
}

function setCodeControls(tool) {
  const active = isCodeHelper(tool);
  els.codeControls.classList.toggle("active", active);
  els.codeOutputActions.classList.toggle("active", active);
  setCodeOutputActions();
}

function setCodeOutputActions(isLoading = false) {
  const disabled = isLoading || !state.lastCodeOutput;
  els.copyCode.disabled = disabled;
  els.downloadCodeResponse.disabled = disabled;
  els.sendCodeToPrompt.disabled = disabled;
}

function setOcrControls(tool) {
  const active = isOcrTool(tool);
  els.ocrOutputActions.classList.toggle("active", active);
  setOcrOutputActions();
}

function setOcrOutputActions(isLoading = false) {
  const disabled = isLoading || !state.lastOcrText;
  els.copyOcrText.disabled = disabled;
  els.downloadOcrText.disabled = disabled;
  els.sendOcrToChat.disabled = disabled;
  els.sendOcrToCode.disabled = disabled;
}

function setBackgroundControls(tool) {
  const active = isBackgroundRemover(tool);
  els.backgroundOutputActions.classList.toggle("active", active);
  setBackgroundOutputActions();
}

function setBackgroundOutputActions(isLoading = false) {
  const disabled = isLoading || !state.lastBackgroundBlob;
  els.downloadBackgroundPng.disabled = disabled;
  els.sendBackgroundToImage.disabled = disabled;
}

function setUpscalerControls(tool) {
  const active = isUpscalerTool(tool);
  els.upscalerControls.classList.toggle("active", active);
  els.upscalerOutputActions.classList.toggle("active", active);
  setUpscalerOutputActions();
}

function setUpscalerOutputActions(isLoading = false) {
  els.downloadUpscaledPng.disabled = isLoading || !state.lastUpscaledBlob;
}

function setStatus(message, type = "") {
  els.status.className = `status-line ${type}`.trim();
  els.status.textContent = message;
}

function setLoading(isLoading) {
  els.button.disabled = isLoading;
  els.button.textContent = isLoading ? "Working..." : activeTool().action;
  els.output.classList.toggle("loading", isLoading);
  if (activeTool().id === "prompt") setPromptOutputActions(isLoading);
  if (activeTool().id === "lore") setLoreOutputActions(isLoading);
  if (activeTool().id === "code") setCodeOutputActions(isLoading);
  if (activeTool().id === "ocr") setOcrOutputActions(isLoading);
  if (activeTool().id === "background") setBackgroundOutputActions(isLoading);
  if (activeTool().id === "upscaler") setUpscalerOutputActions(isLoading);
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

  if (tool.id === "ocr" && !selectedFiles().length) {
    setStatus("Upload an image first. OCR needs pixels, shocking as that may be.", "error");
    return;
  }

  if (tool.id === "background" && !selectedFiles().length) {
    setStatus("Upload an image first. Background removal needs an actual image.", "error");
    return;
  }

  if (tool.id === "upscaler" && !selectedFiles().length) {
    setStatus("Upload an image first. Upscaling imaginary pixels remains illegal.", "error");
    return;
  }

  if (!prompt && !selectedFiles().length) {
    setStatus("Give the tool a prompt or a file. Ideally both, because we are not mind readers.", "error");
    return;
  }

  setLoading(true);
  setStatus(`${tool.title} is working...`);
  if (tool.id === "image") {
    renderLoadingState("Generating image with Hugging Face...");
  } else if (tool.id === "upscaler") {
    renderLoadingState("Upscaling locally with browser canvas...");
  } else {
    els.output.textContent = "Thinking. Dramatically, of course.";
  }

  try {
    if (tool.id === "chat") {
      await runChat([prompt, meta && `Context: ${meta}`].filter(Boolean).join("\n\n"));
      return;
    }

    if (tool.id === "image") {
      await generateImageFromRequest(imageRequestFromForm());
      return;
    }

    if (tool.id === "ocr") {
      const text = await runOcr();
      renderOcrResult(text);
      setStatus(text ? "OCR finished locally with Tesseract.js." : "OCR finished. No readable text found.", text ? "ok" : "");
      return;
    }

    if (tool.id === "background") {
      const result = await runBackgroundRemoval();
      renderBackgroundRemovalResult(result);
      setStatus("Background removed locally. Transparent PNG ready.", "ok");
      return;
    }

    if (tool.id === "upscaler") {
      const result = await runUpscaler();
      renderUpscalerResult(result);
      setStatus(`Upscaled locally to ${result.outputWidth} x ${result.outputHeight}.`, "ok");
      return;
    }

    if (tool.id === "prompt") {
      const text = await runPromptEnhancer(prompt, meta);
      renderPromptEnhancerResult(text);
      setStatus("Prompt Enhancer finished through ai-chat / Ollama.", "ok");
      return;
    }

    if (tool.id === "lore") {
      const text = await runLoreGenerator(prompt, meta);
      renderLoreResult(text);
      setStatus("Lore Generator finished through ai-chat / Ollama.", "ok");
      return;
    }

    if (tool.id === "code") {
      const text = await runCodeHelper(prompt, meta);
      renderCodeResult(text);
      setStatus("Code Helper finished through ai-chat / Ollama.", "ok");
      return;
    }

    if (tool.aiTool) {
      const text = await runStructuredAiTool(tool, prompt, meta);
      els.output.textContent = text;
      setStatus(`${tool.title} finished through ai-chat / Ollama.`, "ok");
      return;
    }

    const text = await runMockTool(tool, prompt, meta);
    els.output.textContent = text;
    setStatus(`${tool.title} placeholder ready. Provider wiring can come next.`, "ok");
  } catch (error) {
    console.error(`${tool.title} failed:`, error);
    if (tool.id === "image") {
      renderErrorState(error);
    } else {
      els.output.textContent = error.message || "The tool fell over. Very elegant.";
    }
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

  const data = await callAiChat({
    messages: state.chatMessages.slice(-6)
  });

  const reply = String(data?.text || data?.reply || "").trim();
  if (!reply) throw new Error("ai-chat returned an empty response.");

  state.chatMessages = [...state.chatMessages, { role: "assistant", content: reply }].slice(-8);
  els.output.textContent = renderChatHistory();
  setStatus(`Chat AI replied through ${data?.provider || "ai-chat"}${data?.model ? ` (${data.model})` : ""}.`, "ok");
}

function imageRequestFromForm(overrides = {}) {
  const prompt = String(overrides.prompt ?? els.prompt.value).trim();
  const extraDetails = els.meta.value.trim();
  const fullPrompt = [prompt, extraDetails && `Extra direction: ${extraDetails}`].filter(Boolean).join("\n\n");

  return {
    prompt: fullPrompt,
    basePrompt: prompt,
    style: String(overrides.style ?? els.imageStyle.value ?? "Default").trim() || "Default",
    aspectRatio: String(overrides.aspectRatio ?? els.imageAspectRatio.value ?? "1:1").trim() || "1:1",
    negativePrompt: String(overrides.negativePrompt ?? els.imageNegativePrompt.value ?? "").trim()
  };
}

async function generateImageFromRequest(request, options = {}) {
  if (!request.prompt) {
    throw new Error("Describe the image first. Blank canvas, blank results.");
  }

  setLoading(true);
  setStatus(options.status || "Image Generator is working...");
  renderLoadingState(options.loadingMessage || "Generating image with Hugging Face...");

  try {
    const data = await runImage(request);
    renderImageResult(data, request);
    state.lastImageRequest = request;
    state.lastImageResult = data;
    els.generateSimilar.disabled = false;

    const saveMessage = await saveImageGeneration(data, request);
    setStatus(saveMessage || "Image Generator finished through ai-image / Hugging Face.", "ok");
    await loadImageGallery(true);
    return data;
  } catch (error) {
    console.error("Image generation failed:", error);
    renderErrorState(error);
    setStatus("Image Generator failed. The real error is shown below.", "error");
    throw error;
  } finally {
    setLoading(false);
  }
}

async function runImage(request) {
  const response = await fetch(AI_IMAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: request.prompt,
      style: request.style,
      aspectRatio: request.aspectRatio,
      negativePrompt: request.negativePrompt
    })
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    console.error("ai-image JSON parse failed:", { responseText, error });
    throw new Error("ai-image returned invalid JSON.");
  }

  if (!response.ok || data?.ok === false) {
    console.error("ai-image request failed:", {
      status: response.status,
      responseText,
      data
    });
    const message = data?.details || data?.error || `ai-image returned ${response.status}.`;
    const imageError = new Error(message);
    imageError.details = data;
    throw imageError;
  }

  const image_url = String(data?.image_url || "").trim();
  if (!image_url) throw new Error("ai-image returned no image_url.");

  return {
    ...data,
    image_url
  };
}

function renderLoadingState(message) {
  const wrap = document.createElement("div");
  wrap.className = "loading-state";

  const spinner = document.createElement("span");
  spinner.className = "spinner";
  spinner.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = message;

  wrap.append(spinner, text);
  els.output.replaceChildren(wrap);
}

function renderImageResult(data, request = state.lastImageRequest) {
  const wrap = document.createElement("div");
  wrap.className = "image-result";

  const image = document.createElement("img");
  image.src = data.image_url;
  image.alt = "Generated image";
  image.loading = "lazy";

  const meta = document.createElement("p");
  meta.className = "image-result-meta";
  meta.textContent = [
    `Provider: ${data.provider || "huggingface"}${data.model ? ` (${data.model})` : ""}`,
    request?.style && `Style: ${request.style}`,
    request?.aspectRatio && `Aspect: ${request.aspectRatio}`
  ].filter(Boolean).join(" | ");

  const download = document.createElement("a");
  download.className = "download-button";
  download.href = data.image_url;
  download.download = "uncensored-media-ai-image.png";
  download.textContent = "Download Image";

  wrap.append(image, meta, download);
  els.output.replaceChildren(wrap);
}

function renderErrorState(error) {
  const box = document.createElement("div");
  box.className = "error-box";
  const details = error?.details?.failures?.length
    ? `\n\nModel failures:\n${error.details.failures.map((failure) => `- ${failure.model}: ${failure.error}`).join("\n")}`
    : "";
  box.textContent = `${error?.message || "Image generation failed."}${details}`;
  els.output.replaceChildren(box);
}

async function enhanceImagePrompt() {
  const roughPrompt = els.prompt.value.trim();
  if (!roughPrompt) {
    setStatus("Write a rough prompt before enhancing it.", "error");
    return;
  }

  setImageActionLoading(true, "Enhancing...");
  setStatus("Enhancing image prompt through ai-chat...");

  try {
    const data = await callAiChat({
      messages: [
        {
          role: "system",
          content: "Rewrite this as a high-quality image generation prompt. Keep the user's idea, add detail, style, lighting, composition, and avoid extra commentary."
        },
        {
          role: "user",
          content: roughPrompt
        }
      ]
    });

    const enhanced = String(data?.text || data?.reply || "").trim();
    if (!enhanced) throw new Error("ai-chat returned an empty enhanced prompt.");

    state.lastEnhancedPrompt = enhanced;
    els.prompt.value = enhanced;
    els.useEnhancedPrompt.disabled = false;
    els.enhancedPromptPreview.textContent = enhanced;
    els.enhancedPromptPreview.classList.add("active");
    setStatus("Enhanced prompt ready. Review it, then click Generate Image.", "ok");
  } catch (error) {
    console.error("Image prompt enhancement failed:", error);
    renderErrorState(error);
    setStatus("Prompt enhancement failed.", "error");
  } finally {
    setImageActionLoading(false);
  }
}

function useEnhancedPrompt() {
  if (!state.lastEnhancedPrompt) return;
  els.prompt.value = state.lastEnhancedPrompt;
  setStatus("Enhanced prompt loaded into the Image Generator.", "ok");
}

async function generateSimilarImage() {
  if (!state.lastImageRequest) {
    setStatus("Generate an image first, then you can make a similar one.", "error");
    return;
  }

  const similarRequest = {
    ...state.lastImageRequest,
    prompt: `${state.lastImageRequest.prompt}. alternate variation, same subject, new composition, same style`
  };

  els.prompt.value = similarRequest.prompt;
  await generateImageFromRequest(similarRequest, {
    status: "Generating a similar image...",
    loadingMessage: "Generating similar variation..."
  });
}

async function copyImagePrompt() {
  const prompt = els.prompt.value.trim();
  if (!prompt) {
    setStatus("There is no prompt to copy.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(prompt);
    setStatus("Prompt copied.", "ok");
  } catch (error) {
    console.error("Prompt copy failed:", error);
    setStatus("Prompt copy failed. Your browser blocked clipboard access.", "error");
  }
}

function setImageActionLoading(isLoading, label = "Working...") {
  els.enhanceImagePrompt.disabled = isLoading;
  els.copyImagePrompt.disabled = isLoading;
  els.generateSimilar.disabled = isLoading || !state.lastImageRequest;
  els.useEnhancedPrompt.disabled = isLoading || !state.lastEnhancedPrompt;
  if (isLoading) els.enhanceImagePrompt.textContent = label;
  else els.enhanceImagePrompt.textContent = "Enhance Prompt";
}

async function saveImageGeneration(data, request) {
  try {
    const { user, error } = await getCurrentUserAndProfile();
    if (error) console.error("AI generation auth lookup failed:", error);
    if (!user?.id) {
      console.info("AI generation gallery save skipped: no authenticated user.");
      return "Image generated. Sign in to save it to your gallery.";
    }

    const payload = {
      user_id: user.id,
      tool_type: "image",
      prompt: request.prompt,
      style: request.style,
      aspect_ratio: request.aspectRatio,
      negative_prompt: request.negativePrompt,
      provider: data.provider || "huggingface",
      model: data.model || null,
      output_url: data.image_url,
      output_text: null,
      metadata: {
        width: data.width || null,
        height: data.height || null,
        mimeType: data.mimeType || null,
        hf_provider: data.hf_provider || null
      }
    };

    const { error: insertError } = await supabase
      .from("ai_generations")
      .insert(payload);

    if (insertError) {
      console.error("AI generation save failed:", insertError);
      return `Image generated, but gallery save failed: ${insertError.message}`;
    }

    return "Image generated and saved to gallery.";
  } catch (error) {
    console.error("AI generation save crashed:", error);
    return `Image generated, but gallery save failed: ${error.message || error}`;
  }
}

async function loadImageGallery(force = false) {
  if (state.galleryLoaded && !force) return;

  els.imageGalleryStatus.textContent = "Loading gallery...";
  els.imageGalleryGrid.replaceChildren();

  try {
    const { user, error } = await getCurrentUserAndProfile();
    if (error) console.error("AI gallery auth lookup failed:", error);
    if (!user?.id) {
      state.galleryLoaded = true;
      els.imageGalleryStatus.textContent = "Sign in to save and view your image history.";
      return;
    }

    const query = supabase
      .from("ai_generations")
      .select("id, user_id, prompt, style, aspect_ratio, provider, model, output_url, created_at")
      .eq("tool_type", "image")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);

    const { data, error: galleryError } = await query;
    if (galleryError) {
      console.warn("AI gallery load failed:", galleryError);
      els.imageGalleryStatus.textContent = `Gallery unavailable: ${galleryError.message}`;
      return;
    }

    state.galleryLoaded = true;
    renderImageGallery(data || []);
  } catch (error) {
    console.error("AI gallery load crashed:", error);
    els.imageGalleryStatus.textContent = `Gallery unavailable: ${error.message || error}`;
  }
}

function renderImageGallery(rows) {
  els.imageGalleryGrid.replaceChildren();

  if (!rows.length) {
    els.imageGalleryStatus.textContent = "No images saved yet.";
    return;
  }

  els.imageGalleryStatus.textContent = `${rows.length} recent image${rows.length === 1 ? "" : "s"}`;

  rows.forEach((row) => {
    const card = document.createElement("article");
    card.className = "image-gallery-card";

    const image = document.createElement("img");
    image.src = row.output_url;
    image.alt = row.prompt || "Saved AI image";
    image.loading = "lazy";

    const caption = document.createElement("p");
    caption.textContent = [row.style, row.aspect_ratio, row.model].filter(Boolean).join(" | ");

    const prompt = document.createElement("p");
    prompt.textContent = row.prompt || "Untitled image";

    card.append(image, caption, prompt);
    els.imageGalleryGrid.append(card);
  });
}

async function runOcr() {
  const file = selectedFiles()[0];
  if (!file) {
    throw new Error("Upload an image before running OCR.");
  }

  if (!isSupportedOcrImage(file)) {
    throw new Error("OCR only accepts image files right now.");
  }

  const tesseract = window.Tesseract;
  if (!tesseract?.recognize) {
    throw new Error("Tesseract.js did not load. Check your connection and try again.");
  }

  state.lastOcrText = "";
  setOcrOutputActions(true);
  renderLoadingState("Reading image locally with Tesseract.js...");
  setStatus("OCR is reading the image locally...");

  const result = await tesseract.recognize(file, "eng", {
    logger: (message) => {
      if (!message || typeof message !== "object") return;
      const status = String(message.status || "reading image");
      const progress = Number(message.progress || 0);
      const percent = progress > 0 ? ` ${Math.round(progress * 100)}%` : "";
      setStatus(`Tesseract.js: ${status}${percent}`);
    }
  });

  const text = String(result?.data?.text || "").trim();
  state.lastOcrText = text;
  setOcrOutputActions();
  return text;
}

function isSupportedOcrImage(file) {
  return isSupportedBrowserImage(file);
}

function isSupportedBrowserImage(file) {
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(file.name || "");
}

function renderOcrResult(text) {
  const wrap = document.createElement("div");
  wrap.className = "ocr-result";

  const label = document.createElement("p");
  label.className = "prompt-result-label";
  label.textContent = "Extracted Text";

  const body = document.createElement("div");
  body.className = "prompt-result-body";
  body.textContent = text || "No readable text found.";

  wrap.append(label, body);
  els.output.replaceChildren(wrap);
}

async function copyOcrText() {
  const text = state.lastOcrText.trim();
  if (!text) {
    setStatus("Run OCR and find text before copying. Clipboards are not psychic.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("OCR text copied.", "ok");
  } catch (error) {
    console.error("OCR text copy failed:", error);
    setStatus("Copy failed. Your browser blocked clipboard access.", "error");
  }
}

function downloadOcrText() {
  const text = state.lastOcrText.trim();
  if (!text) {
    setStatus("Run OCR and find text before downloading.", "error");
    return;
  }

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "uncensored-media-ocr.txt";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("OCR text downloaded.", "ok");
}

function sendOcrToChatAi() {
  const text = state.lastOcrText.trim();
  if (!text) {
    setStatus("Run OCR and find text before sending it somewhere.", "error");
    return;
  }

  selectTool("chat");
  els.prompt.value = `Help me with this OCR text:\n\n${text}`;
  setStatus("OCR text sent to Chat AI.", "ok");
}

function sendOcrToCodeHelper() {
  const text = state.lastOcrText.trim();
  if (!text) {
    setStatus("Run OCR and find text before sending it somewhere.", "error");
    return;
  }

  selectTool("code");
  els.prompt.value = text;
  els.codeMode.value = "Explain";
  setStatus("OCR text sent to Code Helper.", "ok");
}

async function runBackgroundRemoval() {
  const file = selectedFiles()[0];
  if (!file) {
    throw new Error("Upload an image before removing the background.");
  }

  if (!isSupportedBrowserImage(file)) {
    throw new Error("Background Remover only accepts image files.");
  }

  clearBackgroundResultUrl();
  state.lastBackgroundBlob = null;
  state.lastBackgroundOriginalName = file.name || "image";
  setBackgroundOutputActions(true);
  renderLoadingState("Loading browser background remover...");
  setStatus("Browser background removal: loading model assets...");

  const { removeBackground } = await loadBackgroundRemovalModule();
  if (typeof removeBackground !== "function") {
    throw new Error("Background removal library did not expose removeBackground().");
  }

  const outputBlob = await removeBackground(file, {
    model: "small",
    output: {
      format: "image/png",
      quality: 0.9
    },
    progress: (key, current, total) => {
      setStatus(backgroundRemovalProgressMessage(key, current, total));
    }
  });

  if (!(outputBlob instanceof Blob)) {
    throw new Error("Background removal did not return an image blob.");
  }

  state.lastBackgroundBlob = outputBlob;
  state.lastBackgroundUrl = URL.createObjectURL(outputBlob);
  setBackgroundOutputActions();

  return {
    blob: outputBlob,
    url: state.lastBackgroundUrl,
    name: state.lastBackgroundOriginalName
  };
}

async function loadBackgroundRemovalModule() {
  backgroundRemovalModulePromise ||= import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/index.mjs");
  return backgroundRemovalModulePromise;
}

function backgroundRemovalProgressMessage(key, current, total) {
  const label = String(key || "processing").replace(/^compute:/, "");
  if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
    return `Browser background removal: ${label} ${Math.round((current / total) * 100)}%`;
  }

  return `Browser background removal: ${label}`;
}

function renderBackgroundRemovalResult(result) {
  const wrap = document.createElement("div");
  wrap.className = "image-result background-result";

  const image = document.createElement("img");
  image.className = "transparent-preview";
  image.src = result.url;
  image.alt = "Background removed transparent PNG";
  image.loading = "lazy";

  const meta = document.createElement("p");
  meta.className = "image-result-meta";
  meta.textContent = `${result.name || "Image"} background removed locally. Output: transparent PNG.`;

  wrap.append(image, meta);
  els.output.replaceChildren(wrap);
}

function downloadBackgroundPng() {
  if (!state.lastBackgroundBlob || !state.lastBackgroundUrl) {
    setStatus("Remove a background first, then download the PNG.", "error");
    return;
  }

  const link = document.createElement("a");
  link.href = state.lastBackgroundUrl;
  link.download = backgroundOutputFilename(state.lastBackgroundOriginalName);
  document.body.append(link);
  link.click();
  link.remove();
  setStatus("Transparent PNG downloaded.", "ok");
}

function sendBackgroundToImageGenerator() {
  if (!state.lastBackgroundBlob) {
    setStatus("Remove a background first, then send it somewhere.", "error");
    return;
  }

  const subjectName = state.lastBackgroundOriginalName || "the cutout subject";
  selectTool("image");
  els.prompt.value = [
    `Create a new image concept for the transparent cutout from "${subjectName}".`,
    "Design a clean background or full scene that fits the subject, with polished lighting and composition.",
    "Note: the cutout PNG was generated locally in the browser and is not uploaded automatically."
  ].join(" ");
  setStatus("Background-removal result sent to Image Generator as a prompt.", "ok");
}

function backgroundOutputFilename(filename) {
  const base = String(filename || "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "image";

  return `${base}-no-background.png`;
}

function clearBackgroundResultUrl() {
  if (state.lastBackgroundUrl) {
    URL.revokeObjectURL(state.lastBackgroundUrl);
  }

  state.lastBackgroundUrl = "";
}

async function runUpscaler() {
  const file = selectedFiles()[0];
  if (!file) {
    throw new Error("Upload an image before upscaling.");
  }

  if (!isSupportedBrowserImage(file)) {
    throw new Error("Upscaler only accepts image files.");
  }

  const scale = Number(els.upscalerScale.value || 2);
  if (![2, 4].includes(scale)) {
    throw new Error("Upscaler scale must be 2x or 4x.");
  }

  clearUpscalerResultUrls();
  state.lastUpscaledBlob = null;
  state.lastUpscalerOriginalName = file.name || "image";
  setUpscalerOutputActions(true);
  renderLoadingState("Loading image into browser canvas...");
  setStatus("Browser Canvas: loading image...");

  const image = await loadImageForCanvas(file);
  const inputWidth = image.naturalWidth || image.width;
  const inputHeight = image.naturalHeight || image.height;
  if (!inputWidth || !inputHeight) {
    throw new Error("Could not read image dimensions.");
  }

  const outputWidth = inputWidth * scale;
  const outputHeight = inputHeight * scale;
  const outputPixels = outputWidth * outputHeight;
  if (outputPixels > 90000000) {
    throw new Error("That upscale would be too large for a browser canvas. Try 2x or a smaller image.");
  }

  setStatus(`Browser Canvas: drawing ${scale}x upscale...`);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { willReadFrequently: Boolean(els.upscalerSharpen.checked) });
  if (!context) {
    throw new Error("Your browser could not create a canvas context.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, outputWidth, outputHeight);

  if (els.upscalerSharpen.checked) {
    setStatus("Browser Canvas: applying sharpen filter...");
    applySharpenFilter(context, outputWidth, outputHeight);
  }

  setStatus("Browser Canvas: encoding PNG...");
  const blob = await canvasToPngBlob(canvas);
  state.lastUpscaledBlob = blob;
  state.lastUpscaledUrl = URL.createObjectURL(blob);
  state.lastUpscalerOriginalUrl = URL.createObjectURL(file);
  setUpscalerOutputActions();

  return {
    url: state.lastUpscaledUrl,
    originalUrl: state.lastUpscalerOriginalUrl,
    blob,
    name: state.lastUpscalerOriginalName,
    scale,
    sharpen: Boolean(els.upscalerSharpen.checked),
    inputWidth,
    inputHeight,
    outputWidth,
    outputHeight
  };
}

function loadImageForCanvas(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The uploaded image could not be decoded."));
    };
    image.src = url;
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Browser canvas could not export the upscaled PNG."));
    }, "image/png");
  });
}

function applySharpenFilter(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const source = imageData.data;
  const output = new Uint8ClampedArray(source);
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const weight = kernel[(ky + 1) * 3 + (kx + 1)];
            const sampleIndex = ((y + ky) * width + (x + kx)) * 4 + channel;
            value += source[sampleIndex] * weight;
          }
        }
        output[pixelIndex + channel] = Math.max(0, Math.min(255, value));
      }
    }
  }

  imageData.data.set(output);
  context.putImageData(imageData, 0, 0);
}

function renderUpscalerResult(result) {
  const wrap = document.createElement("div");
  wrap.className = "upscaler-result";

  const grid = document.createElement("div");
  grid.className = "before-after-grid";

  const before = upscalerPreviewPanel("Before", result.originalUrl, `${result.inputWidth} x ${result.inputHeight}`);
  const after = upscalerPreviewPanel("After", result.url, `${result.outputWidth} x ${result.outputHeight}`);
  grid.append(before, after);

  const meta = document.createElement("p");
  meta.className = "image-result-meta";
  meta.textContent = [
    `${result.name || "Image"} upscaled ${result.scale}x`,
    `Output: ${result.outputWidth} x ${result.outputHeight}`,
    result.sharpen ? "Sharpen: on" : "Sharpen: off",
    `PNG: ${formatBytes(result.blob.size)}`
  ].join(" | ");

  wrap.append(grid, meta);
  els.output.replaceChildren(wrap);
}

function upscalerPreviewPanel(label, src, dimensions) {
  const panel = document.createElement("figure");
  panel.className = "preview-panel";

  const image = document.createElement("img");
  image.src = src;
  image.alt = `${label} upscaler preview`;
  image.loading = "lazy";

  const caption = document.createElement("figcaption");
  caption.textContent = `${label}: ${dimensions}`;

  panel.append(image, caption);
  return panel;
}

function downloadUpscaledPng() {
  if (!state.lastUpscaledBlob || !state.lastUpscaledUrl) {
    setStatus("Upscale an image first, then download the PNG.", "error");
    return;
  }

  const link = document.createElement("a");
  link.href = state.lastUpscaledUrl;
  link.download = upscaledOutputFilename(state.lastUpscalerOriginalName);
  document.body.append(link);
  link.click();
  link.remove();
  setStatus("Upscaled PNG downloaded.", "ok");
}

function upscaledOutputFilename(filename) {
  const base = String(filename || "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "image";

  return `${base}-upscaled-${els.upscalerScale.value || "2"}x.png`;
}

function clearUpscalerResultUrls() {
  if (state.lastUpscaledUrl) {
    URL.revokeObjectURL(state.lastUpscaledUrl);
  }
  if (state.lastUpscalerOriginalUrl) {
    URL.revokeObjectURL(state.lastUpscalerOriginalUrl);
  }

  state.lastUpscaledUrl = "";
  state.lastUpscalerOriginalUrl = "";
}

async function runPromptEnhancer(prompt, meta) {
  if (!prompt) {
    throw new Error("Paste a rough prompt first. The enhancer needs something to enhance.");
  }

  const mode = els.promptMode.value || "Image Prompt";
  state.lastPromptEnhanced = "";
  setPromptOutputActions(true);
  const data = await callAiChat({
    prompt: buildPromptEnhancerPrompt(prompt, meta, mode)
  });

  const reply = String(data?.text || data?.reply || "").trim();
  if (!reply) throw new Error("ai-chat returned an empty enhanced prompt.");

  state.lastPromptEnhanced = reply;
  state.lastEnhancedPrompt = reply;
  setPromptOutputActions();
  return reply;
}

function buildPromptEnhancerPrompt(prompt, meta, mode) {
  const modeInstruction = promptModeInstructions[mode] || promptModeInstructions["Image Prompt"];
  return [
    PROMPT_ENHANCER_SYSTEM_PROMPT,
    modeInstruction,
    "",
    `Prompt mode: ${mode}`,
    `Rough prompt:\n${prompt}`,
    meta && `Extra direction:\n${meta}`
  ].filter(Boolean).join("\n\n");
}

function renderPromptEnhancerResult(text) {
  const wrap = document.createElement("div");
  wrap.className = "prompt-result";

  const label = document.createElement("p");
  label.className = "prompt-result-label";
  label.textContent = "Enhanced Prompt";

  const body = document.createElement("div");
  body.className = "prompt-result-body";
  body.textContent = text;

  wrap.append(label, body);
  els.output.replaceChildren(wrap);
}

async function copyEnhancedPrompt() {
  const enhanced = state.lastPromptEnhanced.trim();
  if (!enhanced) {
    setStatus("Enhance a prompt first, then copy it. Stunning sequence of events.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(enhanced);
    setStatus("Enhanced prompt copied.", "ok");
  } catch (error) {
    console.error("Enhanced prompt copy failed:", error);
    setStatus("Copy failed. Your browser blocked clipboard access.", "error");
  }
}

function sendEnhancedPromptToImage() {
  const enhanced = state.lastPromptEnhanced.trim();
  if (!enhanced) {
    setStatus("Enhance a prompt first, then send it somewhere.", "error");
    return;
  }

  state.lastEnhancedPrompt = enhanced;
  selectTool("image");
  els.prompt.value = enhanced;
  els.enhancedPromptPreview.textContent = enhanced;
  els.enhancedPromptPreview.classList.add("active");
  els.useEnhancedPrompt.disabled = false;
  setStatus("Enhanced prompt sent to Image Generator.", "ok");
}

function sendEnhancedPromptToLore() {
  const enhanced = state.lastPromptEnhanced.trim();
  if (!enhanced) {
    setStatus("Enhance a prompt first, then send it somewhere.", "error");
    return;
  }

  selectTool("lore");
  els.prompt.value = enhanced;
  setStatus("Enhanced prompt sent to Lore Generator.", "ok");
}

async function runLoreGenerator(prompt, meta) {
  if (!prompt) {
    throw new Error("Give Lore Generator an idea first. Even legends need a seed.");
  }

  const type = els.loreType.value || "NPC";
  const tone = els.loreTone.value || "Dark Fantasy";
  state.lastLoreOutput = "";
  setLoreOutputActions(true);

  const data = await callAiChat({
    prompt: buildLoreGeneratorPrompt(prompt, meta, type, tone)
  });

  const reply = String(data?.text || data?.reply || "").trim();
  if (!reply) throw new Error("ai-chat returned empty lore.");

  state.lastLoreOutput = reply;
  setLoreOutputActions();
  return reply;
}

function buildLoreGeneratorPrompt(prompt, meta, type, tone) {
  return [
    LORE_GENERATOR_SYSTEM_PROMPT,
    "",
    `Selected type: ${type}`,
    `Selected tone: ${tone}`,
    `User idea:\n${prompt}`,
    meta && `Extra direction:\n${meta}`,
    "Output format: Use concise sections for Name, Summary, Visual Identity, History, Conflict, Secrets, Hooks, and Game/Story Use."
  ].filter(Boolean).join("\n\n");
}

function renderLoreResult(text) {
  const wrap = document.createElement("div");
  wrap.className = "lore-result";

  const label = document.createElement("p");
  label.className = "prompt-result-label";
  label.textContent = "Lore Output";

  const body = document.createElement("div");
  body.className = "prompt-result-body";
  body.textContent = text;

  wrap.append(label, body);
  els.output.replaceChildren(wrap);
}

async function copyLore() {
  const lore = state.lastLoreOutput.trim();
  if (!lore) {
    setStatus("Generate lore first, then copy it. Brutal, I know.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(lore);
    setStatus("Lore copied.", "ok");
  } catch (error) {
    console.error("Lore copy failed:", error);
    setStatus("Copy failed. Your browser blocked clipboard access.", "error");
  }
}

function sendLoreToPromptEnhancer() {
  const lore = state.lastLoreOutput.trim();
  if (!lore) {
    setStatus("Generate lore first, then send it somewhere.", "error");
    return;
  }

  selectTool("prompt");
  els.prompt.value = lore;
  els.promptMode.value = "Story/Lore Prompt";
  setStatus("Lore sent to Prompt Enhancer.", "ok");
}

function sendLoreToImageGenerator() {
  const lore = state.lastLoreOutput.trim();
  if (!lore) {
    setStatus("Generate lore first, then send it somewhere.", "error");
    return;
  }

  const imagePrompt = `Create concept art based on this lore:\n\n${lore}`;
  state.lastEnhancedPrompt = imagePrompt;
  selectTool("image");
  els.prompt.value = imagePrompt;
  els.enhancedPromptPreview.textContent = imagePrompt;
  els.enhancedPromptPreview.classList.add("active");
  els.useEnhancedPrompt.disabled = false;
  setStatus("Lore sent to Image Generator.", "ok");
}

async function runCodeHelper(prompt, meta) {
  const files = await readUploadedCodeFiles();
  if (!prompt && !files.length) {
    throw new Error("Paste code, describe the problem, or upload a supported file first.");
  }

  const mode = els.codeMode.value || "Debug";
  const language = els.codeLanguage.value || "JavaScript";
  state.lastCodeOutput = "";
  setCodeOutputActions(true);

  const data = await callAiChat({
    prompt: buildCodeHelperPrompt(prompt, meta, mode, language, files)
  });

  const reply = String(data?.text || data?.reply || "").trim();
  if (!reply) throw new Error("ai-chat returned an empty code response.");

  state.lastCodeOutput = reply;
  setCodeOutputActions();
  return reply;
}

function buildCodeHelperPrompt(prompt, meta, mode, language, files) {
  const modePrompt = codeModePrompts[mode] || codeModePrompts.Debug;
  const uploadedContext = files.length
    ? files.map(formatUploadedCodeFile).join("\n\n")
    : "No uploaded file contents.";

  return [
    CODE_HELPER_BASE_PROMPT,
    modePrompt,
    "",
    `Mode: ${mode}`,
    `Language: ${language}`,
    meta && `Project/context details:\n${meta}`,
    prompt && `User request or pasted code:\n\n\`\`\`${codeFenceLanguage(language)}\n${prompt}\n\`\`\``,
    `Uploaded files:\n${uploadedContext}`,
    "Response requirements: preserve indentation, use code blocks for changed or generated code, explain important changes, include the smallest safe fix when debugging, and keep the answer concise."
  ].filter(Boolean).join("\n\n");
}

function formatUploadedCodeFile(file) {
  return [
    `File: ${file.name}`,
    `\`\`\`${file.language}`,
    file.content,
    "```"
  ].join("\n");
}

async function readUploadedCodeFiles() {
  const files = selectedFiles();
  if (!files.length) return [];

  const allowedExtensions = new Set([".js", ".ts", ".html", ".css", ".json", ".md"]);
  const maxPerFile = 18000;
  const maxTotal = 52000;
  const loaded = [];
  let used = 0;

  for (const file of files) {
    const extension = fileExtension(file.name);
    if (!allowedExtensions.has(extension)) {
      console.warn("Skipped unsupported Code Helper upload:", file.name);
      continue;
    }

    const remaining = maxTotal - used;
    if (remaining <= 0) break;

    const raw = await file.text();
    const limit = Math.min(maxPerFile, remaining);
    const content = raw.length > limit
      ? `${raw.slice(0, limit)}\n\n/* File truncated for AI context. */`
      : raw;

    loaded.push({
      name: file.name,
      language: codeFenceLanguageFromExtension(extension),
      content
    });
    used += content.length;
  }

  return loaded;
}

function fileExtension(filename) {
  const match = String(filename || "").toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : "";
}

function codeFenceLanguage(language) {
  const normalized = String(language || "").toLowerCase();
  const map = {
    javascript: "javascript",
    typescript: "typescript",
    html: "html",
    css: "css",
    json: "json",
    sql: "sql",
    python: "python"
  };
  return map[normalized] || "";
}

function codeFenceLanguageFromExtension(extension) {
  const map = {
    ".js": "javascript",
    ".ts": "typescript",
    ".html": "html",
    ".css": "css",
    ".json": "json",
    ".md": "markdown"
  };
  return map[extension] || "";
}

function renderCodeResult(text) {
  const wrap = document.createElement("div");
  wrap.className = "code-result";

  const label = document.createElement("p");
  label.className = "prompt-result-label";
  label.textContent = "Code Helper Response";

  const body = document.createElement("div");
  body.className = "prompt-result-body code-result-body";
  body.textContent = text;

  wrap.append(label, body);
  els.output.replaceChildren(wrap);
}

async function copyCode() {
  const response = state.lastCodeOutput.trim();
  if (!response) {
    setStatus("Run Code Helper first, then copy the code. Wild concept.", "error");
    return;
  }

  const code = extractCodeBlocks(response) || response;
  try {
    await navigator.clipboard.writeText(code);
    setStatus("Code copied.", "ok");
  } catch (error) {
    console.error("Code copy failed:", error);
    setStatus("Copy failed. Your browser blocked clipboard access.", "error");
  }
}

function downloadCodeResponse() {
  const response = state.lastCodeOutput.trim();
  if (!response) {
    setStatus("Run Code Helper first, then download the response.", "error");
    return;
  }

  const blob = new Blob([response], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "uncensored-media-code-helper-response.md";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Code Helper response downloaded.", "ok");
}

function sendCodeToPromptEnhancer() {
  const response = state.lastCodeOutput.trim();
  if (!response) {
    setStatus("Run Code Helper first, then send the response somewhere.", "error");
    return;
  }

  selectTool("prompt");
  els.prompt.value = response;
  els.promptMode.value = "Code Prompt";
  setStatus("Code Helper response sent to Prompt Enhancer.", "ok");
}

function extractCodeBlocks(markdown) {
  const blocks = [];
  const pattern = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g;
  let match = pattern.exec(markdown);

  while (match) {
    blocks.push(match[1].trim());
    match = pattern.exec(markdown);
  }

  return blocks.join("\n\n").trim();
}

async function runStructuredAiTool(tool, prompt, meta) {
  if (!prompt) {
    throw new Error(`Feed ${tool.title} a prompt first. It is powerful, not psychic.`);
  }

  const config = aiToolPrompts[tool.aiTool];
  if (!config) {
    throw new Error(`${tool.title} is missing its system prompt.`);
  }

  const data = await callAiChat({
    messages: buildStructuredMessages(config.system, prompt, meta, fileSummary())
  });

  const reply = String(data?.text || data?.reply || "").trim();
  if (!reply) throw new Error("ai-chat returned an empty response.");

  return [
    reply,
    "",
    `Provider: ${data?.provider || "ai-chat"}${data?.model ? ` (${data.model})` : ""}`
  ].join("\n");
}

function buildStructuredMessages(systemPrompt, prompt, meta, uploads) {
  return [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: [
        `User input:\n${prompt}`,
        meta && `Extra direction:\n${meta}`,
        uploads && uploads !== "No file uploaded." && `Uploaded files:\n${uploads}\n\nNote: uploaded file contents are not available yet, so use only the filenames as context.`
      ].filter(Boolean).join("\n\n")
    }
  ];
}

async function callAiChat(payload) {
  const response = await fetch(AI_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
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

  return data;
}

function runMockTool(tool, prompt, meta) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve([
        `${tool.title} prototype placeholder`,
        "",
        `Prompt: ${prompt || "No prompt supplied."}`,
        `Details: ${meta || "No extra details."}`,
        `Uploads: ${fileSummary()}`,
        "",
        placeholderSuggestion(tool.id, prompt)
      ].join("\n"));
    }, 700);
  });
}

function placeholderSuggestion(id, prompt) {
  const clean = prompt || "your idea";
  const suggestions = {
    video: `Video brief staged for: ${clean}. Next provider should return storyboard beats and a render job id.`,
    voice: "Voice job placeholder ready. Real provider should return an audio URL and transcript.",
    music: "Music brief placeholder ready. Real provider should return track URL, duration, and license notes.",
    social: "Social post placeholder ready. Real provider should return short post variants."
  };

  return suggestions[id] || "Placeholder output ready.";
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
  els.imageNegativePrompt.value = "";
  els.enhancedPromptPreview.textContent = "";
  els.enhancedPromptPreview.classList.remove("active");

  if (activeTool().id === "chat") state.chatMessages = [];
  if (activeTool().id === "prompt") {
    state.lastPromptEnhanced = "";
    setPromptOutputActions();
  }
  if (activeTool().id === "lore") {
    state.lastLoreOutput = "";
    setLoreOutputActions();
  }
  if (activeTool().id === "code") {
    state.lastCodeOutput = "";
    setCodeOutputActions();
  }
  if (activeTool().id === "ocr") {
    state.lastOcrText = "";
    setOcrOutputActions();
  }
  if (activeTool().id === "background") {
    clearBackgroundResultUrl();
    state.lastBackgroundBlob = null;
    state.lastBackgroundOriginalName = "";
    setBackgroundOutputActions();
  }
  if (activeTool().id === "upscaler") {
    clearUpscalerResultUrls();
    state.lastUpscaledBlob = null;
    state.lastUpscalerOriginalName = "";
    setUpscalerOutputActions();
  }
  if (activeTool().id === "image") {
    state.lastEnhancedPrompt = "";
    els.useEnhancedPrompt.disabled = true;
  }
  renderTool(activeTool());
}

function boot() {
  renderTabs();
  renderTool(activeTool());
  els.form.addEventListener("submit", handleSubmit);
  els.clear.addEventListener("click", clearTool);
  els.enhanceImagePrompt.addEventListener("click", enhanceImagePrompt);
  els.useEnhancedPrompt.addEventListener("click", useEnhancedPrompt);
  els.generateSimilar.addEventListener("click", generateSimilarImage);
  els.copyImagePrompt.addEventListener("click", copyImagePrompt);
  els.copyEnhancedPrompt.addEventListener("click", copyEnhancedPrompt);
  els.sendPromptToImage.addEventListener("click", sendEnhancedPromptToImage);
  els.sendPromptToLore.addEventListener("click", sendEnhancedPromptToLore);
  els.copyLore.addEventListener("click", copyLore);
  els.sendLoreToPrompt.addEventListener("click", sendLoreToPromptEnhancer);
  els.sendLoreToImage.addEventListener("click", sendLoreToImageGenerator);
  els.copyCode.addEventListener("click", copyCode);
  els.downloadCodeResponse.addEventListener("click", downloadCodeResponse);
  els.sendCodeToPrompt.addEventListener("click", sendCodeToPromptEnhancer);
  els.copyOcrText.addEventListener("click", copyOcrText);
  els.downloadOcrText.addEventListener("click", downloadOcrText);
  els.sendOcrToChat.addEventListener("click", sendOcrToChatAi);
  els.sendOcrToCode.addEventListener("click", sendOcrToCodeHelper);
  els.downloadBackgroundPng.addEventListener("click", downloadBackgroundPng);
  els.sendBackgroundToImage.addEventListener("click", sendBackgroundToImageGenerator);
  els.downloadUpscaledPng.addEventListener("click", downloadUpscaledPng);
  els.file.addEventListener("change", () => {
    els.fileList.textContent = fileSummary();
  });
}

boot();
