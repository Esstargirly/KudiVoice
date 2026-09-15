"""
services/sahara_service.py

Handles sending an audio file to Intron's Sahara API and returning
the transcribed text. Used by the voice-entry route to turn spoken
transactions into text before handing off to the existing Gemma
parsing logic.
"""

import os
import requests

SAHARA_API_KEY = os.environ.get("SAHARA_API_KEY")
SAHARA_ENDPOINT = "https://infer.voice.intron.io/file/v1/upload/sync"


class SaharaTranscriptionError(Exception):
    pass


def transcribe_audio(file_storage, language="en"):
    """
    Sends an uploaded audio file to Sahara and returns the transcript text.

    Args:
        file_storage: a Flask FileStorage object (from request.files['audio'])
        language: language code for Sahara's ASR input (default "en")

    Returns:
        str: the transcribed text

    Raises:
        SaharaTranscriptionError: if the request fails or Sahara returns an error
    """
    if not SAHARA_API_KEY:
        raise SaharaTranscriptionError("SAHARA_API_KEY is not set in environment variables")

    try:
        response = requests.post(
            SAHARA_ENDPOINT,
            headers={"Authorization": f"Bearer {SAHARA_API_KEY}"},
            data={
                "audio_file_name": file_storage.filename or "voice_entry",
                "use_language_asr_input": language,
            },
            files={"audio_file_blob": (file_storage.filename, file_storage.stream, file_storage.mimetype)},
            timeout=130,  # Sahara's sync endpoint can take up to 120s
        )
    except requests.RequestException as e:
        raise SaharaTranscriptionError(f"Could not reach Sahara: {e}")

    try:
        payload = response.json()
    except ValueError:
        raise SaharaTranscriptionError(f"Sahara returned a non-JSON response: {response.text[:200]}")

    if payload.get("status") != "Ok":
        raise SaharaTranscriptionError(f"Sahara error: {payload.get('message', 'unknown error')}")

    transcript = payload.get("data", {}).get("audio_transcript", "")
    if not transcript:
        raise SaharaTranscriptionError("Sahara returned an empty transcript")

    return transcript