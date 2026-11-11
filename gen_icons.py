#!/usr/bin/env python3
import subprocess
import sys

svg_path = r"G:\BabyOnTV\.dsh-vision-router\artifacts\.runs\.vision-run-mwblx360-a62b5755-ded7-42dd-8eaf-15eed08204cb\sha256-ba93a6bbdf03ade38b0c0555a-edacac62-trace-color.svg"
output_base = r"G:\BabyOnTV\app\native\app\src\main\res"

sizes = {
    48: "mdpi",
    72: "hdpi", 
    96: "xhdpi",
    144: "xxhdpi",
    192: "xxxhdpi"
}

# Try using Inkscape if available
inkscape_paths = [
    r"C:\Program Files\Inkscape\bin\inkscape.exe",
    r"C:\Program Files (x86)\Inkscape\bin\inkscape.exe",
]

inkscape = None
for p in inkscape_paths:
    try:
        subprocess.run([p, "--version"], check=True, capture_output=True)
        inkscape = p
        break
    except:
        continue

if inkscape:
    print(f"Using Inkscape: {inkscape}")
    for px, name in sizes.items():
        out_path = f"{output_base}\\mipmap-{name}\\ic_launcher.png"
        subprocess.run([inkscape, svg_path, "--export-type=png", f"--export-width={px}", f"--export-height={px}", f"--export-filename={out_path}"], check=True)
        print(f"Generated mipmap-{name} ({px}x{px})")
else:
    # Try using magick (ImageMagick)
    try:
        subprocess.run(["magick", "-version"], check=True, capture_output=True)
        print("Using ImageMagick (magick)")
        for px, name in sizes.items():
            out_path = f"{output_base}\\mipmap-{name}\\ic_launcher.png"
            subprocess.run(["magick", svg_path, "-resize", f"{px}x{px}", out_path], check=True)
            print(f"Generated mipmap-{name} ({px}x{px})")
    except:
        print("No suitable image conversion tool found!")
        sys.exit(1)

print("Done!")