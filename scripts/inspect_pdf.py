import fitz
import sys

doc = fitz.open("MLB_820-02016_Rev_4.0.0_.pdf")

print(f"Total pages: {len(doc)}")
# Let's dump text from page 5, which usually contains components (early pages are block diagrams)
page = doc.load_page(5)
text = page.get_text("dict")

print("--- RAW BLOCKS ---")
for block in text.get("blocks", [])[:20]: # show first 20 blocks
    if "lines" in block:
        for line in block["lines"]:
            for span in line["spans"]:
                print(f"Text: '{span['text']}' | Size: {span['size']} | Font: {span['font']}")
