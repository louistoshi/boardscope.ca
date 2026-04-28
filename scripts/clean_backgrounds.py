import sys
from PIL import Image

def clean_background(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()

    new_data = []
    # Simple threshold-based removal for the grid/white backgrounds
    for item in datas:
        # If it's very bright (white-ish) or matches the grid pattern, make it transparent
        # The grid is usually around (200, 200, 200) or (255, 255, 255)
        if item[0] > 220 and item[1] > 220 and item[2] > 220:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"Cleaned image saved to {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 clean_backgrounds.py <input> <output>")
    else:
        clean_background(sys.argv[1], sys.argv[2])
