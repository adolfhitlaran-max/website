import base64
import io
import os
from functools import lru_cache
from typing import Optional

import numpy as np
import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from scipy.io import wavfile
from transformers import AutoProcessor, MusicgenForConditionalGeneration


MODEL_NAME = os.getenv("MUSICGEN_MODEL", "facebook/musicgen-small")
TOKENS_PER_SECOND = int(os.getenv("MUSICGEN_TOKENS_PER_SECOND", "50"))
ALLOWED_ORIGIN = os.getenv("MUSICGEN_ALLOWED_ORIGIN", "https://uncensoredmedia.io")
PROXY_TOKEN = os.getenv("MUSICGEN_PROXY_TOKEN", "").strip()

app = FastAPI(title="Uncensored Media MusicGen Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["content-type", "x-um-proxy-token"],
)


class MusicRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    duration: int = Field(10, ge=1, le=30)
    genre: str = Field("Fantasy", max_length=80)
    bpm: Optional[int] = Field(None, ge=40, le=240)
    mood: str = Field("", max_length=160)


def build_prompt(request: MusicRequest) -> str:
    parts = [
        request.prompt.strip(),
        f"Genre: {request.genre.strip()}",
        request.mood.strip() and f"Mood: {request.mood.strip()}",
        request.bpm and f"Tempo: {request.bpm} BPM",
        f"Length: {request.duration} seconds",
        "high quality instrumental music loop, clean mix, no vocals",
    ]
    return ". ".join(str(part) for part in parts if part)


def require_proxy_token(request: Request) -> None:
    if not PROXY_TOKEN:
        return

    supplied_token = request.headers.get("x-um-proxy-token", "").strip()
    if supplied_token != PROXY_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


@lru_cache(maxsize=1)
def load_model():
    if torch.cuda.is_available():
        device = "cuda"
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    processor = AutoProcessor.from_pretrained(MODEL_NAME)
    model = MusicgenForConditionalGeneration.from_pretrained(
        MODEL_NAME,
        torch_dtype=dtype,
    ).to(device)
    model.eval()
    return processor, model, device


def normalize_audio(audio: np.ndarray) -> np.ndarray:
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim > 1:
        audio = np.squeeze(audio)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0:
        audio = audio / peak
    return np.clip(audio * 32767.0, -32768, 32767).astype(np.int16)


def wav_data_url(audio: np.ndarray, sample_rate: int) -> str:
    buffer = io.BytesIO()
    wavfile.write(buffer, sample_rate, audio)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:audio/wav;base64,{encoded}"


@app.get("/health")
def health():
    return {
        "ok": True,
        "provider": "musicgen-local",
        "model": MODEL_NAME,
    }


@app.post("/generate")
def generate_music(request_body: MusicRequest, request: Request):
    require_proxy_token(request)
    try:
        processor, model, device = load_model()
        prompt = build_prompt(request_body)
        inputs = processor(
            text=[prompt],
            padding=True,
            return_tensors="pt",
        ).to(device)

        max_new_tokens = max(1, int(request_body.duration * TOKENS_PER_SECOND))
        with torch.inference_mode():
            audio_values = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=True,
                guidance_scale=3.0,
            )

        sample_rate = int(model.config.audio_encoder.sampling_rate)
        audio = audio_values[0, 0].detach().cpu().numpy()
        target_samples = sample_rate * request_body.duration
        audio = audio[:target_samples]
        audio_int16 = normalize_audio(audio)

        return {
            "ok": True,
            "provider": "musicgen-local",
            "model": MODEL_NAME,
            "audio_url": wav_data_url(audio_int16, sample_rate),
            "prompt": prompt,
            "duration": request_body.duration,
        }
    except Exception as error:
        print(f"MusicGen generation failed: {error}")
        raise HTTPException(
            status_code=500,
            detail="MusicGen generation failed.",
        ) from error
