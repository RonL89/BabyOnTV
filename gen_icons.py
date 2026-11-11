#!/usr/bin/env python3
"""从原始插画生成 Android 图标 / 自适应图标 / TV banner / 网页 logo。

源图：熊抱电视插画（2048x2048）
用法：python gen_icons.py
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SRC = r"C:\Users\Administrator\.dsh\attachments\v1\objects\ba\ba93a6bbdf03ade38b0c0555ad9d7ac94a65dcecc7747c5fa64827e2309bd3e2"
RES = r"G:\BabyOnTV\app\native\app\src\main\res"
WEB_LOGO = r"G:\BabyOnTV\app\web\assets\logo.png"
ADMIN_LOGO = r"G:\BabyOnTV\admin\assets\logo.png"

DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}

BRAND_BG = (255, 248, 240)
BRAND_ORANGE = (240, 112, 40)
FONT_CN = r"C:\Windows\Fonts\msyhbd.ttc"


def load_src():
    if not os.path.exists(SRC):
        sys.exit("源图不存在：" + SRC)
    im = Image.open(SRC)
    if im.mode != "RGB":
        im = im.convert("RGB")
    return im


def square(im, size):
    """等比缩放并居中裁切到正方形，高质量重采样。"""
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = im.crop((left, top, left + side, top + side))
    return cropped.resize((size, size), Image.LANCZOS)


def rounded(im, radius_ratio=0.22):
    """圆角遮罩（老电视 launcher 不做自动裁剪，图标会显示成方角）。"""
    size = im.size[0]
    mask = Image.new("L", (size, size), 0)
    radius = int(size * radius_ratio)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im.convert("RGBA"), (0, 0), mask)
    return out


def write(path, im):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "PNG", optimize=True)
    print("  ", os.path.relpath(path, r"G:\BabyOnTV"))


def gen_legacy(src):
    print("legacy mipmap ic_launcher")
    for name, scale in DENSITIES.items():
        px = int(48 * scale)
        write(os.path.join(RES, "mipmap-" + name, "ic_launcher.png"), rounded(square(src, px)))


def gen_adaptive(src):
    """自适应图标：前景 = 四周留白的熊，背景 = 品牌暖白。

    108dp 画布中安全区是 72dp，插画本体控制在 66% 左右最稳妥。
    """
    print("adaptive icon foreground")
    for name, scale in DENSITIES.items():
        px = int(108 * scale)
        canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        inner = int(px * 0.66)
        bear = square(src, inner)
        canvas.paste(bear, ((px - inner) // 2, (px - inner) // 2))
        write(os.path.join(RES, "mipmap-" + name, "ic_launcher_foreground.png"), canvas)

    print("adaptive icon xml")
    anydpi = os.path.join(RES, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    xml = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"""
    path = os.path.join(anydpi, "ic_launcher.xml")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(xml)
    print("  ", os.path.relpath(path, r"G:\BabyOnTV"))

    values = os.path.join(RES, "values")
    colors = os.path.join(values, "colors.xml")
    if not os.path.exists(colors):
        os.makedirs(values, exist_ok=True)
        with open(colors, "w", encoding="utf-8", newline="\n") as f:
            f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                    '    <color name="ic_launcher_background">#FFF8F0</color>\n'
                    '</resources>\n')
        print("  ", os.path.relpath(colors, r"G:\BabyOnTV"))


def font(size):
    try:
        return ImageFont.truetype(FONT_CN, size)
    except Exception:
        return ImageFont.load_default()


def gen_banner(src):
    """Android TV launcher banner：320x180dp，xhdpi 即 640x360。"""
    print("tv banner")
    for name, scale in (("mdpi", 1.0), ("hdpi", 1.5), ("xhdpi", 2.0), ("xxhdpi", 3.0), ("xxxhdpi", 4.0)):
        w, h = int(320 * scale), int(180 * scale)
        canvas = Image.new("RGB", (w, h), (20, 20, 22))
        draw = ImageDraw.Draw(canvas)

        # 左侧熊抱电视插画
        bear_size = int(h * 0.84)
        bear = square(src, bear_size).convert("RGBA")
        mask = Image.new("L", (bear_size, bear_size), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, bear_size - 1, bear_size - 1), radius=int(bear_size * 0.16), fill=255)
        canvas.paste(bear, (int(h * 0.08), (h - bear_size) // 2), mask)

        # 右侧品牌名：按可用宽度自适应字号，保证不越界
        text_x = int(h * 0.08) + bear_size + int(w * 0.045)
        avail = w - text_x - int(w * 0.05)
        title = "宝宝请听题"
        title_size = int(h * 0.28)
        while title_size > int(h * 0.10):
            name_font = font(title_size)
            bbox = draw.textbbox((0, 0), title, font=name_font)
            if bbox[2] - bbox[0] <= avail:
                break
            title_size -= 2
        name_font = font(title_size)
        bbox = draw.textbbox((0, 0), title, font=name_font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

        sub_font = font(max(int(h * 0.11), int(title_size * 0.45)))
        sub = "先学再看"
        sbbox = draw.textbbox((0, 0), sub, font=sub_font)
        sw, sh = sbbox[2] - sbbox[0], sbbox[3] - sbbox[1]

        block_h = th + int(h * 0.07) + sh
        top = (h - block_h) // 2
        draw.text((text_x - bbox[0], top - bbox[1]), title, font=name_font, fill=(255, 255, 255))
        draw.text((text_x - sbbox[0], top + th + int(h * 0.07) - sbbox[1]), sub, font=sub_font, fill=BRAND_ORANGE)

        out = os.path.join(RES, "drawable-" + name, "ic_banner.png")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        canvas.save(out, "PNG", optimize=True)
        print("  ", os.path.relpath(out, r"G:\BabyOnTV"))


def gen_web_logo(src):
    print("web / admin logo")
    logo = rounded(square(src, 128), 0.28)
    for path in (WEB_LOGO, ADMIN_LOGO):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        logo.save(path, "PNG", optimize=True)
        print("  ", os.path.relpath(path, r"G:\BabyOnTV"))


def main():
    src = load_src()
    gen_legacy(src)
    gen_adaptive(src)
    gen_banner(src)
    gen_web_logo(src)
    print("Done!")


if __name__ == "__main__":
    main()
