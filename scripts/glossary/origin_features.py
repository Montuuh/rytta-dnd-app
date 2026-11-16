"""SRD 5.2.1 species traits and feats → glossary `feature` entries (RYT-102).

Usage (manual, like class_features.py; PDFs are never committed):
  python3 -I scripts/glossary/origin_features.py <pdf-dir> src/features/glossary/content [--report]

Reads the "Character Species" and "Feats" sections of the English and official Spanish SRD 5.2.1
(Wizards of the Coast LLC, CC-BY-4.0). Every species trait (a bold-italic lead inside a species)
becomes `feature.species-<species>-<trait>` and every feat becomes `feature.feat-<feat>`; English
and Spanish are paired through reviewed name tables because each language orders them
differently. They carry no class (`fc`), so the class feature library and progression ignore
them; the character sheet links seeded species traits and feats to them. Previous origin
entries are replaced, the rest of the glossary is untouched. Run it after class_features.py.
"""

from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))

from blocks import build_blocks, heading_text  # noqa: E402
from build_content import first_sentence, slug, tidy_blocks  # noqa: E402
from srd_pdf import Line, read_pages  # noqa: E402

PAGES = {
    "en": ("SRD_CC_v5.2.1.pdf", (84, 86), (87, 88)),
    "es": ("SP_SRD_CC_v5.2.1.pdf", (90, 93), (94, 96)),
}
SPECIES = {
    "dragonborn": ("Dragonborn", "Dracónido", "dracónido"),
    "dwarf": ("Dwarf", "Enano", "enano"),
    "elf": ("Elf", "Elfo", "elfo"),
    "gnome": ("Gnome", "Gnomo", "gnomo"),
    "goliath": ("Goliath", "Goliat", "goliat"),
    "halfling": ("Halfling", "Mediano", "mediano"),
    "human": ("Human", "Humano", "humano"),
    "orc": ("Orc", "Orco", "orco"),
    "tiefling": ("Tiefling", "Tiefling", "tiefling"),
}
# Reviewed EN → ES trait names (official Spanish SRD 5.2.1 headings).
TRAIT_PAIRS = {
    "Draconic Ancestry": "Linaje dracónico", "Breath Weapon": "Ataque de aliento",
    "Damage Resistance": "Resistencia al daño", "Darkvision": "Visión en la oscuridad",
    "Draconic Flight": "Vuelo dracónico", "Dwarven Resilience": "Resistencia enana",
    "Dwarven Toughness": "Aguante enano", "Stonecunning": "Afinidad con la piedra",
    "Elven Lineage": "Linaje élfico", "Fey Ancestry": "Linaje feérico", "Keen Senses": "Sentidos agudos",
    "Trance": "Trance", "Gnomish Cunning": "Astucia gnoma", "Gnomish Lineage": "Linaje gnomo",
    "Giant Ancestry": "Linaje gigante", "Large Form": "Forma grande",
    "Powerful Build": "Constitución poderosa", "Brave": "Valiente",
    "Halfling Nimbleness": "Agilidad de mediano", "Luck": "Fortuna",
    "Naturally Stealthy": "Sigiloso por naturaleza", "Resourceful": "Ingenioso", "Skillful": "Diestro",
    "Versatile": "Versátil", "Adrenaline Rush": "Descarga de adrenalina",
    "Relentless Endurance": "Aguante incansable", "Fiendish Legacy": "Legado infernal",
    "Otherworldly Presence": "Presencia sobrenatural",
}
# Traits several species share keep one entry each, named with the species.
SHARED = {"Darkvision"}
FEAT_PAIRS = {
    "Alert": "Alerta", "Magic Initiate": "Iniciado en la magia", "Savage Attacker": "Atacante salvaje",
    "Skilled": "Habilidoso", "Ability Score Improvement": "Mejora de característica",
    "Grappler": "Apresador", "Archery": "Tiro con arco", "Defense": "Defensa",
    "Great Weapon Fighting": "Combate con armas a dos manos", "Two-Weapon Fighting": "Combate con dos armas",
    "Boon of Combat Prowess": "Don de la pericia en combate",
    "Boon of Dimensional Travel": "Don del viaje dimensional", "Boon of Fate": "Don del destino",
    "Boon of Irresistible Offense": "Don del ataque imparable",
    "Boon of Spell Recall": "Don del recuerdo de conjuros",
    "Boon of the Night Spirit": "Don del espíritu de la noche", "Boon of Truesight": "Don de la visión verdadera",
}
# Full-width tables the two-column reader splits; reviewed from the PDFs.
TABLES = {
    ("feature.species-dragonborn-draconic-ancestry", "en"): {
        "t": "table", "caption": "Draconic Ancestors", "head": ["Dragon", "Damage Type", "Dragon", "Damage Type"],
        "rows": [["Black", "Acid", "Gold", "Fire"], ["Blue", "Lightning", "Green", "Poison"],
                 ["Brass", "Fire", "Red", "Fire"], ["Bronze", "Lightning", "Silver", "Cold"],
                 ["Copper", "Acid", "White", "Cold"]]},
    ("feature.species-dragonborn-draconic-ancestry", "es"): {
        "t": "table", "caption": "Ancestros dracónicos", "head": ["Dragón", "Tipo de daño", "Dragón", "Tipo de daño"],
        "rows": [["Azul", "Relámpago", "Oro", "Fuego"], ["Blanco", "Frío", "Oropel", "Fuego"],
                 ["Bronce", "Relámpago", "Plata", "Frío"], ["Cobre", "Ácido", "Rojo", "Fuego"],
                 ["Negro", "Ácido", "Verde", "Veneno"]]},
    ("feature.species-elf-elven-lineage", "en"): {
        "t": "table", "caption": "Elven Lineages", "head": ["Lineage", "Level 1", "Level 3", "Level 5"],
        "rows": [
            ["Drow", "The range of your Darkvision increases to 120 feet. You also know the Dancing Lights "
                     "cantrip.", "Faerie Fire", "Darkness"],
            ["High Elf", "You know the Prestidigitation cantrip. Whenever you finish a Long Rest, you can "
                         "replace that cantrip with a different cantrip from the Wizard spell list.",
             "Detect Magic", "Misty Step"],
            ["Wood Elf", "Your Speed increases to 35 feet. You also know the Druidcraft cantrip.",
             "Longstrider", "Pass without Trace"]]},
    ("feature.species-elf-elven-lineage", "es"): {
        "t": "table", "caption": "Linajes élficos", "head": ["Linaje", "Nivel 1", "Nivel 3", "Nivel 5"],
        "rows": [
            ["Alto elfo", "Conoces el truco prestidigitación. Tras finalizar un descanso largo, puedes "
                          "sustituir ese truco por otro truco diferente de la lista de conjuros de mago.",
             "Detectar magia", "Paso brumoso"],
            ["Drow", "El alcance de tu visión en la oscuridad aumenta a 36 m. También conoces el truco luces "
                     "danzantes.", "Fuego feérico", "Oscuridad"],
            ["Elfo de los bosques", "Tu velocidad aumenta a 10,5 m. También conoces el truco saber druídico.",
             "Zancada prodigiosa", "Pasar sin rastro"]]},
    ("feature.species-tiefling-fiendish-legacy", "en"): {
        "t": "table", "caption": "Fiendish Legacies", "head": ["Legacy", "Level 1", "Level 3", "Level 5"],
        "rows": [
            ["Abyssal", "You have Resistance to Poison damage. You also know the Poison Spray cantrip.",
             "Ray of Sickness", "Hold Person"],
            ["Chthonic", "You have Resistance to Necrotic damage. You also know the Chill Touch cantrip.",
             "False Life", "Ray of Enfeeblement"],
            ["Infernal", "You have Resistance to Fire damage. You also know the Fire Bolt cantrip.",
             "Hellish Rebuke", "Darkness"]]},
    ("feature.species-tiefling-fiendish-legacy", "es"): {
        "t": "table", "caption": "Legados infernales", "head": ["Legado", "Nivel 1", "Nivel 3", "Nivel 5"],
        "rows": [
            ["Abisal", "Tienes resistencia al daño de veneno. También conoces el truco rociada venenosa.",
             "Rayo nauseabundo", "Inmovilizar persona"],
            ["Ctónico", "Tienes resistencia al daño necrótico. También conoces el truco toque helado.",
             "Falsa vida", "Rayo debilitador"],
            ["Infernal", "Tienes resistencia al daño de fuego. También conoces el truco descarga de fuego.",
             "Reprensión infernal", "Oscuridad"]]},
}
# The table goes after the paragraph that introduces it.
TABLE_AFTER = {"en": ("Draconic Ancestors", "Elven Lineages", "Fiendish Legacies"),
               "es": ("Ancestros dracónicos", "Linajes élficos", "Legados infernales")}


def first_run(line: Line):
    for run in line.runs:
        if run.text.strip():
            return run
    return None


def starts_trait(line: Line) -> bool:
    run = first_run(line)
    return run is not None and run.style == "bi"


def lead_name(line: Line) -> str:
    run = first_run(line)
    return re.sub(r"\s+", " ", run.text).strip().rstrip(".")


def join_bold_leads(lines: list[Line]) -> list[Line]:
    """A bold option name wrapped onto a second bold line ("…de las tormen-" / "tas).") is one lead."""
    out: list[Line] = []
    for line in lines:
        prev = out[-1] if out else None
        run = first_run(line)
        if (prev and run and run.style == "b" and prev.runs and prev.main_style == "b"
                and prev.text.endswith("-") and line.runs[0].text[:1].islower()):
            prev.runs[-1].text = prev.runs[-1].text.rstrip()[:-1] + line.runs[0].text
            prev.runs.extend(line.runs[1:])
            continue
        out.append(line)
    return out


# Letter-spacing artefacts of the Spanish PDF ("a umenta"), reviewed against the printed page.
SPACING = (("a umenta", "aumenta"), ("c ompetencia", "competencia"), ("a ptitud", "aptitud"),
           ("a tributo", "atributo"))


def blocks_of(lines: list[Line]) -> list[dict]:
    # Tables inside species are full-width and split by the reader: drop their lines (the
    # reviewed table is inserted instead) so the paragraph around them stays whole.
    body = [ln for ln in join_bold_leads(lines) if ln.main_style not in ("g", "hs")]
    out: list[dict] = []
    for block in tidy_blocks(build_blocks(body)):
        if block["t"] == "p":
            for wrong, right in SPACING:
                block["x"] = block["x"].replace(wrong, right)
        prev = out[-1] if out else None
        # An option name alone on its line ("Frío de la escarcha (…).") keeps its text below.
        if prev and prev["t"] == "p" and prev.get("lead") and not prev["x"] and block["t"] == "p" \
                and not block.get("lead"):
            prev["x"] = block["x"]
            continue
        out.append(block)
    return out


def segment_species(lang: str, pdf_dir: str) -> list[dict]:
    name, pages, _ = PAGES[lang]
    lines = read_pages(os.path.join(pdf_dir, name), *pages)
    index = 0 if lang == "en" else 1
    by_name = {names[index]: key for key, names in SPECIES.items()}
    traits: list[dict] = []
    species: str | None = None
    current: dict | None = None
    started = False
    for line in lines:
        style = line.runs[0].style if line.runs else "r"
        if style in ("h1", "h2"):
            if style == "h2" and heading_text(line).startswith(("Species Descriptions", "Descripciones de las")):
                started = True
            continue
        if not started:
            continue
        if style == "h3" and line.main_style == "h3":
            current = None
            species = by_name.get(heading_text(line))
            if species is None:
                raise SystemExit(f"{lang}: unknown species heading {heading_text(line)!r}")
            continue
        if species is None:
            continue
        if starts_trait(line):
            current = {"species": species, "name": lead_name(line), "page": line.page, "lines": []}
            traits.append(current)
        if current is not None:
            current["lines"].append(line)
    for trait in traits:
        blocks = blocks_of(trait.pop("lines"))
        # The trait name is the entry title; its lead-in is not repeated in the text.
        if blocks and blocks[0].get("lead"):
            blocks[0] = {"t": "p", "x": blocks[0]["x"]}
        trait["blocks"] = blocks
    return traits


def segment_feats(lang: str, pdf_dir: str) -> list[dict]:
    name, _, pages = PAGES[lang]
    lines = read_pages(os.path.join(pdf_dir, name), *pages)
    feats: list[dict] = []
    current: dict | None = None
    started = False
    for line in lines:
        style = line.runs[0].style if line.runs else "r"
        if style == "h1":
            if current is not None:
                break  # the next chapter (Equipment)
            continue
        if style == "h2":
            started = started or heading_text(line) in ("Origin Feats", "Dotes de origen")
            current = None
            continue
        if not started:
            continue
        if style == "h3" and line.main_style == "h3":
            current = {"name": heading_text(line), "page": line.page, "category": [], "lines": []}
            feats.append(current)
            continue
        if current is None:
            continue
        if not current["lines"] and line.main_style == "i":
            current["category"].append(line.text)
            continue
        current["lines"].append(line)
    for feat in feats:
        category = re.sub(r"\s+", " ", " ".join(feat.pop("category"))).strip()
        blocks = blocks_of(feat.pop("lines"))
        feat["blocks"] = ([{"t": "p", "x": f"*{category}*"}] if category else []) + blocks
    return feats


def with_table(entry_id: str, lang: str, blocks: list[dict]) -> list[dict]:
    table = TABLES.get((entry_id, lang))
    if not table:
        return blocks
    out, placed = [], False
    for block in blocks:
        out.append(block)
        if not placed and block["t"] == "p" and any(name in block["x"] for name in TABLE_AFTER[lang]):
            out.append(table)
            placed = True
    if not placed:
        raise SystemExit(f"{entry_id} {lang}: no paragraph introduces the table")
    return out


def pair(rows_en: list[dict], rows_es: list[dict], names: dict, key) -> list[tuple[dict, dict]]:
    spanish = {key(row, row["name"]): row for row in rows_es}
    pairs = []
    for row in rows_en:
        if row["name"] not in names:
            raise SystemExit(f"No reviewed Spanish name for {row['name']!r}")
        match = spanish.pop(key(row, names[row["name"]]), None)
        if match is None:
            raise SystemExit(f"Unpaired {key(row, row['name'])}: expected {names[row['name']]!r}")
        pairs.append((row, match))
    if spanish:
        raise SystemExit(f"Spanish entries without English pair: {sorted(spanish)}")
    return pairs


def main(pdf_dir: str, content: str, report: bool) -> None:
    traits = pair(segment_species("en", pdf_dir), segment_species("es", pdf_dir), TRAIT_PAIRS,
                  lambda row, name: (row.get("species"), name))
    feats = pair(segment_feats("en", pdf_dir), segment_feats("es", pdf_dir), FEAT_PAIRS,
                 lambda row, name: name)
    origin = lambda entry_id: entry_id.startswith(("feature.species-", "feature.feat-"))  # noqa: E731
    with open(os.path.join(content, "index.json"), encoding="utf-8") as fh:
        index = [row for row in json.load(fh) if not origin(row["id"])]
    bodies = {}
    for lang in ("en", "es"):
        with open(os.path.join(content, f"{lang}.json"), encoding="utf-8") as fh:
            bodies[lang] = {k: v for k, v in json.load(fh).items() if not origin(k)}
    entries = []
    for a, b in traits:
        entry_id = f"feature.species-{a['species']}-{slug(a['name'])}"
        names = SPECIES[a["species"]]
        en_name, es_name = a["name"], b["name"]
        if a["name"] in SHARED:
            en_name, es_name = f"{en_name} ({names[0]})", f"{es_name} ({names[2]})"
        entries.append((entry_id, en_name, es_name, a, b))
    for a, b in feats:
        entries.append((f"feature.feat-{slug(a['name'])}", a["name"], b["name"], a, b))
    seen: set[str] = set()
    for entry_id, en_name, es_name, a, b in entries:
        if entry_id in seen:
            raise SystemExit(f"duplicate origin id {entry_id}")
        seen.add(entry_id)
        if report:
            print(f"{entry_id:<55} {en_name:<32} {es_name}")
        index.append({"id": entry_id, "cat": "feature", "en": en_name, "es": es_name, "nl": 1})
        for lang, item in (("en", a), ("es", b)):
            blocks = with_table(entry_id, lang, item["blocks"])
            summary = first_sentence([x for x in blocks if not x.get("x", "").startswith("*")]) \
                or first_sentence(blocks) or item["name"]
            bodies[lang][entry_id] = {"page": item["page"], "summary": summary, "blocks": blocks}
    index.sort(key=lambda i: i["id"])
    with open(os.path.join(content, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    for lang in ("en", "es"):
        ordered = {k: bodies[lang][k] for k in sorted(bodies[lang])}
        with open(os.path.join(content, f"{lang}.json"), "w", encoding="utf-8") as fh:
            json.dump(ordered, fh, ensure_ascii=False, separators=(",", ":"))
            fh.write("\n")
    print("traits", len(traits), "feats", len(feats), "entries", len(index))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], "--report" in sys.argv[3:])
