# Security Audit - Uncensored Media

Date: 2026-05-18

## SAFE

- No Supabase `service_role` key was found in tracked frontend code.
- No OpenAI, OpenRouter, Anthropic, Hugging Face, or service-role secret value was found in tracked frontend JavaScript.
- No direct Ollama endpoint, home public IP, LAN IP, Cloudflare tunnel URL, or localhost Ollama URL was found in tracked browser JavaScript.
- The browser only contains the Supabase anon key. That key is public by design, but it is only safe when RLS is correct.
- AI Lab and Archivist AI frontend calls now send the signed-in user's Supabase JWT instead of calling AI Edge Functions anonymously.
- `.env`, Supabase env files, private keys, local config, logs, and Supabase temp files are ignored.
- `.env.example` contains fake placeholders only.

## FIXED

- `supabase/config.toml`
  - Set `verify_jwt = true` for `chat`, `ai-chat`, `ai-image`, and `ai-music`.
  - Added security comments documenting that AI functions require JWT and member access.

- `supabase/functions/_shared/security.ts`
  - Added shared CORS, auth, access-code, error-redaction, and rate-limit helpers.
  - CORS now only allows:
    - `https://uncensoredmedia.io`
    - `https://www.uncensoredmedia.io`
  - AI functions now require a valid Supabase user session and `profiles.access_granted = true`.
  - Public error details redact URLs, IPs, bearer tokens, and common API token patterns.
  - Added basic per-user in-function rate limiting.

- `supabase/functions/_shared/ai-provider.ts`
  - `LOCAL_OLLAMA_URL` is still read only from Supabase secrets/env.
  - Direct `localhost`, LAN IP, private IP, and non-HTTPS provider URLs are rejected.
  - This forces Ollama traffic through an HTTPS tunnel or reverse proxy instead of raw home-network access.

- `supabase/functions/chat/index.ts`
  - Archivist AI now requires authenticated member access.
  - Added rate limiting and restricted CORS.

- `supabase/functions/ai-chat/index.ts`
  - AI Lab chat/prompt/lore/code tools now require authenticated member access.
  - Added rate limiting and restricted CORS.

- `supabase/functions/ai-image/index.ts`
  - Image generation now requires authenticated member access.
  - Added stricter CORS, rate limiting, and redacted provider errors.

- `supabase/functions/ai-music/index.ts`
  - Music backend remains disabled in the UI, but the function is now protected.
  - `MUSICGEN_URL` and `HF_MUSIC_ENDPOINT` must be HTTPS and cannot point at local/private IPs.
  - Supports optional `MUSICGEN_PROXY_TOKEN` forwarded as `X-UM-Proxy-Token`.

- `scripts/ai-lab.js`
  - AI Lab requests now include `Authorization: Bearer <current user JWT>`.
  - Unauthenticated users get a clear sign-in/access message instead of silently hitting public AI.

- `js/ai-widget.js`
  - Archivist AI now gets the current Supabase session before calling the Edge Function.
  - Navigation commands still happen locally without an AI call.
  - Logged-out users see a clear member-access message instead of exposing the backend.

- `local-services/musicgen-server/app.py`
  - CORS no longer allows `*`.
  - Optional `MUSICGEN_PROXY_TOKEN` protects `/generate`.
  - Error responses no longer echo raw exception text.

- `local-services/musicgen-server/README.md`
  - Updated to bind MusicGen to `127.0.0.1`.
  - Explicitly says not to port-forward or bind to `0.0.0.0`.
  - Documents Cloudflare Tunnel and shared proxy-token setup.

- `supabase/chat-setup.sql`
  - Removed anonymous chat read access.
  - Chat messages are now readable by signed-in users only.

- `supabase/member-content-rls-hardening.sql`
  - Added a hardening SQL file for forum posts, forum comments, game scores, chat messages, and Pictionary rooms.
  - It enables RLS where tables exist, removes anon access, and ties writes to `auth.uid()`.

## RISKY

- A local ignored file exists at `supabase/.env.local`.
  - It is ignored and not shown in `git status`.
  - It contains local AI configuration.
  - Make sure it never gets committed and that deployed Supabase secrets use HTTPS tunnel/proxy URLs, not LAN or home IP URLs.

- Basic in-function rate limiting is now present, but Edge Function memory is not a perfect global rate limiter.
  - Add Cloudflare WAF/rate limiting or Supabase-side abuse controls for serious public traffic.

- Public avatar URLs are allowed because the profile system uses public avatar images.
  - This is fine for profile pictures, but do not store private images in the public `avatars` bucket.

- `profiles` are owner-readable in the access-code setup.
  - This protects private user fields, but public author display can fail unless the site loads safe public author info through a view/RPC later.

## CRITICAL

- Do not expose Ollama directly.
  - No tracked frontend file exposes Ollama now.
  - Edge Functions now reject direct local/private/non-HTTPS Ollama URLs.
  - Still manually confirm your router has no port forward to `11434`.

- Do not expose MusicGen directly.
  - The local docs now bind to `127.0.0.1`.
  - Still manually confirm no router port forward to `7860`.
  - Use Cloudflare Tunnel or a reverse proxy with auth/rate limiting.

- Deploying these function changes is required.
  - The repo is hardened, but Supabase will keep running the old function code until you deploy.

## STILL NEEDS MANUAL CHECK

1. Router/firewall
   - Confirm there is no inbound port forwarding to:
     - Ollama `11434`
     - MusicGen `7860`
     - any admin dashboard
   - Confirm inbound firewall blocks unsolicited public traffic.

2. Ollama host binding
   - Prefer `OLLAMA_HOST=127.0.0.1:11434`.
   - Do not run Ollama bound to `0.0.0.0` on a home network.
   - If another machine needs access, use Cloudflare Tunnel/reverse proxy with auth, not router port forwarding.

3. Cloudflare Tunnel
   - Confirm it is outbound-only.
   - Add Cloudflare Access or another auth layer for private local providers.
   - Add Cloudflare rate limiting for AI routes.
   - Do not share tunnel URLs publicly.

4. Supabase secrets
   - Confirm real secrets are set in the Supabase dashboard or CLI, not committed files:
     - `LOCAL_OLLAMA_URL=https://...`
     - `OLLAMA_MODEL=llama3.2:3b`
     - `OPENROUTER_API_KEY=...` if using OpenRouter fallback
     - `HUGGINGFACE_API_KEY=...`
     - `MUSICGEN_PROXY_TOKEN=...` if using MusicGen
   - `LOCAL_OLLAMA_URL` and `MUSICGEN_URL` should be HTTPS tunnel/proxy URLs only.

5. Supabase deployment
   - Deploy the functions after these changes:
     - `supabase functions deploy chat`
     - `supabase functions deploy ai-chat`
     - `supabase functions deploy ai-image`
     - `supabase functions deploy ai-music`
   - Run the SQL hardening file if those tables exist:
     - `supabase/member-content-rls-hardening.sql`

6. Supabase dashboard RLS verification
   - Confirm RLS is enabled on every public table:
     - `profiles`
     - `access_codes`
     - `forum_posts`
     - `forum_comments`
     - `game_scores`
     - `chat_messages`
     - `pictionary_rooms`
     - `ai_generations`
   - Confirm no table allows anonymous update/delete.
   - Confirm `access_codes` cannot be selected directly by `anon` or normal authenticated users.

7. Logs
   - Confirm Cloudflare, Supabase, and local service logs do not print API tokens, authorization headers, or full tunnel/provider URLs.

## EXACT FIX COMMANDS

Deploy functions:

```bash
supabase functions deploy chat
supabase functions deploy ai-chat
supabase functions deploy ai-image
supabase functions deploy ai-music
```

Set safe Ollama secrets:

```bash
supabase secrets set LOCAL_OLLAMA_URL=https://YOUR-CLOUDFLARE-TUNNEL-OR-PROXY
supabase secrets set OLLAMA_MODEL=llama3.2:3b
```

Set MusicGen secrets only when MusicGen is ready:

```bash
supabase secrets set MUSICGEN_URL=https://YOUR-CLOUDFLARE-TUNNEL-OR-PROXY
supabase secrets set MUSICGEN_PROXY_TOKEN=USE_A_LONG_RANDOM_VALUE
```

Run SQL hardening:

```sql
-- paste and run:
-- supabase/member-content-rls-hardening.sql
```

## VERIFICATION RUN

- `node --check scripts/ai-lab.js` passed.
- `node --check js/ai-widget.js` passed.
- `git diff --check` passed.
- Secret scans found no real service-role/private API key in tracked source.
- Public IP scan found no home public IP in tracked source.
- `deno` is not installed locally, so Edge Function TypeScript could not be checked with `deno check` on this machine.
- Python is not installed locally, so `local-services/musicgen-server/app.py` could not be bytecode-checked on this machine.
