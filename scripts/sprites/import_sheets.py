#!/usr/bin/env python3
"""RYT-066: cut painted props out of generated sheets and fit each one to its squares.

Reads the catalogue (scripts/sprites/catalogue.py) and every prop sheet of it saved under
art/sprites/source/ (pictures the author made with ChatGPT, docs/sprite-art.md). For every prop it:

1. finds the prop on its sheet (the shape nearest to the layout's hint, in fractions of the sheet);
2. cleans the edge (faint pixels dropped, the near-opaque body made opaque; a flat magenta or other
   uniform background is keyed out when the sheet came without transparency);
3. fits it inside its squares at its share of them, with the back of wall props on the top edge;
4. adds a soft contact shadow under it (centred: props turn on the board) and, for light sources, a
   warm halo that stops at the wall behind wall props;
5. writes public/tabletop/props/<prop>-<variant>-<w>x<h>.webp (the board mirrors them and turns
   square props without a front, so no copies are stored).

It then writes src/features/tabletop/ui/prop-pictures.ts, the list the board reads, and the catalogue
again with these sheets marked imported. Long props with a `run` (the bar) are rebuilt for each
length: caps kept, the strips holding their items (tankards) repeated, the plain wood between them
stretched along its grain. Floors, walls, decals and effects are listed but not used yet.

Run: python scripts/sprites/import_sheets.py            (writes the pictures and the list)
     python scripts/sprites/import_sheets.py --inspect  (prints what it finds, writes nothing)
"""

from __future__ import annotations

import math
import os
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalogue  # noqa: E402

SOURCE = ROOT / "art/sprites/source"
OUT = ROOT / "public/tabletop/props"
LIST = ROOT / "src/features/tabletop/ui/prop-pictures.ts"

PX = 192  # pixels per square: sharp on a 4K table and when the DM zooms in
INSET = 0.04  # squares kept free between a prop and the edge of its footprint
PAD = 0.2  # margin around the footprint for the shadow (as propSprite)
# As shadowed() in ui/sprites.ts: a contact shadow, black at 50 %, blurred 0.12 squares, not offset,
# so it stays right when the board turns the prop. Flat props (rugs, plates) cast a lighter one.
SHADOW_OPACITY, SHADOW_BLUR = 0.5, 0.12
FLAT = {"rug", "web", "trapdoor", "pressure-plate", "pit", "lily-pads", "mushroom-ring", "spike-trap", "coins"}
GLOW = 0.28  # halo strength, as propSprite's glow() call
ALPHA_LO, ALPHA_HI = 16, 248  # below: dropped; above: opaque (the sheets' bodies sit at 250-253)
STEP = 4  # the mask used to find props is the sheet divided by this


def key_out(im: Image.Image) -> Image.Image:
    """A sheet without transparency (a flat magenta or other plain background, as docs/sprite-art.md
    allows): pixels close to the corners' colour become transparent and soft edges lose its tint."""
    w, h = im.size
    px = im.load()
    corners = [px[x, y] for x, y in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3))]
    key = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    out = Image.new("RGBA", im.size)
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            d = math.dist((r, g, b), key)
            if d < 60:
                continue
            a = 255 if d > 140 else round((d - 60) * 255 / 80)
            # Takes the key colour's share out of a soft edge pixel (despill).
            f = 1 - a / 255
            rgb = [max(0, min(255, round((c - k * f) / max(a / 255, 1e-3)))) for c, k in zip((r, g, b), key)]
            dst[x, y] = (*rgb, a)
    return out


def clean(im: Image.Image) -> Image.Image:
    """Faint haze dropped, the body opaque, no colour left under transparent pixels."""
    im = im.convert("RGBA")
    w, h = im.size
    if all(im.getpixel(p)[3] == 255 for p in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3))):
        im = key_out(im)
    r, g, b, a = im.split()
    span = ALPHA_HI - ALPHA_LO
    a = a.point(
        lambda v: 0 if v < ALPHA_LO else 255 if v >= ALPHA_HI else round((v - ALPHA_LO) * 255 / span)
    )
    out = Image.merge("RGBA", (r, g, b, a))
    return Image.composite(out, Image.new("RGBA", im.size), a.point(lambda v: 255 if v else 0))


def shapes(alpha: Image.Image) -> list[tuple[int, int, int, int]]:
    """Bounding boxes of the separate shapes on a sheet (tiny specks ignored)."""
    w, h = alpha.size
    small = alpha.resize((w // STEP, h // STEP), Image.BOX).point(lambda v: 255 if v > 8 else 0)
    # Joins a flame to its candle and a fringe to its rug before shapes are counted.
    small = small.filter(ImageFilter.MaxFilter(5))
    sw, sh = small.size
    data = small.load()
    seen = bytearray(sw * sh)
    found: list[tuple[int, tuple[int, int, int, int]]] = []
    for y in range(sh):
        for x in range(sw):
            if not data[x, y] or seen[y * sw + x]:
                continue
            seen[y * sw + x] = 1
            stack = [(x, y)]
            n, x0, y0, x1, y1 = 0, x, y, x, y
            while stack:
                cx, cy = stack.pop()
                n += 1
                x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < sw and 0 <= ny < sh and data[nx, ny] and not seen[ny * sw + nx]:
                        seen[ny * sw + nx] = 1
                        stack.append((nx, ny))
            found.append((n, (x0 * STEP, y0 * STEP, (x1 + 1) * STEP, (y1 + 1) * STEP)))
    least = sw * sh * 0.002
    return [box for n, box in found if n > least]


def locate(sheet: Image.Image, items: list[dict], name: str) -> list[Image.Image]:
    """Each item's picture: the shape nearest to its hint, one shape per item."""
    w, h = sheet.size
    boxes = shapes(sheet.getchannel("A"))
    if len(boxes) < len(items):
        raise SystemExit(f"{name}: {len(boxes)} shapes found for {len(items)} props")
    pairs = sorted(
        (
            math.dist(item["at"], (((b[0] + b[2]) / 2) / w, ((b[1] + b[3]) / 2) / h)),
            i,
            k,
        )
        for i, item in enumerate(items)
        for k, b in enumerate(boxes)
    )
    chosen: dict[int, int] = {}
    used: set[int] = set()
    for d, i, k in pairs:
        if i in chosen or k in used:
            continue
        if d > 0.25:
            raise SystemExit(f"{name}: no shape near {items[i]['prop']} at {items[i]['at']}")
        chosen[i] = k
        used.add(k)
    crops = []
    for i in range(len(items)):
        x0, y0, x1, y1 = boxes[chosen[i]]
        m = STEP * 3
        region = sheet.crop((max(0, x0 - m), max(0, y0 - m), min(w, x1 + m), min(h, y1 + m)))
        crops.append(region.crop(region.getchannel("A").getbbox()))
    return crops


def resize(im: Image.Image, w: int, h: int) -> Image.Image:
    return im.resize((max(1, round(w)), max(1, round(h))), Image.LANCZOS)


def feather(im: Image.Image, top: int = 0, bottom: int = 0) -> Image.Image:
    """Fades the top or bottom rows to transparent, so a cap blends into the wood below it."""
    a = im.getchannel("A")
    ramp = Image.new("L", im.size, 255)
    for y in range(im.height):
        f = 1.0
        if top and y < top:
            f = y / top
        if bottom and y >= im.height - bottom:
            f = min(f, (im.height - 1 - y) / bottom)
        ramp.paste(round(255 * f), (0, y, im.width, y + 1))
    out = im.copy()
    out.putalpha(multiply(a, ramp))
    return out


def multiply(a: Image.Image, b: Image.Image) -> Image.Image:
    return ImageChops.multiply(a, b)


def run_body(pic: Image.Image, run: dict, width: int, length: int) -> Image.Image:
    """A long prop rebuilt to a length: caps as drawn, plain wood stretched along its grain between
    them, and the strips holding its items (tankards) spread evenly, repeated when it is longer."""
    pic = resize(pic, width, pic.height * width / pic.width)

    def rows(f: float) -> int:
        return round(f * pic.height)

    cap, end = rows(run["cap"]), rows(run["end"])
    plain = [rows(f) for f in run["plain"]]
    tail = pic.height - end
    blend = max(2, round(0.06 * PX))
    out = Image.new("RGBA", (width, length))
    wood = pic.crop((0, plain[0], width, plain[1]))
    out.alpha_composite(resize(wood, width, length - cap - tail + blend * 2), (0, cap - blend))
    out.alpha_composite(feather(pic.crop((0, 0, width, cap + blend)), bottom=blend), (0, 0))
    out.alpha_composite(feather(pic.crop((0, end - blend, width, pic.height)), top=blend), (0, length - tail - blend))
    # The strips keep their own wood: faded in and out along the grain, they join the stretched
    # wood without a seam. Not mirrored, so the planks stay in line.
    parts = [feather(pic.crop((0, rows(a), width, rows(b))), blend, blend) for a, b in run["items"]]
    middle = length - cap - tail
    # As many items as the source has per length of wood, while they fill under three quarters.
    count = max(1, round(len(parts) * middle / (end - cap)))
    while count > 1 and sum(parts[i % len(parts)].height for i in range(count)) > middle * 0.75:
        count -= 1
    chosen = [parts[i % len(parts)] for i in range(count)]
    left = middle - sum(p.height for p in chosen)
    y = cap
    for i, part in enumerate(chosen):
        y += round(left * (i + 1) / (count + 1)) - round(left * i / (count + 1))
        out.alpha_composite(part, (0, y))
        y += part.height
    return out


def halo(size: tuple[int, int], centre: tuple[float, float], radius: float, back: float | None) -> Image.Image:
    """The warm halo of glow() in ui/sprites.ts: stops at 0, 0.45 and 1 of the radius, dithered so its
    faint edge does not band. With `back` (the y of a wall prop's back edge) it stops at the wall."""
    w, h = size
    im = Image.new("RGBA", size)
    px = im.load()
    noise = random.Random(7)
    fade = 0.12 * PX
    stops = [(0, (255, 196, 110), GLOW), (0.45, (255, 160, 70), GLOW * 0.45), (1, (255, 140, 60), 0)]
    x0, x1 = max(0, int(centre[0] - radius)), min(w, int(centre[0] + radius) + 1)
    y0, y1 = max(0, int(centre[1] - radius)), min(h, int(centre[1] + radius) + 1)
    for y in range(y0, y1):
        cut = 1.0 if back is None else min(1.0, max(0.0, (y - back) / fade))
        if cut <= 0:
            continue
        for x in range(x0, x1):
            t = math.dist((x + 0.5, y + 0.5), centre) / radius
            if t >= 1:
                continue
            (t0, c0, a0), (t1, c1, a1) = (stops[0], stops[1]) if t < 0.45 else (stops[1], stops[2])
            f = (t - t0) / (t1 - t0)
            colour = tuple(round(c0[i] + (c1[i] - c0[i]) * f) for i in range(3))
            alpha = (a0 + (a1 - a0) * f) * 255 * cut + noise.random() - 0.5
            px[x, y] = (*colour, max(0, min(255, round(alpha))))
    return im


def compose(body: Image.Image, w: int, h: int, item: dict, pad: float) -> Image.Image:
    """The final picture: footprint plus margin, halo, shadow and the prop placed in its squares."""
    size = (round((w + pad * 2) * PX), round((h + pad * 2) * PX))
    canvas = Image.new("RGBA", size)
    if item.get("halo"):
        centre = ((pad + w / 2) * PX, (pad + h / 2) * PX)
        back = (pad + INSET) * PX if item.get("anchor") == "back" else None
        canvas.alpha_composite(halo(size, centre, (max(w, h) / 2 + pad) * PX, back))
    x = (pad + w / 2) * PX - body.width / 2
    y = (pad + INSET) * PX if item.get("anchor") == "back" else (pad + h / 2) * PX - body.height / 2
    at = (round(x), round(y))
    depth = item.get("shadow", 1)
    shade = Image.new("L", size)
    shade.paste(body.getchannel("A"), at)
    shade = shade.filter(ImageFilter.GaussianBlur(SHADOW_BLUR * PX / 2))
    shade = shade.point(lambda v: round(v * SHADOW_OPACITY * depth))
    canvas.alpha_composite(Image.merge("RGBA", (*(Image.new("L", size),) * 3, shade)))
    canvas.alpha_composite(body, at)
    return canvas


def fitted(pic: Image.Image, w: int, h: int, item: dict) -> Image.Image:
    room_w, room_h = (w - INSET * 2) * PX * item.get("fill", 1), (h - INSET * 2) * PX * item.get("fill", 1)
    if item.get("run"):
        return run_body(pic, item["run"], round(room_w), round((h - INSET * 2) * PX))
    s = min(room_w / pic.width, room_h / pic.height)
    return resize(pic, pic.width * s, pic.height * s)


def options(prop: str, extra: dict) -> dict:
    """How a prop is fitted: from its catalogue entry, plus a sheet's own extras (the bar's run)."""
    spec = catalogue.PROPS[prop]
    return {
        "fill": spec.fill,
        "anchor": spec.anchor,
        "halo": spec.halo,
        "spin": spec.spin,
        "shadow": 0.3 if prop in FLAT else 1,
        "sizes": [[spec.w, spec.h]],
        **extra,
    }


def main() -> None:
    inspect = "--inspect" in sys.argv
    rows = [r for r in catalogue.build_rows() if r.category == "prop" and (ROOT / r.path).exists()]
    # prop -> size -> fitted pictures, in catalogue order.
    pictures: dict[str, dict[tuple[int, int], list[Image.Image]]] = {}
    specs: dict[str, dict] = {}
    for row in rows:
        image = clean(Image.open(ROOT / row.path))
        items = [{"prop": prop, "at": at} for prop, at, _ in row.props]
        crops = locate(image, items, row.file)
        for (prop, _, extra), pic in zip(row.props, crops):
            if extra.get("skip"):
                continue
            item = options(prop, extra)
            if inspect:
                print(f"{row.file}: {prop} {pic.size} sizes {item['sizes']}")
                continue
            specs.setdefault(prop, {k: v for k, v in item.items() if k not in ("sizes", "run")})
            for w, h in item["sizes"]:
                # Fitted with this sheet's own extras; the board mirrors and turns it for more variety.
                pictures.setdefault(prop, {}).setdefault((w, h), []).append(fitted(pic, w, h, item))
    if inspect:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        old.unlink()
    files: list[str] = []
    listing = {}
    for prop, by_size in sorted(pictures.items()):
        item = specs[prop]
        pad = max(PAD, item.get("halo", 0))
        for (w, h), bodies in sorted(by_size.items()):
            for v, body in enumerate(bodies):
                path = OUT / f"{prop}-{v}-{w}x{h}.webp"
                compose(body, w, h, item, pad).save(path, "WEBP", quality=88, method=6)
                files.append(path.name)
        listing[prop] = {
            "sizes": {f"{w}x{h}": len(b) for (w, h), b in sorted(by_size.items())},
            "pad": pad,
            "spin": bool(item.get("spin")),
        }
    lines = [
        "// Generated by scripts/sprites/import_sheets.py from the catalogue (scripts/sprites/catalogue.py);",
        "// do not edit by hand. RYT-066: painted props the author made with ChatGPT (docs/sprite-art.md).",
        "",
        "export interface PropPicture {",
        "  /** Pictures per size in squares (`${w}x${h}`, as drawn before any turn). */",
        "  sizes: Readonly<Record<string, number>>",
        "  /** Margin around the footprint (shadow, halo), in squares. */",
        "  pad: number",
        "  /** Square and without a front: the board may turn it a quarter. */",
        "  spin: boolean",
        "}",
        "",
        "export const propPictures: Readonly<Record<string, PropPicture>> = {",
    ]
    for prop, e in listing.items():
        sizes = ", ".join(f"'{k}': {n}" for k, n in e["sizes"].items())
        key = prop if prop.isidentifier() else f"'{prop}'"
        lines.append(f"  {key}: {{ sizes: {{ {sizes} }}, pad: {e['pad']}, spin: {str(e['spin']).lower()} }},")
    lines.append("}")
    LIST.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    # Formatted as the repository's checks expect, so a fresh import never fails CI.
    subprocess.run(["npx", "prettier", "--write", str(LIST)], cwd=ROOT, check=True, shell=os.name == "nt",
                   stdout=subprocess.DEVNULL)
    catalogue.main(imported={r.file for r in rows})
    total = sum((OUT / name).stat().st_size for name in files)
    print(f"{len(rows)} sheets, {len(files)} pictures, {total // 1024} KB, list in {LIST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
