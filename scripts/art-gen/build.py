"""Local-only: turns art/generated/*.png into the WebP/PNG files shipped under public/."""
from pathlib import Path

from PIL import Image, ImageOps

SRC = Path("art/generated")
OUT = Path("public/art")
ICONS = Path("public/icons")


def save_webp(image, target, quality=80):
    target.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(target, "WEBP", quality=quality, method=6)


def wide(folder, width=1280, height=720):
    for source in sorted((SRC / folder).glob("*.png")):
        image = ImageOps.fit(Image.open(source), (width, height), Image.LANCZOS)
        save_webp(image, OUT / folder / f"{source.stem}.webp", 78)


def plates(folder, size=512, thumb=128):
    for source in sorted((SRC / folder).glob("*.png")):
        image = Image.open(source)
        save_webp(ImageOps.fit(image, (size, size), Image.LANCZOS), OUT / folder / f"{source.stem}.webp")
        if thumb:
            save_webp(
                ImageOps.fit(image, (thumb, thumb), Image.LANCZOS),
                OUT / folder / "thumbs" / f"{source.stem}.webp",
                82,
            )


def brand():
    hero = Image.open(SRC / "brand/hero-table.png")
    save_webp(ImageOps.fit(hero, (1920, 1080), Image.LANCZOS), OUT / "brand/hero-wide.webp", 76)
    portrait = SRC / "brand/hero-portrait.png"
    if portrait.exists():
        save_webp(ImageOps.fit(Image.open(portrait), (1080, 1440), Image.LANCZOS), OUT / "brand/hero-tall.webp", 76)
    ICONS.mkdir(parents=True, exist_ok=True)
    ImageOps.fit(hero, (1200, 630), Image.LANCZOS).convert("RGB").save(ICONS / "share.jpg", "JPEG", quality=84)
    icon = Image.open(SRC / "brand/app-icon.png").convert("RGB")
    # Tight crop for small sizes; the full square (with margin) is the maskable safe zone.
    width, height = icon.size
    inset = int(width * 0.09)
    tight = icon.crop((inset, inset, width - inset, height - inset))
    for size in (32, 180, 192, 512):
        tight.resize((size, size), Image.LANCZOS).save(ICONS / f"icon-{size}.png", optimize=True)
    icon.resize((512, 512), Image.LANCZOS).save(ICONS / "icon-maskable-512.png", optimize=True)
    save_webp(tight.resize((160, 160), Image.LANCZOS), OUT / "brand/emblem.webp", 86)


brand()
wide("shops")
wide("covers")
wide("scenes")
plates("classes")
plates("items", 256, 96)
plates("items/basic", 256, 96)
plates("empty", 480, 0)
total = sum(path.stat().st_size for folder in (OUT, ICONS) for path in folder.rglob("*") if path.is_file())
print(f"{total / 1e6:.1f} MB written")
