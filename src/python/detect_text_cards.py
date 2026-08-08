import sys, json, os, subprocess, shutil
import pytesseract
from PIL import Image

def has_arabic_text(image_path):
    img = Image.open(image_path).convert("RGB")
    data = pytesseract.image_to_data(img, lang="ara", output_type=pytesseract.Output.DICT)
    for i, conf in enumerate(data["conf"]):
        try:
            c = float(conf)
        except (ValueError, TypeError):
            continue
        if c > 40 and data["text"][i].strip():
            return True
    return False

def main(video_path, out_dir):
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    fps = 2  # عينة كل نص ثانية
    pattern = os.path.join(out_dir, "f_%04d.png")
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vf", f"fps={fps}", pattern],
        check=True, capture_output=True
    )

    frames = sorted(f for f in os.listdir(out_dir) if f.startswith("f_"))
    flags = [has_arabic_text(os.path.join(out_dir, f)) for f in frames]

    cards = []
    i = 0
    n = len(frames)
    while i < n:
        if flags[i]:
            start = i
            while i + 1 < n and flags[i + 1]:
                i += 1
            end = i
            mid = (start + end) // 2
            cards.append({
                "start": round(start / fps, 2),
                "end": round((end + 1) / fps, 2),
                "framePath": os.path.join(out_dir, frames[mid]),
            })
        i += 1

    print(json.dumps({"cards": cards}, ensure_ascii=False))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
