"""Contact sheets of image candidates for curating the bestiary art by eye (ADR 030).

Usage: python3 -I scripts/bestiary/contact_sheet.py <candidates.json> <out-dir> [--per-sheet 30] [--max 3]
       [--only id,id]

Each sheet is a grid of candidates, six to a row, labelled with the creature id, the candidate number
and its licence (320px thumbnails cached in <out-dir>/thumbs).
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

UA = "RyttaBestiaryImages/0.1 (tabletop companion; manual content build)"
CELL, LABEL, MAX = 200, 30, 12


def fetch(url: str, target: Path) -> Image.Image | None:
    if not (target.exists() and target.stat().st_size > 0):
        for attempt in range(5):
            run = subprocess.run(["curl", "-s", "-L", "-A", UA, "-o", str(target), "-w", "%{http_code}", url],
                                 capture_output=True, text=True, timeout=60)
            if run.stdout == "200":
                time.sleep(0.3)
                break
            target.unlink(missing_ok=True)
            time.sleep(8 + attempt * 8 if run.stdout == "429" else 2)
        else:
            return None
    try:
        return Image.open(BytesIO(target.read_bytes())).convert("RGB")
    except Exception:  # noqa: BLE001 - unreadable thumbnail: leave the cell empty
        return None


def main() -> None:
    candidates = json.load(open(sys.argv[1], encoding="utf-8"))
    out = Path(sys.argv[2])
    args = sys.argv[3:]
    per = int(args[args.index("--per-sheet") + 1]) if "--per-sheet" in args else 30
    limit = int(args[args.index("--max") + 1]) if "--max" in args else 3
    only = args[args.index("--only") + 1].split(",") if "--only" in args else None
    (out / "thumbs").mkdir(parents=True, exist_ok=True)
    try:
        font = ImageFont.truetype("arial.ttf", 15)
    except OSError:
        font = ImageFont.load_default()
    # One cell per candidate, six to a row, labelled "creature #n licence".
    cells = [(creature, n, c) for creature in (only or list(candidates))
             for n, c in enumerate(candidates.get(creature, [])[:limit])]
    columns = 6
    for sheet in range(0, len(cells), per):
        chunk = cells[sheet:sheet + per]
        rows = (len(chunk) + columns - 1) // columns
        canvas = Image.new("RGB", (columns * CELL, rows * (CELL + LABEL * 2)), "white")
        draw = ImageDraw.Draw(canvas)
        for i, (creature, n, c) in enumerate(chunk):
            x, y = (i % columns) * CELL, (i // columns) * (CELL + LABEL * 2)
            name = re.sub(r"[^A-Za-z0-9._-]+", "_", c["file"])[:120]
            image = fetch(c["thumb"], out / "thumbs" / name) if c.get("thumb") else None
            if image:
                image.thumbnail((CELL - 6, CELL - 6))
                canvas.paste(image, (x + 3, y + LABEL))
            draw.text((x + 4, y + 6), f"{creature} #{n}", fill="black", font=font)
            draw.text((x + 4, y + LABEL + CELL - 2), c["license"][:26], fill="#a00", font=font)
        canvas.save(out / f"sheet-{sheet // per:03}.jpg", quality=75)
        print(f"sheet {sheet // per:03}: {chunk[0][0]} .. {chunk[-1][0]}", flush=True)


if __name__ == "__main__":
    main()
