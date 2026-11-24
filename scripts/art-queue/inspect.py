#!/usr/bin/env python3
"""Automatic checks of one picture of the image queue (docs/art-queue.md). Local tool, never imported by the app.

Usage: python -I scripts/art-queue/inspect.py <file> --aspect 1:1 --min-side 1024 --background transparent [--crop]

Prints one JSON object: {width, height, format, sha256, provenance, checks: [{key, level, message}]}.
level is "ok", "warn" or "fail". Any "fail" means the picture cannot be approved as it is.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ASPECT_TOLERANCE = 0.04


def provenance(data: bytes) -> dict | None:
    """C2PA manifest written by ChatGPT into the PNG (caBX chunk). Returns what it names, or None."""
    if b"caBX" not in data and b"c2pa" not in data:
        return None
    found = {"c2pa": True}
    for label in (b"ChatGPT", b"gpt-image", b"OpenAI"):
        if label in data:
            found.setdefault("names", []).append(label.decode())
    return found


def ratio(text: str) -> float:
    w, h = text.split(":")
    return float(w) / float(h)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("--aspect", default="1:1")
    parser.add_argument("--min-side", type=int, default=1024)
    parser.add_argument("--background", choices=["opaque", "transparent"], default="opaque")
    parser.add_argument("--crop", action="store_true", help="the importer crops to the aspect, so a mismatch only warns")
    args = parser.parse_args()

    path = Path(args.file)
    checks: list[dict] = []
    result: dict = {"file": str(path), "checks": checks}

    def add(key: str, level: str, message: str) -> None:
        checks.append({"key": key, "level": level, "message": message})

    if not path.is_file():
        add("file", "fail", f"No hay ningún archivo en {path}.")
        print(json.dumps(result, ensure_ascii=False))
        return

    data = path.read_bytes()
    result["sha256"] = hashlib.sha256(data).hexdigest()
    result["bytes"] = len(data)
    if not data.startswith(PNG_SIGNATURE):
        add("file", "fail", "No es un PNG (¿un JPEG o WebP renombrado?). Descarga la imagen con el botón de ChatGPT.")
    else:
        add("file", "ok", "PNG.")

    try:
        image = Image.open(path)
        image.load()
    except Exception as error:  # noqa: BLE001 - any decoder error means the file is unusable
        add("decode", "fail", f"No se puede abrir la imagen: {error}.")
        print(json.dumps(result, ensure_ascii=False))
        return

    width, height = image.size
    result.update(width=width, height=height, format=image.format, mode=image.mode)

    short = min(width, height)
    if short < args.min_side:
        add("size", "fail", f"{width}×{height}: el lado corto mide {short} px y hacen falta {args.min_side}.")
    else:
        add("size", "ok", f"{width}×{height}.")

    want = ratio(args.aspect)
    have = width / height
    off = abs(have - want) / want
    if off <= ASPECT_TOLERANCE:
        add("aspect", "ok", f"Proporción {args.aspect}.")
    elif args.crop:
        add("aspect", "warn", f"Proporción {have:.2f} en vez de {args.aspect}; se recortará al importar.")
    else:
        add("aspect", "fail", f"Proporción {have:.2f} en vez de {args.aspect}.")

    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    if args.background == "transparent":
        if not has_alpha:
            add("alpha", "fail", "Sin canal alfa: el fondo no es transparente (¿un damero pintado?).")
        else:
            alpha = image.convert("RGBA").getchannel("A")
            corners = [alpha.getpixel(p) for p in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))]
            clear = sum(alpha.histogram()[:8]) / (width * height)
            if max(corners) > 16 or clear < 0.05:
                add("alpha", "fail", f"El fondo no es transparente (esquinas {corners}, {clear:.0%} transparente).")
            else:
                add("alpha", "ok", f"Fondo transparente ({clear:.0%} de la imagen).")
    elif has_alpha:
        alpha = image.convert("RGBA").getchannel("A")
        clear = sum(alpha.histogram()[:8]) / (width * height)
        if clear > 0.01:
            add("alpha", "warn", f"Se pidió fondo opaco y {clear:.0%} de la imagen es transparente.")

    found = provenance(data)
    result["provenance"] = found
    if found and found.get("names"):
        add("provenance", "ok", "Manifiesto C2PA de " + ", ".join(found["names"]) + ".")
    elif found:
        add("provenance", "warn", "Hay un manifiesto C2PA, pero no nombra ChatGPT.")
    else:
        add("provenance", "warn", "Sin manifiesto C2PA: ¿una captura o una copia del portapapeles? Mejor con el botón de descarga.")

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
