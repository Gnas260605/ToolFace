"""Edge TTS with per-word timings (the edge-tts CLI only exposes sentence timings).

Usage: python edge_tts_words.py <text_file> <voice> <rate> <out_audio.mp3> <out_words.json>
Writes the audio and a JSON list of {"text", "start", "end"} in seconds.
"""

import asyncio
import json
import sys

import edge_tts


async def synthesize(text: str, voice: str, rate: str, out_audio: str, out_json: str) -> None:
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    except TypeError:
        # edge-tts < 7 has no `boundary` argument and sends word boundaries by default.
        communicate = edge_tts.Communicate(text, voice, rate=rate)

    words = []
    with open(out_audio, "wb") as audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 10_000_000
                words.append(
                    {
                        "text": chunk["text"],
                        "start": start,
                        "end": start + chunk["duration"] / 10_000_000,
                    }
                )

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False)


def main() -> None:
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    text_file, voice, rate, out_audio, out_json = sys.argv[1:]
    with open(text_file, encoding="utf-8") as f:
        text = f.read()
    asyncio.run(synthesize(text, voice, rate, out_audio, out_json))


if __name__ == "__main__":
    main()
