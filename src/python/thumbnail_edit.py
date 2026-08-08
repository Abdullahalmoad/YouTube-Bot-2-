import sys
import json
import cv2
import numpy as np
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


def build_text_mask_and_color(cv_img, bbox):
    x0, y0, x1, y1 = bbox
    crop = cv_img[y0:y1, x0:x1]
    if crop.size == 0:
        return None, (255, 255, 255)

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    white_ratio = np.count_nonzero(mask) / mask.size
    text_mask = cv2.bitwise_not(mask) if white_ratio > 0.5 else mask

    ys, xs = np.where(text_mask > 0)
    if len(xs) > 0:
        text_pixels = crop[ys, xs]
        b, g, r = text_pixels.mean(axis=0)
        text_color = (int(r), int(g), int(b))
    else:
        text_color = (255, 255, 255)

    kernel = np.ones((3, 3), np.uint8)
    text_mask_dilated = cv2.dilate(text_mask, kernel, iterations=2)
    return text_mask_dilated, text_color


def inpaint_region(cv_img, bbox, local_mask):
    x0, y0, x1, y1 = bbox
    full_mask = np.zeros(cv_img.shape[:2], dtype=np.uint8)
    full_mask[y0:y1, x0:x1] = local_mask
    return cv2.inpaint(cv_img, full_mask, 5, cv2.INPAINT_TELEA)


def draw_centered_text(draw, box, text, text_color, outline_color):
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

    for dx in [-2, 0, 2]:
        for dy in [-2, 0, 2]:
            draw.text((tx + dx, ty + dy), text, font=font, fill=outline_color)
    draw.text((tx, ty), text, font=font, fill=text_color)


def edit_thumbnail(image_path, english_text, output_path):
    pil_img = Image.open(image_path).convert("RGB")
    bbox = get_arabic_text_bbox(pil_img)

    if bbox is None:
        band_h = int(pil_img.height * 0.28)
        bbox = (0, 0, pil_img.width, band_h)
        x0, y0, x1, y1 = bbox
        draw = ImageDraw.Draw(pil_img)
        draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0))
        draw_centered_text(draw, (x0 + 20, y0, x1 - 20, y1), english_text, (255, 255, 255), (0, 0, 0))
        pil_img.save(output_path)
        return {"foundText": False, "usedFallbackBand": True, "outputPath": output_path}

    pad = 8
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(pil_img.width, x1 + pad), min(pil_img.height, y1 + pad)

    cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    local_mask, text_color = build_text_mask_and_color(cv_img, (x0, y0, x1, y1))

    if local_mask is not None:
        inpainted_cv = inpaint_region(cv_img, (x0, y0, x1, y1), local_mask)
    else:
        inpainted_cv = cv_img

    result_pil = Image.fromarray(cv2.cvtColor(inpainted_cv, cv2.COLOR_BGR2RGB))

    luminance = 0.299 * text_color[0] + 0.587 * text_color[1] + 0.114 * text_color[2]
    outline_color = (0, 0, 0) if luminance > 140 else (255, 255, 255)

    draw = ImageDraw.Draw(result_pil)
    draw_centered_text(draw, (x0, y0, x1, y1), english_text, text_color, outline_color)

    result_pil.save(output_path)
    return {"foundText": True, "bbox": [x0, y0, x1, y1], "textColor": text_color, "outputPath": output_path}


if __name__ == "__main__":
    result = edit_thumbnail(sys.argv[1], sys.argv[2], sys.argv[3])
    print(json.dumps(result, ensure_ascii=False))
