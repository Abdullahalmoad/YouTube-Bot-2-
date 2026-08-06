import asyncio
import sys
import edge_tts
from collections import Counter

async def debug(text, voice):
    communicate = edge_tts.Communicate(text, voice)
    type_counts = Counter()
    samples = {}
    async for chunk in communicate.stream():
        t = chunk.get('type')
        type_counts[t] += 1
        if t not in samples and t != 'audio':
            samples[t] = chunk
    print("=== ملخص الأنواع ===")
    for t, c in type_counts.items():
        print(f"{t}: {c}")
    print("=== عينة من كل نوع (غير audio) ===")
    for t, chunk in samples.items():
        print(f"{t}: {chunk}")

if __name__ == "__main__":
    asyncio.run(debug(sys.argv[1], sys.argv[2]))
