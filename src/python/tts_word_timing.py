import asyncio
import json
import sys
import edge_tts

async def generate_with_timing(text, voice, audio_out, timing_out):
    communicate = edge_tts.Communicate(text, voice)
    words = []
    with open(audio_out, "wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({
                    "word": chunk["text"],
                    "start": chunk["offset"] / 10000,  # نحول من 100ns لـ ms
                    "duration": chunk["duration"] / 10000,
                })
    with open(timing_out, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)
    return words

if __name__ == "__main__":
    text = sys.argv[1]
    voice = sys.argv[2]
    audio_out = sys.argv[3]
    timing_out = sys.argv[4]
    words = asyncio.run(generate_with_timing(text, voice, audio_out, timing_out))
    print(f"✅ {len(words)} كلمة، الصوت: {audio_out}, التوقيت: {timing_out}")
