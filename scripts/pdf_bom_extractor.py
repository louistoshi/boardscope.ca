import pdfplumber
import json
import re
import sys
import os

def extract_bom(pdf_path, output_json):
    print(f"Extracting BOM from {pdf_path}...")
    bom = {}
    
    # Matches typical Apple Reference Designators: U1234, C123, J8000, L1234, Q123, R123, D123
    ref_des_pattern = re.compile(r"^[A-Z]{1,2}\d{3,4}$")
    
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            words = page.extract_words()
            
            # Group words by approx Y-coordinate (lines)
            lines = {}
            for w in words:
                text = w["text"]
                # Round top coordinate to group roughly horizontal words
                y = round(w["top"] / 5.0) * 5.0 
                if y not in lines:
                    lines[y] = []
                lines[y].append(w)
            
            for y, line_words in lines.items():
                # Sort words in line by X-coordinate
                line_words.sort(key=lambda w: w["x0"])
                
                for i, w in enumerate(line_words):
                    text = w["text"].strip()
                    if ref_des_pattern.match(text):
                        # Found a ref des! The part name is often immediately to the right
                        # or left. Let's grab surrounding words on the same line.
                        surrounding = []
                        for j, other_w in enumerate(line_words):
                            if i != j:
                                other_text = other_w["text"].strip()
                                # Ignore single chars, net names starting with PP/I2C
                                if len(other_text) > 2 and not other_text.startswith("PP") and not other_text.startswith("I2C"):
                                    surrounding.append(other_text)
                        
                        if surrounding:
                            # Join the best candidates
                            part_name = " ".join(surrounding[:3]) # Limit to 3 words
                            
                            # If we already have a mapping, don't overwrite if we found something better
                            # (Sometimes ref des appear multiple times)
                            if text not in bom or len(bom[text]) < len(part_name):
                                bom[text] = part_name

    # Save to JSON
    with open(output_json, "w") as f:
        json.dump(bom, f, indent=2)

    print(f"Extraction complete! Found {len(bom)} components.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Default test file
        extract_bom("MLB_820-02016_Rev_4.0.0_.pdf", "data/820-02016_BOM.json")
    else:
        extract_bom(sys.argv[1], sys.argv[2])
