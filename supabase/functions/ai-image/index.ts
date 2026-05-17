import "@supabase/functions-js/edge-runtime.d.ts";

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

function modelUrl(model: string) {
  const path = model.split("/").map(encodeURIComponent).join("/");
  return `https://api-inference.huggingface.co/models/${path}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
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

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function demoImage(prompt: string, style: string, aspectRatio: string, reason: string) {
  const safePrompt = escapeXml(prompt || "AI image preview");
  const safeStyle = escapeXml(style || "Demo style");
  const { width, height } = aspectDimensions(aspectRatio);
  const fontSize = Math.max(24, Math.round(width / 26));
  const subtitleSize = Math.max(16, Math.round(width / 46));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    "<defs>",
    '<linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">',
    '<stop offset="0%" stop-color="#06070a"/>',
    '<stop offset="48%" stop-color="#191c23"/>',
    '<stop offset="100%" stop-color="#3b0d13"/>',
    "</linearGradient>",
    '<linearGradient id="line" x1="0" x2="1">',
    '<stop offset="0%" stop-color="#e5242a"/>',
    '<stop offset="100%" stop-color="#00d5ff"/>',
    "</linearGradient>",
    "</defs>",
    '<rect width="100%" height="100%" fill="url(#bg)"/>',
    `<rect x="${width * 0.06}" y="${height * 0.08}" width="${width * 0.88}" height="${height * 0.84}" rx="18" fill="rgba(255,255,255,0.045)" stroke="rgba(245,239,226,0.22)"/>`,
    `<rect x="${width * 0.1}" y="${height * 0.16}" width="${width * 0.8}" height="6" fill="url(#line)"/>`,
    `<text x="${width * 0.1}" y="${height * 0.31}" fill="#f5efe2" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900">AI IMAGE DEMO</text>`,
    `<text x="${width * 0.1}" y="${height * 0.43}" fill="#c9c4b8" font-family="Arial, sans-serif" font-size="${subtitleSize}">${safePrompt}</text>`,
    `<text x="${width * 0.1}" y="${height * 0.53}" fill="#ffb83d" font-family="Arial, sans-serif" font-size="${subtitleSize}">${safeStyle}</text>`,
    `<text x="${width * 0.1}" y="${height * 0.66}" fill="#8f969f" font-family="Arial, sans-serif" font-size="${Math.max(14, subtitleSize - 2)}">Fallback: ${escapeXml(reason)}</text>`,
    "</svg>"
  ].join("");

  return {
    ok: true,
    provider: "demo",
    demo: true,
    prompt,
    style,
    aspectRatio,
    width,
    height,
    mimeType: "image/svg+xml",
    imageUrl: svgDataUrl(svg),
    message: "Demo image returned because Hugging Face image generation is not available right now.",
    details: reason
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function generateWithHuggingFace(prompt: string, style: string, aspectRatio: string) {
  const apiKey = Deno.env.get("HUGGINGFACE_API_KEY")?.trim();
  if (!apiKey) {
    return demoImage(prompt, style, aspectRatio, "Missing HUGGINGFACE_API_KEY");
  }

  const model = Deno.env.get("HUGGINGFACE_IMAGE_MODEL")?.trim() || DEFAULT_MODEL;
  const dimensions = aspectDimensions(aspectRatio);
  const fullPrompt = buildImagePrompt(prompt, style);

  const response = await fetchWithTimeout(
    modelUrl(model),
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "image/png",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: fullPrompt,
        parameters: {
          width: dimensions.width,
          height: dimensions.height
        },
        options: {
          wait_for_model: true
        }
      })
    },
    HF_TIMEOUT_MS
  );

  const contentType = response.headers.get("content-type") || "";
  const responseBuffer = await response.arrayBuffer();

  if (!response.ok) {
    const details = decodeResponseText(responseBuffer) || `Hugging Face returned ${response.status} ${response.statusText}`;
    console.error("Hugging Face image request failed:", details);
    return demoImage(prompt, style, aspectRatio, details);
  }

  if (!contentType.startsWith("image/")) {
    const details = decodeResponseText(responseBuffer) || `Unexpected Hugging Face content type: ${contentType}`;
    console.error("Hugging Face image response was not an image:", details);
    return demoImage(prompt, style, aspectRatio, details);
  }

  const mimeType = contentType.split(";")[0] || "image/png";
  const base64 = arrayBufferToBase64(responseBuffer);

  return {
    ok: true,
    provider: "huggingface",
    demo: false,
    model,
    prompt,
    style,
    aspectRatio,
    width: dimensions.width,
    height: dimensions.height,
    mimeType,
    imageUrl: `data:${mimeType};base64,${base64}`
  };
}

function decodeResponseText(buffer: ArrayBuffer) {
  try {
    return new TextDecoder().decode(buffer).trim();
  } catch (_error) {
    return "";
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
    return jsonResponse(demoImage(prompt, style, aspectRatio, errorDetails(error)));
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
