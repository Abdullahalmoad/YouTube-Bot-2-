import os
import sys
from groq import Groq

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

audio_path = sys.argv[1]

with open(audio_path, "rb") as f:
    transcript = client.audio.transcriptions.create(
        file=f,
        model="whisper-large-v3",
        response_format="verbose_json",
        timestamp_granularities=["word"],
    )

for w in transcript.words[:20]:
    print(f"{w['word']:20s} start={w['start']:.2f}s end={w['end']:.2f}s")
