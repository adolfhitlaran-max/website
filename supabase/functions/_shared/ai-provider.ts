export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiProvider = "ollama" | "openrouter";

export type AiProviderResult = {
  ok: true;
  provider: AiProvider;
  model: string;
  text: string;
};

type GenerateAiTextOptions = {
  messages: ChatMessage[];
  prompt?: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  fallbackReply?: string;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
const DEFAULT_OLLAMA_MODEL = "llama3.2:3b";
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_FALLBACK_REPLY = "I had a thought and immediately lost it. Try again, genius.";

export function providerFromEnvironment(): AiProvider {
  return Deno.env.get("LOCAL_OLLAMA_URL")?.trim() ? "ollama" : "openrouter";
}

export function ollamaModelFromEnvironment() {
  return Deno.env.get("OLLAMA_MODEL")?.trim() || DEFAULT_OLLAMA_MODEL;
}

export function messagesToPrompt(messages: ChatMessage[]) {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n")
    .trim();
}

export async function generateAiText(options: GenerateAiTextOptions): Promise<AiProviderResult> {
  if (providerFromEnvironment() === "ollama") {
    return generateWithOllama(options);
  }

  return generateWithOpenRouter(options);
}

async function generateWithOllama(options: GenerateAiTextOptions): Promise<AiProviderResult> {
  const baseUrl = Deno.env.get("LOCAL_OLLAMA_URL")?.trim();
  if (!baseUrl) {
    throw new Error("LOCAL_OLLAMA_URL is not configured.");
  }

  const model = ollamaModelFromEnvironment();
  const prompt = (options.prompt || messagesToPrompt(options.messages)).trim();
  if (!prompt) {
    throw new Error("No prompt provided for Ollama.");
  }

  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/+$/, "")}/api/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false
      })
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(responseText || `Ollama returned ${response.status} ${response.statusText}`);
  }

  let data: { response?: unknown };
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    throw new Error(`Ollama returned invalid JSON: ${errorDetails(error)}`);
  }

  const text = String(data.response || "").trim() || (options.fallbackReply || DEFAULT_FALLBACK_REPLY);
  return {
    ok: true,
    provider: "ollama",
    model,
    text
  };
}

async function generateWithOpenRouter(options: GenerateAiTextOptions): Promise<AiProviderResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY")?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const model = Deno.env.get("OPENROUTER_MODEL")?.trim() || DEFAULT_OPENROUTER_MODEL;
  const response = await fetchWithTimeout(
    OPENROUTER_URL,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://uncensoredmedia.io",
        "X-Title": "Uncensored Media Archivist AI"
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        max_tokens: options.maxTokens ?? 120,
        temperature: options.temperature ?? 0.4
      })
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(responseText || `OpenRouter returned ${response.status} ${response.statusText}`);
  }

  let data: unknown;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    throw new Error(`OpenRouter returned invalid JSON: ${errorDetails(error)}`);
  }

  return {
    ok: true,
    provider: "openrouter",
    model,
    text: extractOpenRouterReply(data, options.fallbackReply || DEFAULT_FALLBACK_REPLY)
  };
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

function extractOpenRouterReply(data: unknown, fallbackReply: string) {
  if (typeof data !== "object" || data === null) return fallbackReply;

  const root = data as {
    choices?: Array<{
      text?: unknown;
      message?: {
        content?: unknown;
        reasoning?: unknown;
      };
    }>;
  };

  const choice = root.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null && "text" in part) {
          return String((part as { text?: unknown }).text || "");
        }
        return "";
      })
      .join("")
      .trim();

    if (joined) return joined;
  }

  if (typeof choice?.message?.reasoning === "string" && choice.message.reasoning.trim()) {
    console.error("OpenRouter returned reasoning without content; using safe fallback.");
    return fallbackReply;
  }

  if (typeof choice?.text === "string" && choice.text.trim()) {
    return choice.text.trim();
  }

  return fallbackReply;
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
