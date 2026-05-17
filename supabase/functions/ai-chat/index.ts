import "@supabase/functions-js/edge-runtime.d.ts";
import { generateAiText, messagesToPrompt, type ChatMessage } from "../_shared/ai-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json"
};

const AI_PROVIDER_TIMEOUT_MS = 20000;

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

function sanitizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((message) => {
      const source = typeof message === "object" && message !== null
        ? (message as Record<string, unknown>)
        : {};
      const rawRole = String(source.role || "user");
      const role: ChatMessage["role"] = rawRole === "system" || rawRole === "assistant" ? rawRole : "user";
      const content = String(source.content || "").trim().slice(0, 4000);

      return { role, content };
    })
    .filter((message) => message.content);
}

async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse({
      ok: false,
      error: "Method not allowed",
      details: "Use POST for AI chat requests."
    }, 405);
  }

  let body: { prompt?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch (error) {
    console.error("AI chat invalid JSON body:", error);
    return jsonResponse({
      ok: false,
      error: "Invalid JSON body",
      details: errorDetails(error)
    }, 400);
  }

  const prompt = String(body.prompt || "").trim();
  const messages = sanitizeMessages(body.messages);
  const aiMessages: ChatMessage[] = messages.length ? messages : prompt ? [{
    role: "user",
    content: prompt
  }] : [];
  const userPrompt = prompt || messagesToPrompt(aiMessages);

  if (!aiMessages.length || !userPrompt) {
    return jsonResponse({
      ok: false,
      error: "No prompt or messages provided",
      details: "Send { \"prompt\": \"...\" } or { \"messages\": [{ \"role\": \"user\", \"content\": \"...\" }] }."
    }, 400);
  }

  try {
    const result = await generateAiText({
      messages: aiMessages,
      prompt: userPrompt,
      timeoutMs: AI_PROVIDER_TIMEOUT_MS,
      maxTokens: 120,
      temperature: 0.4
    });

    return jsonResponse(result);
  } catch (error) {
    console.error("AI chat provider error:", error);
    return jsonResponse({
      ok: false,
      error: "AI provider request failed",
      details: errorDetails(error)
    }, 500);
  }
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error("AI chat unhandled function error:", error);
    return jsonResponse({
      ok: false,
      error: "AI chat function failed",
      details: errorDetails(error)
    }, 500);
  }
});
