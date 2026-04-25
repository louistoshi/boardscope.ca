import sys
from PIL import Image, ImageDraw

def flood_clean(input_path):
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size
    
    # Create a mask for flood fill
    # We will flood fill from all 4 corners
    mask = Image.new("L", (w + 2, h + 2), 0)
    
    # Simple heuristic: anything close to the corner color is background
    # But flood fill is better for connected regions
    # We'll use a seed point at (0,0) and handle the tolerance
    
    # Convert to grayscale for easier edge detection in the flood
    # Actually, let's just use the ImageDraw.floodfill
    
    # We want to fill the background with transparency
    # Let's find the background color (usually white or gray)
    bg_color = img.getpixel((0,0))
    
    # Tolerance for flood fill
    tolerance = 50
    
    # Temporary copy to work on
    temp_img = img.copy()
    
    # Flood fill from corners with a placeholder color (like pure magenta)
    placeholder = (255, 0, 255, 255)
    
    # Try to fill from corners
    seeds = [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]
    for seed in seeds:
        ImageDraw.floodfill(temp_img, seed, placeholder, thresh=tolerance)
    
    # Now replace placeholder with pure transparency
    data = temp_img.getdata()
    new_data = []
    original_data = img.getdata()
    
    for i, item in enumerate(data):
        if item == placeholder:
            new_data.append((0, 0, 0, 0))
        else:
            # Also catch any remaining high-brightness pixels that weren't connected
            r, g, b, a = original_data[i]
            if r > 200 and g > 200 and b > 200:
                 new_data.append((0, 0, 0, 0))
            else:
                 new_data.append(original_data[i])
                 
    img.putdata(new_data)
    img.save(input_path, "PNG")
    print(f"Flood cleaned {input_path}")

if __name__ == "__main__":
    import os
    base = "assets/components_icons"
    for f in os.listdir(base):
        if f.endswith(".png"):
            flood_clean(os.path.join(base, f))
