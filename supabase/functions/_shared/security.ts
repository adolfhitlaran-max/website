const ALLOWED_ORIGINS = new Set([
  "https://uncensoredmedia.io",
  "https://www.uncensoredmedia.io"
]);

const DEFAULT_ORIGIN = "https://uncensoredmedia.io";
const INTERNAL_ERROR_PATTERN = /https?:\/\/[^\s"'<>]+|\b(?:\d{1,3}\.){3}\d{1,3}\b|Bearer\s+[A-Za-z0-9._-]+|(?:sk|hf)_[A-Za-z0-9._-]+/gi;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export type MemberAccess = {
  user: Record<string, unknown>;
  profile: Record<string, unknown>;
};

export function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

export function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json"
    }
  });
}

export function errorDetails(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch (_jsonError) {
    return "Unknown error";
  }
}

export function publicErrorDetails(error: unknown) {
  return errorDetails(error).replace(INTERNAL_ERROR_PATTERN, "[redacted]");
}

export async function requireMemberAccess(req: Request): Promise<MemberAccess | Response> {
  const authHeader = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authHeader)) {
    return jsonResponse(req, {
      ok: false,
      error: "Authentication required",
      details: "Sign in and unlock subscriber access before using AI tools."
    }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (!supabaseUrl || !anonKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY for Edge Function auth guard.");
    return jsonResponse(req, {
      ok: false,
      error: "Server auth guard is not configured"
    }, 500);
  }

  let user: Record<string, unknown>;
  try {
    const userResponse = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: {
        "apikey": anonKey,
        "Authorization": authHeader
      }
    });

    if (!userResponse.ok) {
      console.error("AI auth guard user validation failed:", userResponse.status, await safeResponseText(userResponse));
      return jsonResponse(req, {
        ok: false,
        error: "Authentication required",
        details: "Your session could not be verified. Sign in again."
      }, 401);
    }

    user = await userResponse.json();
  } catch (error) {
    console.error("AI auth guard user validation crashed:", error);
    return jsonResponse(req, {
      ok: false,
      error: "Authentication check failed",
      details: publicErrorDetails(error)
    }, 500);
  }

  const userId = String(user?.id || "").trim();
  if (!userId) {
    return jsonResponse(req, {
      ok: false,
      error: "Authentication required",
      details: "Your session did not include a valid user id."
    }, 401);
  }

  try {
    const profileUrl = new URL(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/profiles`);
    profileUrl.searchParams.set("select", "id,access_granted");
    profileUrl.searchParams.set("id", `eq.${userId}`);
    profileUrl.searchParams.set("limit", "1");

    const profileResponse = await fetch(profileUrl, {
      headers: {
        "apikey": anonKey,
        "Authorization": authHeader,
        "Accept": "application/json"
      }
    });

    const profileText = await profileResponse.text();
    if (!profileResponse.ok) {
      console.error("AI auth guard profile lookup failed:", profileResponse.status, profileText);
      return jsonResponse(req, {
        ok: false,
        error: "Access check failed",
        details: "Your profile access could not be verified."
      }, 403);
    }

    const rows = profileText ? JSON.parse(profileText) : [];
    const profile = Array.isArray(rows) ? rows[0] : null;
    if (!profile?.access_granted) {
      return jsonResponse(req, {
        ok: false,
        error: "Access code required",
        details: "Enter a valid subscriber access code before using AI tools."
      }, 403);
    }

    return { user, profile };
  } catch (error) {
    console.error("AI auth guard profile lookup crashed:", error);
    return jsonResponse(req, {
      ok: false,
      error: "Access check failed",
      details: publicErrorDetails(error)
    }, 500);
  }
}

export function rateLimit(
  req: Request,
  key: string,
  options: { label: string; limit: number; windowMs: number }
) {
  const now = Date.now();
  const bucketKey = `${options.label}:${key}`;
  const bucket = rateBuckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + options.windowMs
    });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= options.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return new Response(JSON.stringify({
    ok: false,
    error: "Rate limit exceeded",
    details: `Too many ${options.label} requests. Try again in ${retryAfter} seconds.`
  }), {
    status: 429,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter)
    }
  });
}

async function safeResponseText(response: Response) {
  try {
    return await response.text();
  } catch (_error) {
    return "";
  }
}
