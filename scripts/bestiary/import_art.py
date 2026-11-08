"""Import the creature pictures painted by hand in ChatGPT into the bundled bestiary art.

Usage:
  python3 -I scripts/bestiary/import_art.py            import every picture saved in art/bestiary/source/
  python3 -I scripts/bestiary/import_art.py --check    only report what would be imported and what is wrong

Every `art/bestiary/source/<creature id>.png` (the file name and path the catalogue gives) replaces the
creature's bundled art: public/bestiary/art/<id>.webp (720px) and public/bestiary/thumbs/<id>.webp (128px
square), its credit in src/features/bestiary/content/art.json and docs/bestiary-art-credits.md. The
selection (art-selection.json) keeps the replaced source under "replaced", so build_images.py rebuilds
the same art. art-generated.json logs each imported source: its checksum, size and the C2PA provenance
ChatGPT writes into the PNG (software agent, model, date). The catalogue is then rewritten, which marks
the imported rows. Unchanged sources are skipped, so the import can run after every batch.

A picture is refused when its name is not an SRD creature id, when it is smaller than 512px or when it
is far from square (the prompts ask for 1:1). The Excel catalogue must be closed while it runs.
"""

from __future__ import annotations

import hashlib
import json
import re
import struct
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from PIL import Image  # noqa: E402

import art_catalogue  # noqa: E402
import build_images  # noqa: E402

ROOT = HERE.parents[1]
SOURCE = ROOT / build_images.GENERATED_SOURCE
SELECTION = HERE / "art-selection.json"
LOG = HERE / "art-generated.json"
CREDITS = ROOT / "src/features/bestiary/content/art.json"
MIN_SIDE = 512
MAX_RATIO = 1.1


def cbor_text(chunk: bytes, key: bytes, start: int = 0) -> str | None:
    """The CBOR text value that follows the text key `key` (short texts only), or None."""
    at = chunk.find(bytes([0x60 + len(key)]) + key, start)
    if at < 0:
        return None
    at += 1 + len(key)
    if 0xC0 <= chunk[at] <= 0xD7:  # a tag, such as 0 (a date-time string)
        at += 1
    head = chunk[at]
    if 0x60 <= head < 0x78:
        length, at = head - 0x60, at + 1
    elif head == 0x78:
        length, at = chunk[at + 1], at + 2
    else:
        return None
    return chunk[at:at + length].decode("utf-8", "replace")


def provenance(data: bytes) -> dict | None:
    """The C2PA manifest ChatGPT embeds in its PNGs (a `caBX` chunk): software agent, model, date."""
    at = 8
    while at + 8 <= len(data):
        length, kind = struct.unpack(">I4s", data[at:at + 8])
        if kind == b"caBX":
            chunk = data[at + 8:at + 8 + length]
            created = chunk.find(b"c2pa.created")
            when = cbor_text(chunk, b"when", created) if created >= 0 else None
            return {
                "agent": cbor_text(chunk, b"name"),
                "version": cbor_text(chunk, b"version"),
                "created": re.sub(r"\.\d+Z$", "Z", when) if when else None,
            }
        at += 12 + length
    return None


def inspect(path: Path, ids: set[str]) -> tuple[Image.Image | None, str | None]:
    if path.stem not in ids:
        return None, "the name is not an SRD creature id (see the 'file' column of the catalogue)"
    try:
        image = Image.open(path)
        image.load()
    except OSError as error:
        return None, f"not a readable image ({error})"
    width, height = image.size
    if min(width, height) < MIN_SIDE:
        return None, f"too small ({width}x{height}); save ChatGPT's full-size download"
    if max(width, height) / min(width, height) > MAX_RATIO:
        return None, f"not square ({width}x{height}); the prompts ask for 1:1"
    return image, None


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    build_images.prettier(path, ROOT)


def main() -> None:
    check = "--check" in sys.argv[1:]
    monsters = json.loads((ROOT / "src/features/bestiary/content/index.json").read_text(encoding="utf-8"))
    ids = {m["id"] for m in monsters["monsters"]}
    selection = json.loads(SELECTION.read_text(encoding="utf-8"))
    credits = json.loads(CREDITS.read_text(encoding="utf-8"))
    log = json.loads(LOG.read_text(encoding="utf-8")) if LOG.exists() else {}
    art_dir, thumb_dir = ROOT / "public/bestiary/art", ROOT / "public/bestiary/thumbs"
    imported, unchanged, refused = [], [], []
    for path in sorted(SOURCE.glob("*.png")):
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        creature = path.stem
        if log.get(creature, {}).get("sha256") == digest and credits.get(creature, {}).get("origin") == "generated":
            unchanged.append(creature)
            continue
        image, problem = inspect(path, ids)
        if problem:
            refused.append(f"{path.name}: {problem}")
            continue
        imported.append(creature)
        if check:
            continue
        width, height = build_images.save_renditions(creature, image, [0.5, 0.45], art_dir, thumb_dir)
        credits[creature] = {**build_images.generated_credit(creature), "width": width, "height": height}
        before = selection[creature]
        replaced = before.get("replaced") if "generated" in before else before
        selection[creature] = {"generated": path.name, **({"replaced": replaced} if replaced else {})}
        log[creature] = {
            "file": f"{build_images.GENERATED_SOURCE}/{path.name}",
            "sha256": digest,
            "width": image.width,
            "height": image.height,
            "c2pa": provenance(data),
            "imported": date.today().isoformat(),
        }
    missing = sorted(c for c, choice in selection.items()
                     if "generated" in choice and not (SOURCE / choice["generated"]).exists())
    print(f"{'would import' if check else 'imported'} {len(imported)}: {', '.join(imported) or '-'}")
    print(f"unchanged {len(unchanged)}")
    for line in refused:
        print(f"refused {line}")
    for creature in missing:
        print(f"note {creature}: its picture is not in {build_images.GENERATED_SOURCE}/ any more; the "
              "imported art stays until you restore or rebuild it")
    for creature in imported:
        if not check and log[creature]["c2pa"] is None:
            print(f"note {creature}: no C2PA manifest; was it saved with ChatGPT's download button?")
    if check:
        sys.exit(1 if refused else 0)
    if imported:
        CREDITS.write_text(json.dumps(credits, indent=1, ensure_ascii=False, sort_keys=True) + "\n",
                           encoding="utf-8")
        write_json(SELECTION, dict(sorted(selection.items())))
        write_json(LOG, dict(sorted(log.items())))
        build_images.write_credits(ROOT, credits, *build_images.credited_commits(ROOT))
    art_catalogue.main()
    if refused:
        sys.exit(1)


if __name__ == "__main__":
    main()
