"""Voice provider adapter (Sarvam AI). Everything is configuration-driven; when no key is configured the API answers
`available: false` and the client falls back to typed text (or the browser's own speech engine, clearly labelled).

Sarvam endpoints (verify against the current Sarvam API reference before production):
  POST {SARVAM_SPEECH_BASE}/speech-to-text   multipart: file, model, language_code
  POST {SARVAM_SPEECH_BASE}/text-to-speech   json: text, target_language_code, speaker, model
"""
from __future__ import annotations

import os

import httpx

BASE = os.getenv("SARVAM_SPEECH_BASE", "https://api.sarvam.ai").rstrip("/")
STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saarika:v2.5")
TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v2")
SPEAKERS = {"en": os.getenv("SARVAM_TTS_SPEAKER_EN", "anushka"), "hi": os.getenv("SARVAM_TTS_SPEAKER_HI", "anushka"),
            "mr": os.getenv("SARVAM_TTS_SPEAKER_MR", "manisha")}
LANG = {"en": "en-IN", "hi": "hi-IN", "mr": "mr-IN"}
TIMEOUT = float(os.getenv("FIXCHAIN_VOICE_TIMEOUT", "30"))
MAX_AUDIO_BYTES = 5 * 1024 * 1024


class VoiceUnavailable(Exception):
    pass


def available() -> bool:
    return bool(os.getenv("SARVAM_API_KEY")) and os.getenv("FIXCHAIN_VOICE", "auto") != "off"


def info() -> dict:
    return {"available": available(), "provider": "sarvam" if available() else None, "stt_model": STT_MODEL,
            "tts_model": TTS_MODEL, "languages": list(LANG),
            "fallback": "Typed text; the browser's built-in speech engine may be offered and is labelled as such"}


def _headers() -> dict:
    return {"api-subscription-key": os.getenv("SARVAM_API_KEY", "")}


def transcribe(audio: bytes, filename: str, content_type: str, locale: str | None) -> dict:
    if not available():
        raise VoiceUnavailable("Voice is not configured (set SARVAM_API_KEY)")
    if len(audio) > MAX_AUDIO_BYTES:
        raise ValueError("Audio too large (max 5 MB)")
    try:
        r = httpx.post(f"{BASE}/speech-to-text", headers=_headers(), timeout=TIMEOUT,
                       files={"file": (filename or "audio.webm", audio, content_type or "audio/webm")},
                       data={"model": STT_MODEL, "language_code": LANG.get(locale or "", "unknown")})
    except httpx.HTTPError as exc:
        raise VoiceUnavailable(f"Speech service unreachable ({type(exc).__name__})") from exc
    if r.status_code != 200:
        raise VoiceUnavailable(f"Speech-to-text error {r.status_code}")
    d = r.json()
    code = (d.get("language_code") or "").split("-")[0]
    return {"transcript": d.get("transcript", ""), "locale": code if code in LANG else locale, "provider": "sarvam",
            "model": STT_MODEL}


def speak(text: str, locale: str) -> dict:
    if not available():
        raise VoiceUnavailable("Voice is not configured (set SARVAM_API_KEY)")
    text = text.strip()[:1500]
    try:
        r = httpx.post(f"{BASE}/text-to-speech", headers={**_headers(), "Content-Type": "application/json"},
                       timeout=TIMEOUT, json={"text": text, "target_language_code": LANG.get(locale, "en-IN"),
                                              "speaker": SPEAKERS.get(locale, "anushka"), "model": TTS_MODEL,
                                              "pace": 0.95})
    except httpx.HTTPError as exc:
        raise VoiceUnavailable(f"Speech service unreachable ({type(exc).__name__})") from exc
    if r.status_code != 200:
        raise VoiceUnavailable(f"Text-to-speech error {r.status_code}")
    audios = r.json().get("audios") or []
    if not audios:
        raise VoiceUnavailable("Text-to-speech returned no audio")
    return {"audio_base64": audios[0], "mime": "audio/wav", "provider": "sarvam", "model": TTS_MODEL}
