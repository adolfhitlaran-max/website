# MusicGen Local Server

Local FastAPI service for the AI Lab Music Generator.

The website calls:

```text
Frontend -> Supabase Edge Function ai-music -> MUSICGEN_URL/generate
```

## Setup

```bash
cd local-services/musicgen-server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On Windows PowerShell:

```powershell
cd local-services/musicgen-server
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```bash
uvicorn app:app --host 0.0.0.0 --port 7860
```

Health check:

```bash
curl http://127.0.0.1:7860/health
```

Generate directly:

```bash
curl http://127.0.0.1:7860/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"heroic fantasy tavern theme","genre":"Fantasy","duration":5,"bpm":110,"mood":"warm and adventurous"}'
```

## Cloudflare Tunnel

Expose the local server through Cloudflare Tunnel, then set the Supabase secret:

```bash
cloudflared tunnel --url http://localhost:7860
supabase secrets set MUSICGEN_URL=https://YOUR-TUNNEL.trycloudflare.com
supabase functions deploy ai-music
```

`ai-music` calls:

```text
MUSICGEN_URL + "/generate"
```

## Model

Default:

```text
facebook/musicgen-small
```

Optional override:

```bash
export MUSICGEN_MODEL=facebook/musicgen-small
```

The first request downloads/loads the model and will be slow. After that, generation should be faster.
