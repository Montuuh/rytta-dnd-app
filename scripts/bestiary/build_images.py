"""Build the bundled SRD creature art from a curated selection (ADR 030).

Usage:
  python3 -I scripts/bestiary/build_images.py <selection.json> <repo-root>
      --candidates a.json,b.json   Commons candidates (image_candidates.py output and extra lists)
      --wesnoth <dir> <commit>     a checkout of github.com/wesnoth/wesnoth (data/core/images/portraits)
      --icons <dir> <commit>       PNG plates from render_icons.mjs and the game-icons commit

`selection.json` maps every SRD creature id to one source, optionally with a crop focus for the
square thumbnail ([x, y], 0-1):
  {"wolf": {"commons": "File:Eurasian wolf 2.jpg"}}            Wikimedia Commons file (free licence)
  {"lich": {"wesnoth": "undead/lich.webp"}}                    Battle for Wesnoth portrait (GPL-2.0+)
  {"mimic": {"icon": "delapouite/mimic-chest"}}                game-icons.net icon (CC BY 3.0)
  {"adult-blue-dragon": {"icon": "lorc/dragon-head", "ink": "#2f5f93"}}   the same, tinted

It writes public/bestiary/art/<id>.webp (longest side 720px), public/bestiary/thumbs/<id>.webp
(128px square), src/features/bestiary/content/art.json (credits shown in the app's image viewer) and
docs/bestiary-art-credits.md. Commons downloads are cached next to the selection file.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

UA = "RyttaBestiaryImages/0.1 (tabletop companion; manual content build)"
GPL = ("GPL-2.0-or-later", "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html")
CC_BY_3 = ("CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/")
# Authors the Commons metadata leaves empty or buries in prose (checked on each file page).
AUTHOR_OVERRIDES = {
    "animated-flying-sword": "The Metropolitan Museum of Art",
    "archelon": "Tran Trong Nhan",
    "awakened-shrub": "Hohum",
    "cat": "Karin Langner-Bahmann",
    "centaur-trooper": "Painter of London B 31",
    "cockatrice": "Leonard G.",
    "deva": "The Metropolitan Museum of Art",
    "flesh-golem": "Theodor von Holst",
    "giant-constrictor-snake": "Mariluna",
    "giant-crocodile": "Molly Ebersold, St. Augustine Alligator Farm",
    "giant-owl": "Martin Mecnarowski",
    "giant-seahorse": "William Buelow Gould",
    "giant-wolf-spider": "Brummfuss",
    "hydra": "Wolfgang Sauber (Xenophon)",
    "medusa": "shakko",
    "pegasus": "The J. Paul Getty Museum",
    "pirate-captain": "Joseph Nicholls",
    "plesiosaurus": "Dmitry Bogdanov",
    "purple-worm": "Pieter0024",
    "riding-horse": "François Marchal; derivative work by Dana boomer",
    "violet-fungus": "Dan Molter (shroomydan)",
}
ICON_AUTHORS = {
    "lorc": "Lorc", "delapouite": "Delapouite", "skoll": "Skoll", "sparker": "Sparker",
    "darkzaitzev": "DarkZaitzev", "caro-asercion": "Caro Asercion", "cathelineau": "Cathelineau",
    "sbed": "Sbed", "carl-olsen": "Carl Olsen", "lucasms": "Lucas", "john-redman": "John Redman",
}


def rendition(thumb: str, width: int) -> str:
    """Commons thumbnail URL at another width (`/320px-name` -> `/960px-name`); Wikimedia serves
    standard widths only (960 is one)."""
    return re.sub(r"/\d+px-", f"/{width}px-", thumb.split("?")[0], count=1)


def original(candidate: dict) -> str:
    """Small files: the original (`.../thumb/a/ab/Name.jpg/320px-Name.jpg` -> `.../a/ab/Name.jpg`);
    TIFF originals keep a rendered thumbnail one pixel under their width."""
    if candidate["file"].lower().endswith((".tif", ".tiff")):
        return rendition(candidate["thumb"], candidate["width"] - 1)
    path = re.sub(r"/thumb(/.+)/[^/]+$", r"\1", candidate["thumb"].split("?")[0])
    return re.sub(r"^https://[^/]+/", "https://upload.wikimedia.org/", path)


def download(url: str, target: Path) -> bytes:
    if target.exists() and target.stat().st_size > 0:
        return target.read_bytes()
    code = ""
    for attempt in range(6):
        run = subprocess.run(["curl", "-s", "-L", "-A", UA, "-o", str(target), "-w", "%{http_code}", url],
                             capture_output=True, text=True, timeout=120)
        code = run.stdout
        if code == "200" and target.stat().st_size > 0:
            time.sleep(0.8)
            return target.read_bytes()
        target.unlink(missing_ok=True)
        time.sleep(10 + attempt * 10 if code == "429" else 3)
    raise RuntimeError(f"download failed ({code}): {url}")


def author_text(candidate: dict) -> str:
    text = re.sub(r"\s+", " ", candidate.get("artist") or "").strip()
    text = re.sub(r"\s*\(talk\)|\s*\[\s*\]", "", text)
    # Commons user names read "User:Name"; the credit shows the name.
    text = re.sub(r"\bUser:", "", text)
    if not text or text.lower() in ("unknown", "unknown author", "unknown artist"):
        credit = re.sub(r"\s+", " ", candidate.get("credit") or "").strip()
        text = credit if credit and len(credit) < 120 else "Unknown author"
    return text[:200]


def option(args: list[str], name: str, count: int = 1) -> list[str]:
    at = args.index(name)
    return args[at + 1:at + 1 + count]


def main() -> None:
    selection = json.load(open(sys.argv[1], encoding="utf-8"))
    root = Path(sys.argv[2])
    args = sys.argv[3:]
    candidates: dict[str, dict] = {}
    for path in option(args, "--candidates")[0].split(","):
        for options in json.load(open(path, encoding="utf-8")).values():
            for c in options:
                candidates[c["file"]] = c
    wesnoth, wesnoth_commit = option(args, "--wesnoth", 2)
    icons, icons_commit = option(args, "--icons", 2)
    cache = Path(sys.argv[1]).parent / "cache"
    cache.mkdir(exist_ok=True)
    art_dir, thumb_dir = root / "public/bestiary/art", root / "public/bestiary/thumbs"
    art_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)
    credits: dict[str, dict] = {}
    for count, (creature, choice) in enumerate(sorted(selection.items()), 1):
        if "commons" in choice:
            candidate = candidates.get(choice["commons"])
            if candidate is None:
                raise SystemExit(f"{creature}: {choice['commons']} is not among the candidates")
            url = original(candidate) if (candidate.get("width") or 0) <= 960 \
                else rendition(candidate["thumb"], 960)
            safe = re.sub(r"[^A-Za-z0-9._-]+", "_", candidate["file"].removeprefix("File:"))[:120]
            image = Image.open(BytesIO(download(url, cache / f"{safe}.960")))
            credit = {
                "origin": "commons",
                "title": candidate["file"].removeprefix("File:"),
                "source": candidate["page"],
                "author": AUTHOR_OVERRIDES.get(creature) or author_text(candidate),
                "license": candidate["license"],
                **({"licenseUrl": candidate["licenseUrl"]}
                   if (candidate.get("licenseUrl") or "").startswith("http") else {}),
            }
        elif "wesnoth" in choice:
            path = f"data/core/images/portraits/{choice['wesnoth']}"
            image = Image.open(Path(wesnoth) / path)
            credit = {
                "origin": "wesnoth",
                "title": f"Battle for Wesnoth portrait: {choice['wesnoth']}",
                "source": f"https://github.com/wesnoth/wesnoth/blob/{wesnoth_commit}/{path}",
                "author": "Battle for Wesnoth contributors",
                "license": GPL[0],
                "licenseUrl": GPL[1],
            }
        else:
            folder, name = choice["icon"].split("/")
            tint = f"__{choice['ink'][1:]}" if choice.get("ink") else ""
            image = Image.open(Path(icons) / f"{folder}__{name}{tint}.png")
            credit = {
                "origin": "game-icons",
                "title": f"game-icons.net: {name}",
                "source": f"https://game-icons.net/1x1/{folder}/{name}.html",
                "author": ICON_AUTHORS.get(folder, folder),
                "license": CC_BY_3[0],
                "licenseUrl": CC_BY_3[1],
            }
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
        full = image.copy()
        full.thumbnail((720, 720), Image.Resampling.LANCZOS)
        full.save(art_dir / f"{creature}.webp", "WEBP", quality=80, method=6)
        # Portraits stand on a transparent ground: their crop centres higher, on the face.
        fx, fy = choice.get("focus", [0.5, 0.35 if "wesnoth" in choice else 0.45])
        side = min(image.size)
        left = min(max(0, round(fx * image.width - side / 2)), image.width - side)
        top = min(max(0, round(fy * image.height - side / 2)), image.height - side)
        square = image.crop((left, top, left + side, top + side)).resize((128, 128), Image.Resampling.LANCZOS)
        square.save(thumb_dir / f"{creature}.webp", "WEBP", quality=78, method=6)
        credits[creature] = {**credit, "width": full.width, "height": full.height}
        print(f"{count:3}/{len(selection)} {creature}", flush=True)
    for stale in [*art_dir.glob("*.webp"), *thumb_dir.glob("*.webp")]:
        if stale.stem not in selection:
            stale.unlink()
    out = root / "src/features/bestiary/content/art.json"
    out.write_text(json.dumps(credits, indent=1, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    write_credits(root, credits, wesnoth_commit, icons_commit)


def write_credits(root: Path, credits: dict[str, dict], wesnoth_commit: str, icons_commit: str) -> None:
    cell = lambda text: text.replace("|", "\\|")  # noqa: E731
    lines = [
        "# Bestiary art credits",
        "",
        "Bundled art for the SRD creatures (ADR 030). Generated by `scripts/bestiary/build_images.py`;",
        "do not edit by hand. Every image was resized (720px) and cropped to a 128px square thumbnail.",
        "The app's image viewer shows the same author, licence and source for each creature.",
        "",
        "- Wikimedia Commons files keep the licence of each file, listed below.",
        "- Battle for Wesnoth portraits (https://www.wesnoth.org), GNU GPL v2 or later, from commit",
        f"  `{wesnoth_commit}` of https://github.com/wesnoth/wesnoth (`data/core/images/portraits`).",
        "  The full source of the portraits is in that repository.",
        "- game-icons.net icons (https://game-icons.net), CC BY 3.0, from commit",
        f"  `{icons_commit}` of https://github.com/game-icons/icons, recoloured as ink on parchment.",
        "",
        "| Creature | Image | Author | Licence |",
        "| --- | --- | --- | --- |",
    ]
    for creature, credit in sorted(credits.items()):
        license_cell = f"[{cell(credit['license'])}]({credit['licenseUrl']})" if credit.get("licenseUrl") \
            else cell(credit["license"])
        lines.append(f"| {creature} | [{cell(credit['title'])}]({credit['source']}) | {cell(credit['author'])} | "
                     f"{license_cell} |")
    credits_doc = root / "docs/bestiary-art-credits.md"
    credits_doc.write_text("\n".join(lines) + "\n", encoding="utf-8")
    prettier(credits_doc, root)


def prettier(path: Path, root: Path) -> None:
    """Formats a written file as the repository's format check expects, so a rebuild never fails CI."""
    subprocess.run(["npx", "prettier", "--write", str(path)], cwd=root, check=True, shell=os.name == "nt",
                   stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
