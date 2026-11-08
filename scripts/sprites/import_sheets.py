#!/usr/bin/env python3
"""RYT-066/068: turn the painted art the author made with ChatGPT into the pictures Rytta ships.

Reads the catalogue (scripts/sprites/catalogue.py) and every picture of it saved under
art/sprites/source/ (docs/sprite-art.md). Rejected rows (catalogue.REJECTED) are skipped.

Props (sheets of variants). For every prop it:
1. finds the prop on its sheet (the shape nearest to the layout's hint, in fractions of the sheet);
2. cleans the edge (faint pixels dropped, the near-opaque body made opaque; a hazy background is
   lifted, and a flat magenta or other uniform background is keyed out);
3. fits it inside its squares at its share of them, with the back of wall props on the top edge;
4. adds a soft contact shadow under it (centred: props turn on the board) and, for light sources, a
   warm halo that stops at the wall behind wall props;
5. writes public/tabletop/props/<prop>-<variant>-<w>x<h>.webp (the board mirrors them and turns
   square props without a front, so no copies are stored).
Long props with a `run` (the pilot bar) are rebuilt for each length: caps kept, the strips holding
their items repeated, the plain wood between them stretched along its grain. The magic circles
(an effect sheet painted on black) become the `magic-circle` prop.

Map art (RYT-068), read by the painter (src/features/tabletop/ui/painter.ts):
- floors and walls: seamless 4 x 4 square tiles, resized to TILE pixels with the wrap seam evened out,
  in public/tabletop/textures/{floors,walls}/<slug>.webp;
- effects: the same tiles with transparency (painted on black: the light is the opacity; on white:
  the shade is), in public/tabletop/textures/effects/<slug>.webp, for spell areas;
- decals: each sheet of 9 cut into a 3 x 3 atlas of DECAL pixel cells, public/tabletop/decals/<slug>.webp.

It then writes src/features/tabletop/ui/prop-pictures.ts and map-art.ts (the lists the app reads),
and the catalogue again with these pictures marked imported.

Run: python scripts/sprites/import_sheets.py            (writes the pictures and the lists)
     python scripts/sprites/import_sheets.py --inspect  (prints what it finds, writes nothing)
     python scripts/sprites/import_sheets.py --props    (props only; --art for map art only)
     python scripts/sprites/import_sheets.py --thumbs   (only the tiles' thumbnails, from the tiles)
"""

from __future__ import annotations

import math
import os
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalogue  # noqa: E402

SOURCE = ROOT / "art/sprites/source"
OUT = ROOT / "public/tabletop/props"
TEXTURES = ROOT / "public/tabletop/textures"
DECALS = ROOT / "public/tabletop/decals"
LIST = ROOT / "src/features/tabletop/ui/prop-pictures.ts"
ART_LIST = ROOT / "src/features/tabletop/ui/map-art.ts"

PX = 192  # pixels per square: sharp on a 4K table and when the DM zooms in
INSET = 0.04  # squares kept free between a prop and the edge of its footprint
PAD = 0.2  # margin around the footprint for the shadow (as propSprite)
# As shadowed() in ui/sprites.ts: a contact shadow, black at 50 %, blurred 0.12 squares, not offset,
# so it stays right when the board turns the prop. Flat props (rugs, plates) cast a lighter one.
SHADOW_OPACITY, SHADOW_BLUR = 0.5, 0.12
FLAT = {"rug", "web", "trapdoor", "pressure-plate", "pit", "lily-pads", "mushroom-ring", "spike-trap", "coins",
        "magic-circle"}
GLOW = 0.28  # halo strength, as propSprite's glow() call
ALPHA_LO, ALPHA_HI = 16, 248  # below: dropped; above: opaque (the sheets' bodies sit at 250-253)
STEP = 4  # the mask used to find props is the sheet divided by this
TILE = 512  # pixels of a 4 x 4 square tile: 128 a square, above the 64-96 maps are painted at
DECAL = 160  # pixels of a decal cell (a decal is at most one square)
WEBP = dict(format="WEBP", method=6)


# ------------------------------------------------------------------------------------- cleaning


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


def haze(alpha: Image.Image) -> int:
    """The opacity of a sheet's background haze (some sheets come with a faint grey veil): the 90th
    percentile of the border's alpha. 0 on a clean sheet."""
    w, h = alpha.size
    border = [alpha.getpixel((x, y)) for x in range(0, w, 5) for y in (0, 1, h - 2, h - 1)]
    border += [alpha.getpixel((x, y)) for y in range(0, h, 5) for x in (0, 1, w - 2, w - 1)]
    border.sort()
    return border[int(len(border) * 0.9)]


def clean(im: Image.Image) -> Image.Image:
    """Faint haze dropped, the body opaque, no colour left under transparent pixels."""
    im = im.convert("RGBA")
    w, h = im.size
    if all(im.getpixel(p)[3] == 255 for p in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3))):
        im = key_out(im)
    r, g, b, a = im.split()
    # A veiled sheet: everything up to a little above the veil's opacity is background.
    lo = max(ALPHA_LO, haze(a) + 24) if haze(a) > ALPHA_LO else ALPHA_LO
    hi = max(ALPHA_HI if lo == ALPHA_LO else 230, lo + 40)
    span = hi - lo
    a = a.point(lambda v: 0 if v < lo else 255 if v >= hi else round((v - lo) * 255 / span))
    out = Image.merge("RGBA", (r, g, b, a))
    return Image.composite(out, Image.new("RGBA", im.size), a.point(lambda v: 255 if v else 0))


def on_black(im: Image.Image) -> Image.Image:
    """A picture painted on black, as transparency: the brightest channel is the opacity and the
    colour is divided by it (so drawn over black it is the same picture, over a map it lights it)."""
    rgb = im.convert("RGB")
    a = ImageChops.lighter(ImageChops.lighter(*rgb.split()[:2]), rgb.split()[2])
    return unpremultiply(rgb, a, Image.new("RGB", rgb.size, (0, 0, 0)))


def on_white(im: Image.Image) -> Image.Image:
    """A picture painted on white, as transparency: the darkest channel's shade is the opacity."""
    rgb = im.convert("RGB")
    r, g, b = rgb.split()
    a = ImageChops.invert(ImageChops.darker(ImageChops.darker(r, g), b))
    return unpremultiply(rgb, a, Image.new("RGB", rgb.size, (255, 255, 255)))


def unpremultiply(rgb: Image.Image, a: Image.Image, back: Image.Image) -> Image.Image:
    """The colour c with opacity a such that c over `back` gives rgb."""
    w, h = rgb.size
    src, al, bk = rgb.load(), a.load(), back.getpixel((0, 0))
    out = Image.new("RGBA", rgb.size)
    dst = out.load()
    for y in range(h):
        for x in range(w):
            av = al[x, y]
            if av < 3:
                continue
            f = av / 255
            dst[x, y] = (*(max(0, min(255, round((c - k * (1 - f)) / f))) for c, k in zip(src[x, y], bk)), av)
    return out


# ------------------------------------------------------------------------------------- finding shapes


def shapes(alpha: Image.Image, grow: int = 5) -> list[tuple[int, int, int, int]]:
    """Bounding boxes of the separate shapes on a sheet (tiny specks ignored)."""
    w, h = alpha.size
    small = alpha.resize((w // STEP, h // STEP), Image.BOX).point(lambda v: 255 if v > 8 else 0)
    # Joins a flame to its candle and a fringe to its rug before shapes are counted.
    if grow > 1:
        small = small.filter(ImageFilter.MaxFilter(grow))
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
    """Each item's picture: the shape nearest to its hint, one shape per item. Small pieces near a
    chosen shape (a scattered decal's specks) join it."""
    w, h = sheet.size
    boxes = shapes(sheet.getchannel("A"))
    if len(boxes) < len(items):
        # Shapes painted close together: counted again without joining nearby pieces, and as a last
        # resort each item is cut from its own share of the sheet around its hint.
        boxes = shapes(sheet.getchannel("A"), grow=1)
    if len(boxes) < len(items):
        cols = len({round(i["at"][0], 2) for i in items})
        rows = len({round(i["at"][1], 2) for i in items})
        cw, ch = w / cols, h / rows
        boxes = []
        for item in items:
            x0, y0 = item["at"][0] * w - cw / 2, item["at"][1] * h - ch / 2
            cut = sheet.crop((round(x0), round(y0), round(x0 + cw), round(y0 + ch))).getchannel("A").getbbox()
            if not cut:
                raise SystemExit(f"{name}: nothing near {item.get('prop', '?')} at {item['at']}")
            boxes.append((round(x0) + cut[0], round(y0) + cut[1], round(x0) + cut[2], round(y0) + cut[3]))
        print(f"{name}: cut by cells")
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
            raise SystemExit(f"{name}: no shape near {items[i].get('prop', i)} at {items[i]['at']}")
        chosen[i] = k
        used.add(k)
    # Leftover shapes go to the item whose hint is nearest, when inside that item's cell.
    cell = items[0].get("cell")
    joined = {i: list(boxes[k]) for i, k in chosen.items()}
    if cell:
        for k, b in enumerate(boxes):
            if k in used:
                continue
            c = (((b[0] + b[2]) / 2) / w, ((b[1] + b[3]) / 2) / h)
            i = min(range(len(items)), key=lambda j: math.dist(items[j]["at"], c))
            if abs(c[0] - items[i]["at"][0]) < cell / 2 and abs(c[1] - items[i]["at"][1]) < cell / 2:
                j = joined[i]
                joined[i] = [min(j[0], b[0]), min(j[1], b[1]), max(j[2], b[2]), max(j[3], b[3])]
    crops = []
    for i in range(len(items)):
        x0, y0, x1, y1 = joined[i]
        m = STEP * 3
        region = sheet.crop((max(0, x0 - m), max(0, y0 - m), min(w, x1 + m), min(h, y1 + m)))
        crops.append(region.crop(region.getchannel("A").getbbox()))
    return crops


# ------------------------------------------------------------------------------------- props


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
    out.putalpha(ImageChops.multiply(a, ramp))
    return out


def run_body(pic: Image.Image, run: dict, width: int, length: int) -> Image.Image:
    """A long prop rebuilt to a length: caps as drawn, plain wood stretched along its grain between
    them, and the strips holding its items (tankards) spread evenly, repeated when it is longer."""
    pic = resize(pic, width, pic.height * width / pic.width)

    def rows(f: float) -> int:
        return round(f * pic.height)

    cap, end = rows(run["cap"]), rows(run["end"])
    tail = pic.height - end
    blend = max(2, round(0.06 * PX))
    plain = [rows(f) for f in run["plain"]]
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
    if depth:
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
    if prop == "magic-circle":
        spec = dict(fill=0.98, anchor="", halo=0.0, spin=True, w=2, h=2)
    else:
        p = catalogue.PROPS[prop]
        spec = dict(fill=p.fill, anchor=p.anchor, halo=p.halo, spin=p.spin, w=p.w, h=p.h)
    return {
        "fill": spec["fill"],
        "anchor": spec["anchor"],
        "halo": spec["halo"],
        "spin": spec["spin"],
        "shadow": 0.3 if prop in FLAT else 1,
        "sizes": [[spec["w"], spec["h"]]],
        **extra,
    }


def import_props(rows: list, inspect: bool) -> list[str]:
    # prop -> size -> fitted pictures, in catalogue order.
    pictures: dict[str, dict[tuple[int, int], list[tuple[Image.Image, float | None]]]] = {}
    specs: dict[str, dict] = {}
    for row in rows:
        if row.category == "prop":
            image = clean(Image.open(ROOT / row.path))
            entries = row.props
        elif row.file == "effects/magic-circles.png":
            image = clean(on_black(Image.open(ROOT / row.path)))
            hints = [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)]
            entries = [("magic-circle", at, {}) for at in hints]
        else:
            continue
        crops = locate(image, [{"prop": prop, "at": at} for prop, at, _ in entries], row.file)
        for (prop, _, extra), pic in zip(entries, crops):
            if extra.get("skip"):
                continue
            item = options(prop, extra)
            if inspect:
                print(f"{row.file}: {prop} {pic.size} sizes {item['sizes']}")
                continue
            specs.setdefault(prop, {k: v for k, v in item.items() if k not in ("sizes", "run")})
            for w, h in item["sizes"]:
                # Fitted with this sheet's own extras; the board mirrors and turns it for more variety.
                # Each picture keeps its own halo: an unlit torch casts no light (ui-ux RYT-068 round 14).
                pictures.setdefault(prop, {}).setdefault((w, h), []).append((fitted(pic, w, h, item), item.get("halo")))
    if inspect:
        return []
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        old.unlink()
    files: list[str] = []
    listing = {}
    for prop, by_size in sorted(pictures.items()):
        item = specs[prop]
        pad = max(PAD, item.get("halo", 0))
        for (w, h), bodies in sorted(by_size.items()):
            for v, (body, halo) in enumerate(bodies):
                path = OUT / f"{prop}-{v}-{w}x{h}.webp"
                compose(body, w, h, {**item, "halo": halo}, pad).save(path, quality=86, **WEBP)
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
    total = sum((OUT / name).stat().st_size for name in files)
    print(f"props: {len(listing)} props, {len(files)} pictures, {total // 1024} KB")
    return [str(LIST)]


# ------------------------------------------------------------------------------------- map art


def even_seam(im: Image.Image, band: int) -> Image.Image:
    """Evens out the step where a tile wraps: the edge rows and columns are pulled towards their
    shared average, fading over `band` pixels (a gradient correction; joints and grain stay)."""
    im = im.convert("RGB")
    w, h = im.size
    # The step is measured on a softened copy, so it corrects the tone, not every brush stroke.
    soft = im.filter(ImageFilter.BoxBlur(4))
    sp = soft.load()
    px = im.load()
    for axis in (0, 1):
        n, m = (h, w) if axis == 0 else (w, h)
        for i in range(n):
            first = sp[0, i] if axis == 0 else sp[i, 0]
            last = sp[m - 1, i] if axis == 0 else sp[i, m - 1]
            mid = [(a + b) / 2 for a, b in zip(first, last)]
            d0 = [c - a for c, a in zip(mid, first)]
            d1 = [c - b for c, b in zip(mid, last)]
            for k in range(band):
                f = (1 - k / band) ** 2
                for j, d in ((k, d0), (m - 1 - k, d1)):
                    xy = (j, i) if axis == 0 else (i, j)
                    px[xy] = tuple(max(0, min(255, round(c + dv * f))) for c, dv in zip(px[xy], d))
    return im


def tone(im: Image.Image) -> str:
    r, g, b = (round(v) for v in ImageStat.Stat(im.convert("RGB")).mean[:3])
    return f"#{r:02x}{g:02x}{b:02x}"


def import_art(rows: list, inspect: bool) -> list[str]:
    floors: dict[str, str] = {}
    walls: dict[str, str] = {}
    effects: dict[str, str] = {}
    decals: dict[str, int] = {}
    band = TILE // 24
    for row in rows:
        slug = Path(row.file).stem
        src = ROOT / row.path
        if row.category in ("floor", "wall"):
            if inspect:
                print(f"{row.file}: tile {Image.open(src).size}")
                continue
            im = even_seam(resize(Image.open(src).convert("RGB"), TILE, TILE), band)
            folder = TEXTURES / ("floors" if row.category == "floor" else "walls")
            folder.mkdir(parents=True, exist_ok=True)
            im.save(folder / f"{slug}.webp", quality=80, **WEBP)
            (floors if row.category == "floor" else walls)[slug] = tone(im)
        elif row.category == "effect" and row.file != "effects/magic-circles.png":
            if inspect:
                print(f"{row.file}: effect {row.blend}")
                continue
            im = resize(Image.open(src).convert("RGBA"), TILE, TILE)
            rgb = even_seam(im.convert("RGB"), band)
            if row.blend == "screen":
                out = on_black(rgb)
            elif row.blend == "multiply":
                out = on_white(rgb)
            else:
                a = im.getchannel("A")
                out = Image.merge("RGBA", (*even_seam(rgb, band).split(), a))
            (TEXTURES / "effects").mkdir(parents=True, exist_ok=True)
            out.save(TEXTURES / "effects" / f"{slug}.webp", quality=82, **WEBP)
            effects[slug] = tone(rgb)
        elif row.category == "decal":
            sheet = clean(Image.open(src))
            items = [{"at": at, "cell": 1 / 3} for _, at, _ in row.props]
            crops = locate(sheet, items, row.file)
            if inspect:
                print(f"{row.file}: {len(crops)} decals {[c.size for c in crops]}")
                continue
            atlas = Image.new("RGBA", (DECAL * 3, DECAL * 3))
            # Every decal at the scale of the sheet (they were painted at one scale), the largest
            # filling its cell: the painter sizes them by the catalogue's share of a square.
            biggest = max(max(c.size) for c in crops)
            s = DECAL * 0.94 / biggest
            for k, pic in enumerate(crops):
                pic = resize(pic, pic.width * s, pic.height * s)
                x = (k % 3) * DECAL + (DECAL - pic.width) // 2
                y = (k // 3) * DECAL + (DECAL - pic.height) // 2
                atlas.alpha_composite(pic, (x, y))
            DECALS.mkdir(parents=True, exist_ok=True)
            atlas.save(DECALS / f"{slug}.webp", quality=84, **WEBP)
            decals[slug] = len(crops)
    if inspect:
        return []

    def record(name: str, doc: str, values: dict[str, str] | dict[str, int]) -> list[str]:
        out = [f"/** {doc} */", f"export const {name} = {{"]
        for k, v in sorted(values.items()):
            key = k if k.isidentifier() else f"'{k}'"
            out.append(f"  {key}: {v if isinstance(v, int) else repr(v)},")
        return out + ["} as const", ""]

    lines = [
        "// Generated by scripts/sprites/import_sheets.py from the catalogue (scripts/sprites/catalogue.py);",
        "// do not edit by hand. RYT-068: painted map art the author made with ChatGPT (docs/sprite-art.md).",
        "",
        "/** Pixels of a texture tile; every tile covers 4 × 4 squares. */",
        f"export const tilePixels = {TILE}",
        "/** Pixels of one cell of a decal atlas (3 × 3 cells). */",
        f"export const decalPixels = {DECAL}",
        "",
        *record("floorArt", "Floor tiles (public/tabletop/textures/floors) and their average colour.", floors),
        *record("wallArt", "Wall tiles (public/tabletop/textures/walls) and their average colour.", walls),
        *record("effectArt", "Spell effect tiles with transparency (public/tabletop/textures/effects).", effects),
        *record("decalArt", "Decal atlases (public/tabletop/decals) and how many cells each holds.", decals),
        "export type FloorArt = keyof typeof floorArt",
        "export type WallArt = keyof typeof wallArt",
        "export type EffectArt = keyof typeof effectArt",
        "export type DecalArt = keyof typeof decalArt",
    ]
    ART_LIST.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    weight = sum(p.stat().st_size for p in [*TEXTURES.rglob("*.webp"), *DECALS.glob("*.webp")])
    print(f"art: {len(floors)} floors, {len(walls)} walls, {len(effects)} effects, {len(decals)} decal sheets, "
          f"{weight // 1024} KB")
    return [str(ART_LIST)]


THUMB = 160  # pixels of a tile's thumbnail (the generator's theme samples)


def thumbnails() -> None:
    """Small copies of the floor and wall tiles for the generator's theme samples (a few KB each)."""
    for kind in ("floors", "walls"):
        folder = TEXTURES / kind
        out = TEXTURES / "thumbs" / kind
        out.mkdir(parents=True, exist_ok=True)
        for tile in sorted(folder.glob("*.webp")):
            resize(Image.open(tile).convert("RGB"), THUMB, THUMB).save(out / tile.name, quality=80, **WEBP)


def main() -> None:
    if "--thumbs" in sys.argv:
        thumbnails()
        return
    inspect = "--inspect" in sys.argv
    only_props, only_art = "--props" in sys.argv, "--art" in sys.argv
    rows = [r for r in catalogue.build_rows() if (ROOT / r.path).exists() and r.file not in catalogue.REJECTED]
    written: list[str] = []
    if not only_art:
        written += import_props(rows, inspect)
    if not only_props:
        written += import_art(rows, inspect)
        if not inspect:
            thumbnails()
    if inspect:
        return
    # Formatted as the repository's checks expect, so a fresh import never fails CI.
    subprocess.run(["npx", "prettier", "--write", *written], cwd=ROOT, check=True, shell=os.name == "nt",
                   stdout=subprocess.DEVNULL)
    catalogue.main(imported={r.file for r in rows})


if __name__ == "__main__":
    main()
