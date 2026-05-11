import fitz
import json
import re

doc = fitz.open("MLB_820-02016_Rev_4.0.0_.pdf")

bom = {}

ref_des_pattern = re.compile(r"^[A-Z]+\d{3,4}$")

for page_num in range(len(doc)):
    page = doc.load_page(page_num)
    blocks = page.get_text("dict")["blocks"]
    
    for block in blocks:
        if "lines" not in block:
            continue
            
        spans = []
        for line in block["lines"]:
            spans.extend(line["spans"])
            
        # We look through the spans in a block. 
        # Often, the reference designator and its value/part number are in the same block.
        for i, span in enumerate(spans):
            text = span["text"].strip()
            if ref_des_pattern.match(text):
                # Found a reference designator!
                # The part value is usually the next or previous span, or something nearby.
                # Let's collect surrounding text as 'description'
                surrounding = []
                # Look 3 spans before and after
                for j in range(max(0, i-3), min(len(spans), i+4)):
                    if i != j:
                        surrounding.append(spans[j]["text"].strip())
                
                # Filter out obvious non-part-names (like net names, single letters, etc.)
                parts = [p for p in surrounding if len(p) > 2 and not p.startswith("PP") and " " not in p]
                
                part_name = parts[0] if parts else "UNKNOWN"
                # If it's a capacitor or resistor, part_name might be its value (e.g. 10uF, 10K)
                
                if text not in bom or bom[text] == "UNKNOWN":
                    bom[text] = " ".join(parts)

# Let's refine the extracted BOM. Remove 'UNKNOWN'
final_bom = {k: v for k, v in bom.items() if v and v != "UNKNOWN"}

# Save to JSON
with open("820-02016_BOM.json", "w") as f:
    json.dump(final_bom, f, indent=2)

print(f"Extracted {len(final_bom)} components into BOM.")

# Let's print some interesting ICs
print("Sample ICs extracted:")
for k, v in final_bom.items():
    if k.startswith("U"):
        print(f"{k}: {v}")
