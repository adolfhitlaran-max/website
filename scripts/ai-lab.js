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
    action: "Enhance Prompt",
    aiTool: "prompt"
  },
  {
    id: "lore",
    title: "Lore Generator",
    icon: "LO",
    description: "Generate worldbuilding notes, factions, artifacts, timelines, and strange little backstory piles.",
    prompt: "Describe the world, character, faction, or artifact...",
    meta: "Tone, era, genre",
    action: "Generate Lore",
    aiTool: "lore"
  },
  {
    id: "code",
    title: "Code Helper",
    icon: "CO",
    description: "Ask for code help, debugging notes, or implementation planning. Uploads are mocked for now.",
    prompt: "Describe the bug or feature...",
    meta: "Language, framework, file path",
    action: "Help With Code",
    aiTool: "code",
    upload: { accept: ".txt,.js,.ts,.html,.css,.json,.md", multiple: true }
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
  prompt: {
    system: [
      "You are an expert prompt engineer.",
      "Rewrite rough prompts into stronger, detailed prompts with clear subject, context, style, constraints, and output format.",
      "Return only the improved prompt unless the user asks for notes.",
      "Keep it useful, specific, and ready to paste into another AI tool."
    ].join(" ")
  },
  lore: {
    system: [
      "You are a game lore writer and worldbuilding designer.",
      "Generate factions, NPCs, quests, myths, locations, conflicts, artifacts, and history from the user's idea.",
      "Use clean sections and concrete names.",
      "Make it playable, weird enough to remember, and easy to adapt."
    ].join(" ")
  },
  code: {
    system: [
      "You are a senior code helper.",
      "Explain or fix pasted code with direct, practical guidance.",
      "If code is broken, identify likely causes, suggest a corrected version, and mention any test or debugging step.",
      "Do not pretend to run code. Be concise unless the pasted code requires detail."
    ].join(" ")
  },
  social: {
    system: [
      "You write short X/Twitter-style posts.",
      "Create punchy posts with strong hooks, concise wording, and optional hashtags only when useful.",
      "Avoid long threads unless requested.",
      "Default to 5 variants, each under 280 characters."
    ].join(" ")
  }
};

const state = {
  activeId: tools[0].id,
  chatMessages: [],
  lastEnhancedPrompt: "",
  lastImageRequest: null,
  lastImageResult: null,
  galleryLoaded: false
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
  imageControls: document.getElementById("imageControls"),
  imageStyle: document.getElementById("imageStyle"),
  imageAspectRatio: document.getElementById("imageAspectRatio"),
  imageNegativePrompt: document.getElementById("imageNegativePrompt"),
  enhanceImagePrompt: document.getElementById("enhanceImagePromptButton"),
  useEnhancedPrompt: document.getElementById("useEnhancedPromptButton"),
  generateSimilar: document.getElementById("generateSimilarButton"),
  copyImagePrompt: document.getElementById("copyImagePromptButton"),
  enhancedPromptPreview: document.getElementById("enhancedPromptPreview"),
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
  els.kicker.textContent = imageGenerator ? "Live Image Backend" : backendPowered ? "Live Ollama Backend" : "Prototype Tool";
  els.title.textContent = tool.title;
  els.description.textContent = tool.description;
  els.prompt.placeholder = tool.prompt;
  els.meta.placeholder = tool.meta;
  els.button.textContent = tool.action;
  els.output.textContent = outputIntro(tool);
  setStatus(
    backendPowered
      ? backendStatusMessage(tool)
      : "Provider not wired yet. This tool returns a prototype placeholder.",
    backendPowered ? "ok" : ""
  );
  setUpload(tool);
  setImageControls(tool);
  setLoading(false);

  if (isImageGenerator(tool)) {
    void loadImageGallery();
  }
}

function isBackendTool(tool) {
  return Boolean(tool.live || tool.aiTool);
}

function isImageGenerator(tool) {
  return tool.id === "image";
}

function backendStatusMessage(tool) {
  if (tool.endpoint === "ai-image") return "Image Generator is connected to ai-image.";
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
  if (tool.id === "image") {
    renderLoadingState("Generating image with Hugging Face...");
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

    const payload = {
      user_id: user?.id || null,
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

    let query = supabase
      .from("ai_generations")
      .select("id, user_id, prompt, style, aspect_ratio, provider, model, output_url, created_at")
      .eq("tool_type", "image")
      .order("created_at", { ascending: false })
      .limit(12);

    query = user?.id
      ? query.or(`user_id.eq.${user.id},user_id.is.null`)
      : query.is("user_id", null);

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
    ocr: "OCR placeholder ready. Real provider should return extracted text plus confidence notes.",
    background: "Background removal placeholder ready. Real provider should return a transparent PNG URL.",
    upscaler: "Upscale placeholder ready. Real provider should return original/enhanced comparison data.",
    voice: "Voice job placeholder ready. Real provider should return an audio URL and transcript.",
    music: "Music brief placeholder ready. Real provider should return track URL, duration, and license notes.",
    prompt: `Enhanced prompt draft: Create a precise, high-signal version of "${clean}" with constraints, style, and output format.`,
    lore: `Lore seed: ${clean} becomes a faction, relic, or timeline entry with motive, conflict, and consequence.`,
    code: "Code helper placeholder ready. Real provider should return patch suggestions, risks, and test notes.",
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
  els.file.addEventListener("change", () => {
    els.fileList.textContent = fileSummary();
  });
}

boot();
