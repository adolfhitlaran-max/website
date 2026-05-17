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

const MUSIC_TIMEOUT_MS = 120000;

type MusicRequestBody = {
  prompt?: unknown;
  genre?: unknown;
  duration?: unknown;
  bpm?: unknown;
  mood?: unknown;
};

type ProviderFailure = {
  provider: string;
  error: string;
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

function cleanDuration(value: unknown) {
  const parsed = Number(value || 10);
  if ([5, 10, 15, 30].includes(parsed)) return parsed;
  return 10;
}

function cleanBpm(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(40, Math.min(240, Math.round(parsed)));
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function buildProviderPayload(body: MusicRequestBody) {
  const prompt = cleanText(body.prompt);
  const genre = cleanText(body.genre, "Fantasy");
  const duration = cleanDuration(body.duration);
  const bpm = cleanBpm(body.bpm);
  const mood = cleanText(body.mood);

  return {
    prompt,
    genre,
    duration,
    bpm,
    mood
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

async function postJson(url: string, payload: Record<string, unknown>, providerName: string) {
  const response = await withTimeout(fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }), MUSIC_TIMEOUT_MS, `${providerName} request timed out.`);

  const responseText = await response.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    console.error(`${providerName} returned invalid JSON:`, { responseText, error });
    throw new Error(`${providerName} returned invalid JSON.`);
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(String(data?.details || data?.detail || data?.error || `${providerName} returned ${response.status}.`));
  }

  const audioUrl = String(data?.audio_url || data?.audioUrl || "").trim();
  const audioBase64 = String(data?.audio_base64 || data?.audioBase64 || "").trim();
  const finalAudioUrl = audioUrl || (audioBase64 ? `data:audio/wav;base64,${audioBase64}` : "");

  if (!finalAudioUrl) {
    throw new Error(`${providerName} did not return audio_url.`);
  }

  return {
    ...data,
    ok: true,
    audio_url: finalAudioUrl
  };
}

async function generateWithMusicGenLocal(payload: ReturnType<typeof buildProviderPayload>) {
  const musicgenUrl = Deno.env.get("MUSICGEN_URL")?.trim();
  if (!musicgenUrl) {
    throw new Error("MUSICGEN_URL is not configured.");
  }

  const data = await postJson(joinUrl(musicgenUrl, "/generate"), payload, "musicgen-local");

  return {
    ok: true,
    provider: String(data.provider || "musicgen-local"),
    model: String(data.model || "facebook/musicgen-small"),
    audio_url: String(data.audio_url),
    prompt: String(data.prompt || payload.prompt),
    duration: Number(data.duration || payload.duration)
  };
}

async function generateWithHuggingFaceEndpoint(payload: ReturnType<typeof buildProviderPayload>) {
  const endpoint = Deno.env.get("HF_MUSIC_ENDPOINT")?.trim();
  if (!endpoint) {
    throw new Error("HF_MUSIC_ENDPOINT is not configured.");
  }

  const data = await postJson(endpoint, payload, "huggingface-music-endpoint");

  return {
    ok: true,
    provider: String(data.provider || "huggingface-endpoint"),
    model: String(data.model || "custom-music-endpoint"),
    audio_url: String(data.audio_url),
    prompt: String(data.prompt || payload.prompt),
    duration: Number(data.duration || payload.duration)
  };
}

async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse({
      ok: false,
      error: "Method not allowed",
      details: "Use POST for AI music requests."
    }, 405);
  }

  let body: MusicRequestBody;
  try {
    body = await req.json();
  } catch (error) {
    console.error("AI music invalid JSON body:", error);
    return jsonResponse({
      ok: false,
      error: "Invalid JSON body",
      details: errorDetails(error)
    }, 400);
  }

  const payload = buildProviderPayload(body);
  if (!payload.prompt) {
    return jsonResponse({
      ok: false,
      error: "Missing prompt",
      details: "Send { \"prompt\": \"...\", \"genre\": \"Fantasy\", \"duration\": 10, \"bpm\": 120, \"mood\": \"heroic\" }."
    }, 400);
  }

  const hasMusicGen = Boolean(Deno.env.get("MUSICGEN_URL")?.trim());
  const hasHfEndpoint = Boolean(Deno.env.get("HF_MUSIC_ENDPOINT")?.trim());
  if (!hasMusicGen && !hasHfEndpoint) {
    return jsonResponse({
      ok: false,
      error: "Music generator provider is not configured."
    }, 500);
  }

  const failures: ProviderFailure[] = [];

  if (hasMusicGen) {
    try {
      return jsonResponse(await generateWithMusicGenLocal(payload));
    } catch (error) {
      console.error("MusicGen local provider failed:", error);
      failures.push({ provider: "musicgen-local", error: errorDetails(error) });
    }
  }

  if (hasHfEndpoint) {
    try {
      return jsonResponse(await generateWithHuggingFaceEndpoint(payload));
    } catch (error) {
      console.error("Hugging Face music endpoint failed:", error);
      failures.push({ provider: "huggingface-endpoint", error: errorDetails(error) });
    }
  }

  return jsonResponse({
    ok: false,
    error: "Music generation failed.",
    details: failures.map((failure) => `${failure.provider}: ${failure.error}`).join(" | "),
    failures
  }, 500);
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error("AI music unhandled function error:", error);
    return jsonResponse({
      ok: false,
      error: "AI music function failed",
      details: errorDetails(error)
    }, 500);
  }
});
