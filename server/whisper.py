"""Transcribe one recording from stdin using an offline Whisper model."""
import io
import json
import sys

from faster_whisper import WhisperModel


def main():
    model = WhisperModel(
        sys.argv[1], device="cpu", compute_type="int8", cpu_threads=4,
        local_files_only=True,
    )
    segments, _ = model.transcribe(
        io.BytesIO(sys.stdin.buffer.read()),
        language="pl",
        beam_size=3,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        condition_on_previous_text=False,
    )
    print(json.dumps({"text": " ".join(part.text.strip() for part in segments).strip()}))


if __name__ == "__main__":
    main()
