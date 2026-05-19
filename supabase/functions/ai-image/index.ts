import "@supabase/functions-js/edge-runtime.d.ts";
import { InferenceClient } from "@huggingface/inference";
import { errorDetails, jsonResponse, publicErrorDetails, rateLimit, requireMemberAccess } from "../_shared/security.ts";

const FALLBACK_MODELS = [
  "black-forest-labs/FLUX.1-schnell",
  "stabilityai/stable-diffusion-3.5-large",
  "runwayml/stable-diffusion-v1-5"
];
const DEFAULT_PROVIDER = "hf-inference";
const HF_TIMEOUT_MS = 45000;

type ImageRequestBody = {
  prompt?: unknown;
  style?: unknown;
  aspectRatio?: unknown;
  negativePrompt?: unknown;
};

type ModelFailure = {
  model: string;
  error: string;
};

type ImageGenerationError = Error & {
  failures?: ModelFailure[];
};

const STYLE_MODIFIERS: Record<string, string> = {
  default: "high detail, polished composition, strong lighting",
  "pixel art": "pixel art, retro game sprite style, crisp pixels, 16-bit aesthetic",
  "lego style": "LEGO-inspired toy figure, plastic brick texture, minifigure proportions, playful toy photography style",
  "dark fantasy": "dark fantasy concept art, dramatic lighting, ancient ruins, ominous atmosphere",
  anime: "anime illustration, expressive character design, clean linework, vibrant color",
  realistic: "realistic photography, natural lighting, believable textures, sharp detail",
  cinematic: "cinematic still, dramatic composition, film lighting, rich contrast",
  "retro 80s": "retro 1980s poster art, neon lighting, synthwave color palette, airbrushed texture",
  "medieval manuscript": "medieval illuminated manuscript, ornate borders, aged parchment, hand-painted miniature style",
  "conspiracy poster": "vintage conspiracy poster, dramatic collage, newspaper clippings, red string board aesthetic",
  "game map": "top-down game map, readable layout, environmental landmarks, fantasy cartography",
  "concept art": "professional concept art, production design, clear silhouettes, mood painting",
  "logo/icon": "clean logo icon, simple memorable silhouette, scalable vector-like design, centered composition"
};

function cleanText(value: unknown, fallback = "") {
  return String(value || fallback).trim().slice(0, 2000);
}

function aspectDimensions(aspectRatio: string) {
  const normalized = aspectRatio.toLowerCase().replace(/\s+/g, "");

  const presets: Record<string, { width: number; height: number }> = {
    "1:1": { width: 1024, height: 1024 },
    square: { width: 1024, height: 1024 },
    "16:9": { width: 1024, height: 576 },
    landscape: { width: 1024, height: 576 },
    "9:16": { width: 576, height: 1024 },
    portrait: { width: 576, height: 1024 },
    "4:3": { width: 1024, height: 768 },
    "3:4": { width: 768, height: 1024 }
  };

  return presets[normalized] || presets["1:1"];
}

function styleModifier(style: string) {
  const key = String(style || "default").trim().toLowerCase();
  return STYLE_MODIFIERS[key] || style || STYLE_MODIFIERS.default;
}

function buildImagePrompt(prompt: string, style: string, aspectRatio: string, negativePrompt: string) {
  return [
    prompt,
    `Style: ${style || "Default"}`,
    styleModifier(style),
    `Requested aspect ratio: ${aspectRatio}`,
    negativePrompt && `Avoid: ${negativePrompt}`
  ].filter(Boolean).join(". ");
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function imageModelsFromEnvironment() {
  const configuredModel = Deno.env.get("HF_IMAGE_MODEL")?.trim();
  const models = configuredModel ? [configuredModel, ...FALLBACK_MODELS] : FALLBACK_MODELS;
  return [...new Set(models)];
}

async function generateWithHuggingFace(prompt: string, style: string, aspectRatio: string, negativePrompt: string) {
  const apiKey = Deno.env.get("HUGGINGFACE_API_KEY")?.trim();
  if (!apiKey) {
    throw new Error("Missing HUGGINGFACE_API_KEY");
  }

  const provider = Deno.env.get("HUGGINGFACE_IMAGE_PROVIDER")?.trim() || DEFAULT_PROVIDER;
  const dimensions = aspectDimensions(aspectRatio);
  const fullPrompt = buildImagePrompt(prompt, style, aspectRatio, negativePrompt);
  const client = new InferenceClient(apiKey);
  const failures: ModelFailure[] = [];

  for (const model of imageModelsFromEnvironment()) {
    try {
      const image = await generateModelImage(client, provider, model, fullPrompt, dimensions);

      if (!image || typeof (image as Blob).arrayBuffer !== "function") {
        throw new Error("Hugging Face returned an invalid image response.");
      }

      const blob = image as Blob;
      const mimeType = blob.type || "image/png";
      const base64 = arrayBufferToBase64(await blob.arrayBuffer());

      return {
        ok: true,
        provider: "huggingface",
        hf_provider: provider,
        model,
        prompt,
        style,
        negativePrompt,
        aspectRatio,
        width: dimensions.width,
        height: dimensions.height,
        mimeType,
        image_url: `data:${mimeType};base64,${base64}`
      };
    } catch (error) {
      const details = publicErrorDetails(error);
      failures.push({ model, error: details });
      console.error(`Hugging Face image model failed (${model}):`, error);
    }
  }

  const detailLines = failures.map((failure) => `${failure.model}: ${failure.error}`);
  const error = new Error(`All Hugging Face image models failed. ${detailLines.join(" | ")}`);
  (error as ImageGenerationError).failures = failures;
  throw error;
}

async function generateModelImage(
  client: InferenceClient,
  provider: string,
  model: string,
  prompt: string,
  dimensions: { width: number; height: number }
) {
  try {
    return await withTimeout(
      client.textToImage({
        provider,
        model,
        inputs: prompt,
        parameters: {
          width: dimensions.width,
          height: dimensions.height
        }
      }),
      HF_TIMEOUT_MS,
      `Hugging Face image request timed out for ${model}.`
    );
  } catch (error) {
    console.error(`Hugging Face image dimensions failed for ${model}; retrying without explicit size.`, error);
    return await withTimeout(
      client.textToImage({
        provider,
        model,
        inputs: prompt
      }),
      HF_TIMEOUT_MS,
      `Hugging Face image request without dimensions timed out for ${model}.`
    );
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return jsonResponse(req, { ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, {
      ok: false,
      error: "Method not allowed",
      details: "Use POST for AI image requests."
    }, 405);
  }

  const memberAccess = await requireMemberAccess(req);
  if (memberAccess instanceof Response) return memberAccess;
  const rateLimitResponse = rateLimit(req, String(memberAccess.user.id || "unknown"), {
    label: "ai-image",
    limit: 8,
    windowMs: 10 * 60_000
  });
  if (rateLimitResponse) return rateLimitResponse;

  let body: ImageRequestBody;
  try {
    body = await req.json();
  } catch (error) {
    console.error("AI image invalid JSON body:", error);
    return jsonResponse(req, {
      ok: false,
      error: "Invalid JSON body",
      details: errorDetails(error)
    }, 400);
  }

  const prompt = cleanText(body.prompt);
  const style = cleanText(body.style, "Default");
  const aspectRatio = cleanText(body.aspectRatio, "1:1");
  const negativePrompt = cleanText(body.negativePrompt);

  if (!prompt) {
    return jsonResponse(req, {
      ok: false,
      error: "Missing prompt",
      details: "Send { \"prompt\": \"...\", \"style\": \"...\", \"aspectRatio\": \"1:1\" }."
    }, 400);
  }

  try {
    const result = await generateWithHuggingFace(prompt, style, aspectRatio, negativePrompt);
    return jsonResponse(req, result);
  } catch (error) {
    console.error("AI image function provider error:", error);
    const failures = (error as ImageGenerationError)?.failures;
    const body: Record<string, unknown> = {
      ok: false,
      error: "Hugging Face image generation failed",
      details: publicErrorDetails(error)
    };
    if (failures?.length) body.failures = failures;
    return jsonResponse(req, body, 502);
  }
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error("AI image unhandled function error:", error);
    return jsonResponse(req, {
      ok: false,
      error: "AI image function failed",
      details: publicErrorDetails(error)
    }, 500);
  }
});
