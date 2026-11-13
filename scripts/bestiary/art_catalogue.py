"""Write the catalogue of creature pictures to paint by hand in ChatGPT, worst fit first.

Usage:
  python3 -I scripts/bestiary/art_catalogue.py

Reads scripts/bestiary/art-review.json (fit score 1-10, kind and review of the bundled art of each SRD
creature, and the subject of the replacement picture), src/features/bestiary/content/index.json (names,
type, CR) and art.json (current source), and writes art/bestiary/bestiary-art-catalogue.xlsx and the
same rows in art/bestiary/catalogue.csv. One row per creature: the prompt to paste, the file name and the
path to save the picture at. Edit the review file or this script, not the outputs.

The Excel file is a tracker: a 'Tracker' sheet (current picture, creature, file name, Status, Notes,
prompt, then the review), a 'Progress' sheet whose counts follow the Status column, and 'How to use'.
Status and Notes are the cells the author edits. Running the script again keeps them ('keep' and
'rejected' included), marks a row 'generated' when its picture is saved at its path and 'imported' when
art.json credits a generated picture (import_art.py runs it after each import). The Excel file must be
closed while it runs.
"""

from __future__ import annotations

import csv
import json
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "scripts/bestiary/art-review.json"
CONTENT = ROOT / "src/features/bestiary/content"
THUMBS = ROOT / "public/bestiary/thumbs"
OUT = ROOT / "art/bestiary"
SOURCE = OUT / "source"
CSV_PATH = OUT / "catalogue.csv"
XLSX_PATH = OUT / "bestiary-art-catalogue.xlsx"

STATES = ["pending", "generated", "imported", "keep", "rejected"]
KINDS = {"photo": "Photo (Wikimedia Commons)", "artwork": "Old artwork (Wikimedia Commons)",
         "portrait": "Game portrait (Battle for Wesnoth)", "icon": "Icon (game-icons.net)"}
PARCHMENT = (241, 228, 204)

DRAGON_COLOURS = {
    "black": "glossy black scales, horns sweeping forward from a skull-like face with deep-set eyes, acid "
             "dripping from its jaws",
    "blue": "sapphire-blue scales, a single great horn on its snout, frilled ears, lightning crackling "
            "around its jaws",
    "brass": "burnished brass scales, a broad blade-like crest sweeping back from its head, warm amber "
             "eyes, a curious, talkative look",
    "bronze": "bronze scales with a green patina, a ribbed fin-like frill and backswept horns, webbed "
              "claws, sea spray around it",
    "copper": "copper scales with a turquoise patina, short horns, sharp plates on its brow and a "
              "mischievous grin",
    "gold": "gleaming gold scales, whisker-like tendrils along its jaw, a sail-like frill and a wise, "
            "regal bearing",
    "green": "emerald-green scales, a tall jagged crest running from its head down its spine, wisps of "
             "poison gas from its jaws",
    "red": "crimson scales, swept-back horns and a ridged crest, smoke and embers rising from its "
           "nostrils, an arrogant, fierce expression",
    "silver": "polished silver scales, a smooth frill from head to neck, a noble, calm expression, frost "
              "glittering in the air",
    "white": "white scales tinged with pale blue, a spiny crest, a small bestial head and frosty breath",
}
DRAGON_AGES = {
    "wyrmling": "a {colour} dragon wyrmling: a small, young dragon the size of a large dog, big eyes, stubby "
                "horns and oversized wings, perched on a rock, with {traits}",
    "young": "a young {colour} dragon: a dragon about the size of a horse, lean and agile, wings half "
             "spread, with {traits}",
    "adult": "an adult {colour} dragon: a huge, powerful dragon rearing on its hind legs, wings spread, "
             "with {traits}",
    "ancient": "an ancient {colour} dragon: a gargantuan, old and battle-scarred dragon with massive horns, "
               "majestic and terrifying, wings spread wide, with {traits}",
}

# The prompts name Dungeons & Dragons on purpose (the author's decision of 2026-11-11, ADR 030): the
# picture follows the creature's canonical D&D design, and the description pins its defining features.
PROMPT = """Create a square (1:1) illustration of the {name} from Dungeons & Dragons (5th edition, 2024 rules), faithful to its official D&D design: {description}.
Accuracy: keep every defining feature of the D&D {name}; no extra or missing heads, limbs, wings or tails, and nothing that is not part of this creature.

Style: hand-painted digital fantasy illustration for a Dungeons & Dragons bestiary, confident painterly brushwork, rich but slightly desaturated natural colours, soft dramatic light from the upper left, a clear readable silhouette, detailed but not cluttered. Not a photograph, not a 3D render, not anime, not a cartoon.
Framing: only the subject, whole body visible, centred and filling about 80% of the image, seen in three-quarter view with the head in the upper half. It must still read as a small thumbnail.
Background: plain warm parchment colour (about #F1E4CC) with a faint darker vignette at the edges and a soft shadow under the subject. No scenery, no frame, no border.
No text, letters, runes, numbers, labels, watermark or signature."""

# Tracker columns, left to right: (key, header, width). The CSV uses the keys; the Excel file the headers.
COLUMNS = [
    ("order", "#", 6), ("current", "Current image", 15), ("name_es", "Creature", 24),
    ("name_en", "Creature (EN)", 22), ("file", "File name to save", 28), ("status", "Status", 12),
    ("notes", "Notes", 28), ("prompt", "Prompt for ChatGPT", 90), ("score", "Fit (1-10)", 9),
    ("review", "Why this score", 34), ("path", "Save it at", 40), ("creature", "Creature id", 24),
    ("type", "Type", 12), ("cr", "CR", 6), ("current_kind", "Current picture", 18),
    ("current_source", "Current source", 28),
]
KEYS = [key for key, _, _ in COLUMNS]
EDITABLE = ("status", "notes")
STATUS_FILLS = {"generated": "FFE8A3", "imported": "C9E7C1", "keep": "CFE2F3", "rejected": "F4CCCC"}


def dragon_subject(creature_id: str) -> str | None:
    for age in DRAGON_AGES:
        for colour in DRAGON_COLOURS:
            if creature_id in (f"{age}-{colour}-dragon", f"{colour}-dragon-{age}"):
                return DRAGON_AGES[age].format(colour=colour, traits=DRAGON_COLOURS[colour])
    return None


def previous_edits() -> dict[str, dict]:
    """Status and notes of each row as the author left them: the Excel file is the one edited (its
    tracker sheet, or the older 'Catalogue' sheet), the CSV a copy."""
    found: list[dict] = []
    if XLSX_PATH.exists():
        from openpyxl import load_workbook

        book = load_workbook(XLSX_PATH, read_only=True)
        sheet = book["Tracker"] if "Tracker" in book.sheetnames else book["Catalogue"]
        rows = sheet.iter_rows(values_only=True)
        labels = {header: key for key, header, _ in COLUMNS}
        head = [labels.get(h, h) for h in next(rows)]
        found = [dict(zip(head, row)) for row in rows]
    elif CSV_PATH.exists():
        with CSV_PATH.open(encoding="utf-8") as f:
            found = list(csv.DictReader(f))
    return {
        row["creature"]: {
            "status": row.get("status") if row.get("status") in STATES else "pending",
            "notes": str(row.get("notes") or "").strip(),
        }
        for row in found if row.get("creature")
    }


def build_rows() -> list[dict]:
    review = json.loads(REVIEW.read_text(encoding="utf-8"))["creatures"]
    monsters = json.loads((CONTENT / "index.json").read_text(encoding="utf-8"))["monsters"]
    art = json.loads((CONTENT / "art.json").read_text(encoding="utf-8"))
    ids = {m["id"] for m in monsters}
    if set(review) != ids:
        raise SystemExit(f"review and bestiary differ: {sorted(set(review) ^ ids)}")
    before = previous_edits()
    rows = []
    for m in monsters:
        score, kind, note, subject = review[m["id"]]
        subject = subject or dragon_subject(m["id"])
        if not subject or ": " not in subject or kind not in KINDS or not 1 <= score <= 10:
            raise SystemExit(f"incomplete review: {m['id']}")
        description = subject.split(": ", 1)[1]
        file = f"{m['id']}.png"
        edits = before.get(m["id"], {"status": "pending", "notes": ""})
        status = edits["status"]
        if art[m["id"]].get("origin") == "generated":
            status = "imported"
        else:
            status = "pending" if status == "imported" else status
            if (SOURCE / file).exists() and status in ("pending", "rejected"):
                status = "generated"
        rows.append({
            "score": score, "creature": m["id"], "name_en": m["en"], "name_es": m["es"], "type": m["type"],
            "cr": m["cr"], "current_kind": KINDS[kind], "current_source": art[m["id"]]["title"],
            "review": note, "file": file, "path": f"art/bestiary/source/{file}", "status": status,
            "notes": edits["notes"], "prompt": PROMPT.format(name=m["en"], description=description),
        })
    rows.sort(key=lambda r: (r["score"], r["creature"]))
    for i, row in enumerate(rows, start=1):
        row["order"] = i
    return rows


def write_csv(rows: list[dict]) -> None:
    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        out = csv.writer(f, lineterminator="\n")
        out.writerow([key for key in KEYS if key != "current"])
        for row in rows:
            out.writerow([row[key] for key in KEYS if key != "current"])


def preview(creature_id: str, size: int) -> BytesIO:
    image = Image.open(THUMBS / f"{creature_id}.webp").convert("RGBA")
    plate = Image.new("RGBA", image.size, PARCHMENT + (255,))
    plate.alpha_composite(image)
    buffer = BytesIO()
    plate.convert("RGB").resize((size, size), Image.Resampling.LANCZOS).save(buffer, "JPEG", quality=88)
    buffer.seek(0)
    return buffer


def write_xlsx(rows: list[dict]) -> None:
    from openpyxl import Workbook
    from openpyxl.drawing.image import Image as XlImage
    from openpyxl.formatting.rule import FormulaRule
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.worksheet.datavalidation import DataValidation

    font = Font(name="Arial", size=10)
    strong = Font(name="Arial", size=10, bold=True)
    bold = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    head = PatternFill("solid", fgColor="5B3A21")
    edit = PatternFill("solid", fgColor="FFF2CC")
    line = Border(bottom=Side(style="thin", color="D9CBB3"))
    wb = Workbook()

    # Tracker: one row per creature, worst fit first.
    sheet = wb.active
    sheet.title = "Tracker"
    col = {key: sheet.cell(row=1, column=c).column_letter for c, key in enumerate(KEYS, start=1)}
    for c, (key, header, width) in enumerate(COLUMNS, start=1):
        cell = sheet.cell(row=1, column=c, value=header)
        cell.font, cell.fill = bold, head
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        sheet.column_dimensions[col[key]].width = width
    sheet.row_dimensions[1].height = 30
    wrapped = ("prompt", "review", "notes", "current_source", "current_kind", "name_es", "name_en", "file")
    for i, row in enumerate(rows, start=2):
        for c, key in enumerate(KEYS, start=1):
            cell = sheet.cell(row=i, column=c, value=None if key == "current" else row[key])
            cell.font = Font(name="Arial", size=9) if key in ("prompt", "review") else (
                strong if key in ("name_es", "file") else font)
            cell.border = line
            cell.alignment = Alignment(wrap_text=key in wrapped, vertical="top",
                                       horizontal="center" if key in ("order", "score", "cr") else None)
        picture = XlImage(preview(row["creature"], 96))
        picture.width = picture.height = 96
        sheet.add_image(picture, f"{col['current']}{i}")
        for key in EDITABLE:
            sheet[f"{col[key]}{i}"].fill = edit
        band = "F4CCCC" if row["score"] <= 3 else "FCE5CD" if row["score"] <= 6 else "D9EAD3"
        sheet[f"{col['score']}{i}"].fill = PatternFill("solid", fgColor=band)
        sheet.row_dimensions[i].height = 78
    last = len(rows) + 1
    end = col[KEYS[-1]]
    sheet.freeze_panes = f"{col['name_en']}2"
    sheet.auto_filter.ref = f"A1:{end}{last}"
    check = DataValidation(type="list", formula1=f'"{",".join(STATES)}"', allow_blank=False,
                           promptTitle="Status", prompt="pending, then generated (saved), then imported. "
                           "keep: keep the current picture. rejected: try again later.")
    sheet.add_data_validation(check)
    check.add(f"{col['status']}2:{col['status']}{last}")
    # The whole row takes the colour of its status, so progress shows while scrolling.
    for state, colour in STATUS_FILLS.items():
        sheet.conditional_formatting.add(f"A2:{end}{last}", FormulaRule(
            formula=[f'${col["status"]}2="{state}"'],
            fill=PatternFill("solid", fgColor=colour, bgColor=colour)))

    # Progress: counts that follow the Status column.
    progress = wb.create_sheet("Progress")

    def ref(key: str) -> str:
        return f"Tracker!${col[key]}$2:${col[key]}${last}"

    progress["A1"] = "Bestiary art progress"
    progress["A1"].font = Font(name="Arial", size=14, bold=True)
    for c, name in enumerate(["status", "creatures", "share"], start=1):
        cell = progress.cell(row=3, column=c, value=name)
        cell.font, cell.fill = bold, head
    labels = {"pending": "pending (still to paint)", "generated": "generated (saved, waiting for import)",
              "imported": "imported (in the bestiary)", "keep": "keep (current picture stays)",
              "rejected": "rejected (try again)"}
    for r, state in enumerate(STATES, start=4):
        progress.cell(row=r, column=1, value=labels[state]).font = font
        progress.cell(row=r, column=2, value=f'=COUNTIF({ref("status")},"{state}")').font = font
        share = progress.cell(row=r, column=3, value=f"=IF($B$9=0,0,B{r}/$B$9)")
        share.font, share.number_format = font, "0%"
        if state in STATUS_FILLS:
            progress.cell(row=r, column=1).fill = PatternFill("solid", fgColor=STATUS_FILLS[state])
    progress["A9"], progress["B9"] = "total", "=SUM(B4:B8)"
    progress["A10"], progress["B10"] = "finished (imported or keep)", "=B6+B7"
    progress["C10"] = "=IF($B$9=0,0,B10/$B$9)"
    for name in ("A9", "B9", "A10", "B10", "C10"):
        progress[name].font = strong
    progress["C10"].number_format = "0%"

    for c, name in enumerate(["fit (1-10)", "creatures", *STATES], start=1):
        cell = progress.cell(row=12, column=c, value=name)
        cell.font, cell.fill = bold, head
    for r, score in enumerate(range(1, 11), start=13):
        progress.cell(row=r, column=1, value=score).font = font
        progress.cell(row=r, column=2, value=f"=COUNTIF({ref('score')},A{r})").font = font
        for c, state in enumerate(STATES, start=3):
            progress.cell(row=r, column=c, value=(
                f'=COUNTIFS({ref("score")},$A{r},{ref("status")},"{state}")')).font = font
    progress.cell(row=23, column=1, value="total").font = strong
    for c in range(2, 3 + len(STATES)):
        letter = progress.cell(row=12, column=c).column_letter
        progress.cell(row=23, column=c, value=f"=SUM({letter}13:{letter}22)").font = strong

    for c, name in enumerate(["current picture", "creatures", "average fit"], start=1):
        cell = progress.cell(row=25, column=c, value=name)
        cell.font, cell.fill = bold, head
    for r, kind in enumerate(KINDS.values(), start=26):
        progress.cell(row=r, column=1, value=kind).font = font
        progress.cell(row=r, column=2, value=f"=COUNTIF({ref('current_kind')},A{r})").font = font
        progress.cell(row=r, column=3, value=(
            f"=ROUND(AVERAGEIF({ref('current_kind')},A{r},{ref('score')}),1)")).font = font
    progress["A31"] = "Every count follows the Status, Fit and Current picture columns of the Tracker sheet."
    progress["A31"].font = Font(name="Arial", size=9, italic=True)
    for letter, width in zip("ABCDEFG", (38, 11, 10, 11, 10, 9, 10)):
        progress.column_dimensions[letter].width = width

    # How to use.
    guide = wb.create_sheet("How to use")
    lines = [
        ("Rytta bestiary art tracker (RYT-067)", True),
        ("One row per SRD creature, from the worst-fitting current picture (1) to the best (10). Edit only "
         "the yellow cells: Status and Notes. Rows take the colour of their status; the Progress sheet counts "
         "them.", False),
        ("1. Copy the row's 'Prompt for ChatGPT' cell into ChatGPT. All prompts share one style, palette and "
         "parchment background, so the bestiary matches.", False),
        ("2. Start with a pilot of three (owlbear, goblin warrior, adult red dragon). Once the style is right, "
         "start each new conversation by attaching one accepted picture and adding: 'Match the style, palette, "
         "lighting and background of the attached picture exactly.'", False),
        ("3. Check the result: one creature (or one swarm), whole body, square, parchment background, no text "
         "or watermark, still readable when shrunk to a fingertip.", False),
        ("4. Download it with ChatGPT's download button (not a screenshot) and save it in the repository folder "
         "art/bestiary/source/ with exactly the name in 'File name to save' (the creature id + .png).", False),
        ("5. Set Status to 'generated'. When you have a batch, close this file and run "
         "'python3 -I scripts/bestiary/import_art.py': each imported row turns 'imported'.", False),
        ("Other states: 'keep' keeps the current picture (a good portrait you prefer); 'rejected' means "
         "ChatGPT could not get it right yet. Status and notes are kept when the tracker is regenerated.", False),
        ("Corrections to send in the same conversation: 'Show the whole creature, centred, smaller in the "
         "frame.' / 'Remove the scenery: plain parchment background only.' / 'Remove the text.' / 'Make it look "
         "like a painted illustration, not a photo or a 3D render.'", False),
        ("Rules: the prompts name Dungeons & Dragons on purpose, so each creature follows its official design "
         "(the author's decision, 2026-11-11). Never add an artist's name, never ask for the art style of an "
         "official book, and never upload official or other third-party art as a reference; only pictures made "
         "for Rytta.", False),
    ]
    for r, (text, title) in enumerate(lines, start=1):
        cell = guide.cell(row=r, column=1, value=text)
        cell.font = Font(name="Arial", size=14 if title else 10, bold=title)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    guide.column_dimensions["A"].width = 120

    wb.calculation.fullCalcOnLoad = True
    wb.active = 0
    try:
        wb.save(XLSX_PATH)
    except PermissionError:
        raise SystemExit(f"{XLSX_PATH.relative_to(ROOT)} is open in Excel: close it and run this again")


def main() -> None:
    rows = build_rows()
    SOURCE.mkdir(parents=True, exist_ok=True)
    write_csv(rows)
    write_xlsx(rows)
    by: dict[int, int] = {}
    for row in rows:
        by[row["score"]] = by.get(row["score"], 0) + 1
    print(f"{len(rows)} rows, by score {dict(sorted(by.items()))} -> {CSV_PATH.relative_to(ROOT)}, "
          f"{XLSX_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
