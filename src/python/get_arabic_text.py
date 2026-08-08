import sys
import pytesseract
from PIL import Image

def get_text(image_path):
    img = Image.open(image_path).convert("RGB")
    text = pytesseract.image_to_string(img, lang="ara")
    return text.strip()

if __name__ == "__main__":
    print(get_text(sys.argv[1]))
