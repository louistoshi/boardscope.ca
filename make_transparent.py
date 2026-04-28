from PIL import Image
import sys

def make_transparent(img_path, out_path):
    img = Image.open(img_path).convert("RGBA")
    datas = img.getdata()
    
    newData = []
    for item in datas:
        # If it's very dark (almost black), make it transparent, but keep the color
        # Since it's neon, we can use the intensity to set the alpha channel
        # Luma = R*0.299 + G*0.587 + B*0.114
        luma = item[0]*0.299 + item[1]*0.587 + item[2]*0.114
        if luma < 10:
            newData.append((0, 0, 0, 0))
        else:
            newData.append(item)
            
    img.putdata(newData)
    img.save(out_path, "PNG")

make_transparent("/Users/macbookair/.gemini/antigravity/brain/3f469c06-55d9-408e-b536-317e9bbdbe93/floating_resistor_black_1776987748221.png", "assets/components_icons/resistor.png")
