import sys
import json
import pytesseract
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageEnhance


def get_arabic_text_bbox(img):
    upscale = 2
    proc = img.resize((img.width * upscale, img.height * upscale), Image.LANCZOS)
    proc = ImageOps.grayscale(proc)
    proc = ImageEnhance.Contrast(proc).enhance(2.0)
    proc = ImageEnhance.Sharpness(proc).enhance(2.0)

    data = pytesseract.image_to_data(
        proc, lang="ara", config="--psm 11", output_type=pytesseract.Output.DICT
    )
    boxes = []
    for i, conf in enumerate(data["conf"]):
        try:
            c = float(conf)
        except (ValueError, TypeError):
            continue
        if c > 25 and data["text"][i].strip():
            x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
            boxes.append((x / upscale, y / upscale, (x + w) / upscale, (y + h) / upscale))
    if not boxes:
        return None
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes)
    y1 = max(b[3] for b in boxes)
    return (int(x0), int(y0), int(x1), int(y1))


def sample_bg_color(img, bbox):
    x0, y0, x1, y1 = bbox
    strip_y = max(0, y0 - 15)
    region = img.crop((x0, strip_y, x1, max(strip_y + 5, y0)))
    pixels = list(region.getdata())
    if not pixels:
        return (0, 0, 0)
    avg = tuple(sum(c[i] for c in pixels) // len(pixels) for i in range(3))
    return avg


def draw_centered_text(draw, box, text, img_width):
    x0, y0, x1, y1 = box
    box_h = y1 - y0
    font_size = max(20, int(box_h * 0.6))
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()

    max_w = (x1 - x0) - 20
    while font_size > 14:
        text_bbox = draw.textbbox((0, 0), text, font=font)
        if (text_bbox[2] - text_bbox[0]) <= max_w:
            break
        font_size -= 2
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except Exception:
            break

    text_bbox = draw.textbbox((0, 0), text, font=font)
    text_w = text_bbox[2] - text_bbox[0]
    text_h = text_bbox[3] - text_bbox[1]
    tx = x0 + max(0, ((x1 - x0) - text_w) // 2)
    ty = y0 + max(0, ((y1 - y0) - text_h) // 2)

    outline_color = (0, 0, 0)
    for dx in [-2, 0, 2]:
        for dy in [-2, 0, 2]:
            draw.text((tx + dx, ty + dy), text, font=font, fill=outline_color)
    draw.text((tx, ty), text, font=font, fill=(255, 255, 255))


def edit_thumbnail(image_path, english_text, output_path):
    img = Image.open(image_path).convert("RGB")
    bbox = get_arabic_text_bbox(img)

    if bbox is None:
        band_h = int(img.height * 0.28)
        bbox = (0, 0, img.width, band_h)
        x0, y0, x1, y1 = bbox
        draw = ImageDraw.Draw(img)
        draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0))
        draw_centered_text(draw, (x0 + 20, y0, x1 - 20, y1), english_text, img.width)
        img.save(output_path)
        return {"foundText": False, "usedFallbackBand": True, "outputPath": output_path}

    pad = 10
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(img.width, x1 + pad), min(img.height, y1 + pad)

    bg_color = sample_bg_color(img, (x0, y0, x1, y1))
    draw = ImageDraw.Draw(img)
    draw.rectangle([x0, y0, x1, y1], fill=bg_color)
    draw_centered_text(draw, (x0, y0, x1, y1), english_text, img.width)

    img.save(output_path)
    return {"foundText": True, "bbox": bbox, "outputPath": output_path}


if __name__ == "__main__":
    result = edit_thumbnail(sys.argv[1], sys.argv[2], sys.argv[3])
    print(json.dumps(result, ensure_ascii=False))
