"""生成 BabyTV 品牌图标与 Android TV 横幅。

用法:
    python tools/make_brand_assets.py

产物:
    app/native/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png
    app/native/app/src/main/res/drawable-xhdpi/tv_banner.png   (320x180)

设计：深蓝→青绿渐变底 + 奶油色小熊 + 黄色星星，电视桌面上一眼可认。
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "app", "native", "app", "src", "main", "res")

NAVY = (16, 26, 51)
TEAL = (18, 156, 158)
MINT = (53, 224, 176)
CREAM = (255, 243, 224)
TAN = (255, 216, 168)
TAN_DARK = (228, 168, 112)
BROWN = (90, 62, 43)
YELLOW = (255, 201, 77)
WHITE = (255, 255, 255)

FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_CJK = r"C:\Windows\Fonts\msyhbd.ttc"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def gradient(size, top, bottom):
    w, h = size
    img = Image.new("RGB", (w, h), top)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def star(draw, cx, cy, r, color):
    pts = []
    for i in range(10):
        angle = -math.pi / 2 + i * math.pi / 5
        radius = r if i % 2 == 0 else r * 0.42
        pts.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    draw.polygon(pts, fill=color)


def draw_bear(img, cx, cy, scale):
    """在 img 上画一只正面小熊，scale=头部半径。"""
    d = ImageDraw.Draw(img)
    # 耳朵
    for dx in (-1, 1):
        ex = cx + dx * scale * 0.82
        ey = cy - scale * 0.78
        d.ellipse([ex - scale * 0.34, ey - scale * 0.34, ex + scale * 0.34, ey + scale * 0.34], fill=TAN_DARK)
        d.ellipse([ex - scale * 0.20, ey - scale * 0.20, ex + scale * 0.20, ey + scale * 0.20], fill=TAN)
    # 头
    d.ellipse([cx - scale, cy - scale, cx + scale, cy + scale], fill=TAN)
    # 口鼻区
    d.ellipse([cx - scale * 0.46, cy + scale * 0.08, cx + scale * 0.46, cy + scale * 0.62], fill=CREAM)
    # 眼睛
    for dx in (-1, 1):
        ex = cx + dx * scale * 0.36
        ey = cy - scale * 0.20
        d.ellipse([ex - scale * 0.10, ey - scale * 0.13, ex + scale * 0.10, ey + scale * 0.13], fill=BROWN)
        d.ellipse([ex - scale * 0.035, ey - scale * 0.095, ex + scale * 0.005, ey - scale * 0.045], fill=WHITE)
    # 鼻子
    d.ellipse([cx - scale * 0.15, cy + scale * 0.18, cx + scale * 0.15, cy + scale * 0.39], fill=BROWN)
    # 微笑（两段弧线拼成）
    box = [cx - scale * 0.30, cy + scale * 0.26, cx, cy + scale * 0.56]
    d.arc(box, start=10, end=90, fill=BROWN, width=max(2, int(scale * 0.055)))
    box = [cx, cy + scale * 0.26, cx + scale * 0.30, cy + scale * 0.56]
    d.arc(box, start=90, end=170, fill=BROWN, width=max(2, int(scale * 0.055)))
    # 腮红
    for dx in (-1, 1):
        ex = cx + dx * scale * 0.62
        ey = cy + scale * 0.20
        d.ellipse([ex - scale * 0.12, ey - scale * 0.07, ex + scale * 0.12, ey + scale * 0.07],
                  fill=(255, 170, 150))


def make_icon(px=1024):
    img = gradient((px, px), (28, 46, 94), (12, 122, 128)).convert("RGBA")
    # 底纹光斑
    glow = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([px * 0.55, -px * 0.18, px * 1.2, px * 0.5], fill=(MINT[0], MINT[1], MINT[2], 45))
    gd.ellipse([-px * 0.25, px * 0.55, px * 0.55, px * 1.3], fill=(YELLOW[0], YELLOW[1], YELLOW[2], 28))
    img = Image.alpha_composite(img, glow)
    draw_bear(img, px * 0.5, px * 0.55, px * 0.30)
    # 星星
    star(ImageDraw.Draw(img), px * 0.815, px * 0.205, px * 0.085, YELLOW)
    # 圆角裁切
    out = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    out.paste(img, (0, 0), rounded_mask((px, px), int(px * 0.225)))
    return out


def fit_font(draw, text, path, size, max_width):
    """按最大宽度自动缩小字号，避免文字超出横幅。"""
    while size > 8:
        f = font(path, size)
        if draw.textlength(text, font=f) <= max_width:
            return f
        size -= 2
    return font(path, 8)


def make_banner(w=640, h=360):
    img = gradient((w, h), (14, 23, 46), (10, 96, 102)).convert("RGBA")
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([w * 0.55, -h * 0.3, w * 1.15, h * 0.75], fill=(MINT[0], MINT[1], MINT[2], 40))
    img = Image.alpha_composite(img, glow)

    # 左侧图标区（圆角方块）
    box = int(h * 0.66)
    bx, by = int(w * 0.06), (h - box) // 2
    tile = gradient((box, box), (28, 46, 94), (12, 122, 128)).convert("RGBA")
    draw_bear(tile, box / 2, box * 0.55, box * 0.30)
    star(ImageDraw.Draw(tile), box * 0.80, box * 0.20, box * 0.085, YELLOW)
    img.paste(tile, (bx, by), rounded_mask((box, box), int(box * 0.22)))

    d = ImageDraw.Draw(img)
    tx = bx + box + int(w * 0.045)
    avail = w - tx - int(w * 0.04)
    title = fit_font(d, "BabyTV", FONT_BOLD, int(h * 0.24), avail)
    tagline = fit_font(d, "快乐启蒙 · 3-6 岁", FONT_CJK, int(h * 0.10), avail)
    th = d.textbbox((0, 0), "BabyTV", font=title)[3]
    y = (h - th) // 2 - int(h * 0.055)
    d.text((tx, y), "BabyTV", font=title, fill=WHITE)
    d.text((tx, y + th + int(h * 0.05)), "快乐启蒙 · 3-6 岁", font=tagline, fill=YELLOW)
    return img


def save_icon(master):
    sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for density, size in sizes.items():
        folder = os.path.join(RES, "mipmap-" + density)
        os.makedirs(folder, exist_ok=True)
        master.resize((size, size), Image.LANCZOS).save(os.path.join(folder, "ic_launcher.png"))


def main():
    icon = make_icon(1024)
    save_icon(icon)
    banner_dir = os.path.join(RES, "drawable-xhdpi")
    os.makedirs(banner_dir, exist_ok=True)
    banner = make_banner().convert("RGB").resize((320, 180), Image.LANCZOS)
    banner.save(os.path.join(banner_dir, "tv_banner.png"), optimize=True)
    print("icon ->", os.path.join(RES, "mipmap-xxxhdpi", "ic_launcher.png"))
    print("banner ->", os.path.join(banner_dir, "tv_banner.png"))


if __name__ == "__main__":
    main()
