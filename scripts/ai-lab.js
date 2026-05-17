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

const PROMPT_ENHANCER_SYSTEM_PROMPT = "You are a prompt engineer. Rewrite the user's rough prompt into a detailed, high-quality prompt. Preserve the original idea, add concrete details, style, composition, lighting, mood, constraints, and output format. Do not add commentary. Only return the improved prompt.";
const LORE_GENERATOR_SYSTEM_PROMPT = "You are a worldbuilding and game-lore assistant. Generate rich, usable lore from the user's idea. Include name, summary, visual identity, history, conflict, secrets, hooks, and how it could be used in a game or story. Match the selected type and tone. Avoid generic filler.";

const promptModeInstructions = {
  "Image Prompt": "Optimize the improved prompt for image generation. Emphasize subject, visual composition, camera/framing, lighting, style, mood, texture, color, negative constraints if useful, and a clear image output format.",
  "Story/Lore Prompt": "Optimize the improved prompt for worldbuilding and lore generation. Emphasize setting, factions, characters, conflicts, myths, locations, timeline hooks, tone, and the desired structured output.",
  "Code Prompt": "Optimize the improved prompt for coding help. Emphasize goal, environment, language/framework, constraints, expected behavior, error context, deliverables, and verification steps."
};

const state = {
  activeId: tools[0].id,
  chatMessages: [],
  lastEnhancedPrompt: "",
  lastPromptEnhanced: "",
  lastLoreOutput: "",
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
  setPromptControls(tool);
  setLoreControls(tool);
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

function isPromptEnhancer(tool) {
  return tool.id === "prompt";
}

function isLoreGenerator(tool) {
  return tool.id === "lore";
}

function backendStatusMessage(tool) {
  if (tool.endpoint === "ai-image") return "Image Generator is connected to ai-image.";
  if (tool.id === "prompt") return "Prompt Enhancer is connected to ai-chat / Ollama.";
  if (tool.id === "lore") return "Lore Generator is connected to ai-chat / Ollama.";
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
  if (activeTool().id === "prompt") {
    state.lastPromptEnhanced = "";
    setPromptOutputActions();
  }
  if (activeTool().id === "lore") {
    state.lastLoreOutput = "";
    setLoreOutputActions();
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
  els.file.addEventListener("change", () => {
    els.fileList.textContent = fileSummary();
  });
}

boot();
