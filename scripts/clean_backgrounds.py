import os
from rembg import remove
from PIL import Image

assets_dir = "/Users/macbookair/boardscope beta/boardscope_5 2/assets/components_icons/"

for filename in os.listdir(assets_dir):
    if filename.endswith(".png"):
        img_path = os.path.join(assets_dir, filename)
        print(f"Processing {filename}...")
        try:
            input_image = Image.open(img_path)
            output_image = remove(input_image)
            output_image.save(img_path)
            print(f"Successfully processed {filename}")
        except Exception as e:
            print(f"Error processing {filename}: {e}")
