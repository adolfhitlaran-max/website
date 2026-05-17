import "@supabase/functions-js/edge-runtime.d.ts";
import { InferenceClient } from "@huggingface/inference";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json"
};

const DEFAULT_MODEL = "stabilityai/stable-diffusion-xl-base-1.0";
const DEFAULT_PROVIDER = "hf-inference";
const HF_TIMEOUT_MS = 45000;

type ImageRequestBody = {
  prompt?: unknown;
  style?: unknown;
  aspectRatio?: unknown;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

function errorDetails(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch (_jsonError) {
    return "Unknown error";
  }
}

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

function buildImagePrompt(prompt: string, style: string) {
  return [
    prompt,
    style && `Style: ${style}`,
    "high detail, polished composition, strong lighting"
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

async function generateWithHuggingFace(prompt: string, style: string, aspectRatio: string) {
  const apiKey = Deno.env.get("HUGGINGFACE_API_KEY")?.trim();
  if (!apiKey) {
    throw new Error("Missing HUGGINGFACE_API_KEY");
  }

  const model = Deno.env.get("HUGGINGFACE_IMAGE_MODEL")?.trim() || DEFAULT_MODEL;
  const provider = Deno.env.get("HUGGINGFACE_IMAGE_PROVIDER")?.trim() || DEFAULT_PROVIDER;
  const dimensions = aspectDimensions(aspectRatio);
  const fullPrompt = buildImagePrompt(prompt, style);
  const client = new InferenceClient(apiKey);

  const image = await withTimeout(
    client.textToImage({
      provider,
      model,
      inputs: fullPrompt,
      parameters: {
        width: dimensions.width,
        height: dimensions.height
      }
    }),
    HF_TIMEOUT_MS,
    "Hugging Face image request timed out."
  );

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
    aspectRatio,
    width: dimensions.width,
    height: dimensions.height,
    mimeType,
    image_url: `data:${mimeType};base64,${base64}`
  };
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
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse({
      ok: false,
      error: "Method not allowed",
      details: "Use POST for AI image requests."
    }, 405);
  }

  let body: ImageRequestBody;
  try {
    body = await req.json();
  } catch (error) {
    console.error("AI image invalid JSON body:", error);
    return jsonResponse({
      ok: false,
      error: "Invalid JSON body",
      details: errorDetails(error)
    }, 400);
  }

  const prompt = cleanText(body.prompt);
  const style = cleanText(body.style, "dark modern cinematic");
  const aspectRatio = cleanText(body.aspectRatio, "1:1");

  if (!prompt) {
    return jsonResponse({
      ok: false,
      error: "Missing prompt",
      details: "Send { \"prompt\": \"...\", \"style\": \"...\", \"aspectRatio\": \"1:1\" }."
    }, 400);
  }

  try {
    const result = await generateWithHuggingFace(prompt, style, aspectRatio);
    return jsonResponse(result);
  } catch (error) {
    console.error("AI image function provider error:", error);
    return jsonResponse({
      ok: false,
      error: "Hugging Face image generation failed",
      details: errorDetails(error)
    }, 502);
  }
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error("AI image unhandled function error:", error);
    return jsonResponse({
      ok: false,
      error: "AI image function failed",
      details: errorDetails(error)
    }, 500);
  }
});
