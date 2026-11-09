"""SRD 5.2.1 class and subclass features → glossary `feature` entries (RYT-071).

Usage (manual, like extract_srd.py; PDFs are never committed):
  python3 -I scripts/glossary/class_features.py <pdf-dir> src/features/glossary/content [--report]

Reads the class chapters of the English and official Spanish SRD 5.2.1 (Wizards of the Coast
LLC, CC-BY-4.0), splits every "Level N: Feature" heading of each class and of its SRD subclass,
pairs English and Spanish features by class, level and order, and merges them into
index.json / en.json / es.json as category `feature` (previous feature entries are replaced, the
rest of the glossary is untouched). Spell lists inside the class chapters are skipped: spells
are already glossary entries.
"""

from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))

from blocks import build_blocks, heading_text  # noqa: E402
from build_content import first_sentence, fix_case, slug, tidy_blocks  # noqa: E402
from srd_pdf import read_pages  # noqa: E402

PAGES = {"en": ("SRD_CC_v5.2.1.pdf", 28, 82), "es": ("SP_SRD_CC_v5.2.1.pdf", 32, 88)}
CLASS_NAMES = {
    "barbarian": ("Barbarian", "Bárbaro"), "bard": ("Bard", "Bardo"), "cleric": ("Cleric", "Clérigo"),
    "druid": ("Druid", "Druida"), "fighter": ("Fighter", "Guerrero"), "monk": ("Monk", "Monje"),
    "paladin": ("Paladin", "Paladín"), "ranger": ("Ranger", "Explorador"), "rogue": ("Rogue", "Pícaro"),
    "sorcerer": ("Sorcerer", "Hechicero"), "warlock": ("Warlock", "Brujo"), "wizard": ("Wizard", "Mago"),
}
SUBCLASSES = {
    "barbarian": "berserker", "bard": "lore", "cleric": "life", "druid": "land", "fighter": "champion",
    "monk": "open-hand", "paladin": "devotion", "ranger": "hunter", "rogue": "thief",
    "sorcerer": "draconic", "warlock": "fiend", "wizard": "evoker",
}
LEVEL = {"en": re.compile(r"^Level (\d+):\s*(.+)$"), "es": re.compile(r"^Nivel (\d+):\s*(.+)$")}
SPELL_LIST = {"en": "Spell List", "es": "Lista de conjuros"}
SUBCLASS = {"en": "Subclass:", "es": "Subclase de"}


def class_of(title: str, lang: str) -> str | None:
    index = 0 if lang == "en" else 1
    for key, names in CLASS_NAMES.items():
        if title.strip() == names[index]:
            return key
    return None


LEVEL_TABLE = re.compile(r"Features|Rasgos de|Spell Slots|Espacios de conjuro|nivel de conjuro")


def clean_tables(blocks: list[dict]) -> list[dict]:
    """Drop the full-width class progression tables and sidebars that the two-column reader
    splits into fragments (the text points to the class table instead), and rejoin table
    headers typeset on two lines."""
    out = []
    for block in blocks:
        if block["t"] != "table":
            out.append(block)
            continue
        rows = block["rows"]
        label = " ".join(block.get("head", []) + [block.get("caption", "")])
        first = rows[0][0] if rows and rows[0] else ""
        prose = len(rows) >= 5 and all(len(r) == 1 for r in rows)
        if len(rows) >= 17 or prose or LEVEL_TABLE.search(label) or re.search(r"[a-z][A-Z]", first):
            continue
        head = block.get("head")
        if head and rows and len(rows[0]) == len(head) and not any(re.search(r"\d", c) for c in rows[0]):
            block = {**block, "head": [f"{a} {b}".strip() for a, b in zip(head, rows[0])], "rows": rows[1:]}
        out.append(block)
    return out


def segment(lang: str, pdf_dir: str) -> list[dict]:
    name, first, last = PAGES[lang]
    lines = read_pages(os.path.join(pdf_dir, name), first, last)
    features: list[dict] = []
    klass: str | None = None
    sub = False
    skipping = False
    current: dict | None = None
    pending_heading: dict | None = None

    def close():
        nonlocal current
        if current:
            features.append(current)
        current = None

    for line in lines:
        style = line.runs[0].style if line.runs else "r"
        text = heading_text(line)
        if style == "h1" and line.main_style == "h1":
            key = class_of(text, lang)
            if key:
                close()
                klass, sub, skipping = key, False, False
            continue
        if klass is None:
            continue
        if style == "h2" and line.main_style == "h2":
            close()
            if SPELL_LIST[lang] in text:
                skipping = True
            elif SUBCLASS[lang] in text:
                skipping, sub = False, True
            else:
                skipping = False
            continue
        if skipping:
            continue
        if style == "h3" and line.main_style in ("h3", "g", "hs"):
            match = LEVEL[lang].match(text)
            if match:
                close()
                current = {"class": klass, "sub": SUBCLASSES[klass] if sub else None,
                           "level": int(match.group(1)), "name": match.group(2).strip(),
                           "page": line.page, "lines": []}
                pending_heading = current
                continue
            if current is not None and pending_heading is current and not current["lines"]:
                # A wrapped feature heading continues on the next heading line.
                current["name"] += " " + text
                continue
            if current is not None:
                # In-feature sub-heading (e.g. "Cantrips", "Spell Slots"): keep it as a lead.
                current["lines"].append(line)
            continue
        if current is not None:
            pending_heading = None
            current["lines"].append(line)
    close()
    for feature in features:
        feature["blocks"] = clean_tables(tidy_blocks(build_blocks(feature.pop("lines"))))
        name = re.sub(r"\s+", " ", feature["name"]).strip()
        feature["name"] = fix_case(name) if lang == "en" else name
    return [f for f in features if f["blocks"]]


# Reviewed EN → ES names for levels with several features: each language orders them
# alphabetically, so position alone cannot pair them. Single-feature levels pair directly.
FEATURE_PAIRS = {
    "Rage": "Furia", "Unarmored Defense": "Defensa sin armadura", "Weapon Mastery": "Maestría con armas",
    "Danger Sense": "Sentir el peligro", "Reckless Attack": "Ataque temerario",
    "Barbarian Subclass": "Subclase de bárbaro", "Primal Knowledge": "Conocimiento primigenio",
    "Extra Attack": "Ataque adicional", "Fast Movement": "Movimiento rápido",
    "Feral Instinct": "Instinto salvaje", "Instinctive Pounce": "Salto instintivo",
    "Bardic Inspiration": "Inspiración bárdica", "Spellcasting": "Lanzamiento de conjuros",
    "Expertise": "Pericia", "Jack of All Trades": "Aprendiz de mucho",
    "Bonus Proficiencies": "Competencias adicionales", "Cutting Words": "Palabras cortantes",
    "Divine Order": "Orden divina", "Disciple of Life": "Discípulo de la vida",
    "Life Domain Spells": "Conjuros del dominio de la vida", "Preserve Life": "Preservar vida",
    "Druidic": "Druídico", "Primal Order": "Orden primigenia", "Wild Shape": "Forma salvaje",
    "Wild Companion": "Compañero salvaje", "Circle of the Land Spells": "Conjuros del círculo de la tierra",
    "Land’s Aid": "Ayuda de la tierra", "Fighting Style": "Estilo de combate", "Second Wind": "Tomar aliento",
    "Action Surge": "Acción súbita", "Tactical Mind": "Mente táctica", "Tactical Shift": "Desplazamiento táctico",
    "Indomitable": "Indómito", "Tactical Master": "Maestro táctico", "Improved Critical": "Crítico mejorado",
    "Remarkable Athlete": "Atleta sobresaliente", "Martial Arts": "Artes marciales",
    "Monk’s Focus": "Concentración de monje", "Unarmored Movement": "Movimiento sin armadura",
    "Uncanny Metabolism": "Metabolismo asombroso", "Deflect Attacks": "Desviar ataques",
    "Monk Subclass": "Subclase de monje", "Ability Score Improvement": "Mejora de característica",
    "Slow Fall": "Caída lenta", "Stunning Strike": "Golpe aturdidor",
    "Heightened Focus": "Concentración agudizada", "Self-Restoration": "Autorrestablecimiento",
    "Lay on Hands": "Imponer las manos", "Paladin’s Smite": "Castigo de paladín",
    "Channel Divinity": "Canalizar divinidad", "Paladin Subclass": "Subclase de paladín",
    "Faithful Steed": "Corcel fiel", "Oath of Devotion Spells": "Conjuros del juramento de entrega",
    "Sacred Weapon": "Arma sagrada", "Favored Enemy": "Enemigo predilecto", "Deft Explorer": "Explorador hábil",
    "Hunter’s Lore": "Sabiduría del cazador", "Hunter’s Prey": "El cazador y la presa",
    "Sneak Attack": "Ataque furtivo", "Thieves’ Cant": "Jerga de ladrones", "Rogue Subclass": "Subclase de pícaro",
    "Steady Aim": "Puntería certera", "Cunning Strike": "Golpe astuto", "Uncanny Dodge": "Esquiva asombrosa",
    "Evasion": "Evasión", "Reliable Talent": "Talentos fiables", "Fast Hands": "Manos rápidas",
    "Second-Story Work": "Balconero", "Innate Sorcery": "Hechicería innata", "Font of Magic": "Fuente de magia",
    "Metamagic": "Metamagia", "Draconic Resilience": "Resistencia dracónica",
    "Draconic Spells": "Conjuros dracónicos", "Eldritch Invocations": "Invocaciones sobrenaturales",
    "Pact Magic": "Magia del pacto", "Dark One’s Blessing": "Bendición del oscuro",
    "Fiend Spells": "Conjuros del infernal", "Ritual Adept": "Adepto en rituales",
    "Arcane Recovery": "Recuperación arcana", "Evocation Savant": "Experto en evocación",
    "Potent Cantrip": "Truco potente",
}


def pair(en: list[dict], es: list[dict]) -> list[tuple[dict, dict]]:
    pairs = []
    groups: dict = {}
    for lang, rows in (("en", en), ("es", es)):
        for row in rows:
            groups.setdefault((row["class"], row["sub"], row["level"]), {"en": [], "es": []})[lang].append(row)
    for key, group in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1] or "", kv[0][2])):
        if len(group["en"]) != len(group["es"]):
            raise SystemExit(f"Feature count mismatch {key}: "
                             f"{[r['name'] for r in group['en']]} vs {[r['name'] for r in group['es']]}")
        if len(group["en"]) == 1:
            pairs.append((group["en"][0], group["es"][0]))
            continue
        spanish = {row["name"]: row for row in group["es"]}
        for row in group["en"]:
            match = spanish.pop(FEATURE_PAIRS.get(row["name"], ""), None)
            if match is None:
                raise SystemExit(f"Unpaired feature {key}: {row['name']}")
            pairs.append((row, match))
    return pairs


# Reviewed tables that the two-column reader cannot rebuild (multi-line headers, several
# tables in one box). Spell lists are written once in English and named in Spanish from the
# glossary's own spell pairs, so both languages always list the same spells.
SPELL_TABLES = {
    "feature.cleric-life-life-domain-spells": ("cleric", [
        ("Life Domain Spells", "Conjuros del dominio de la vida", [
            (3, "Aid, Bless, Cure Wounds, Lesser Restoration"), (5, "Mass Healing Word, Revivify"),
            (7, "Aura of Life, Death Ward"), (9, "Greater Restoration, Mass Cure Wounds")])]),
    "feature.druid-land-circle-of-the-land-spells": ("druid", [
        ("Arid Land", "Terreno árido", [(3, "Blur, Burning Hands, Fire Bolt"), (5, "Fireball"),
                                         (7, "Blight"), (9, "Wall of Stone")]),
        ("Polar Land", "Terreno polar", [(3, "Fog Cloud, Hold Person, Ray of Frost"), (5, "Sleet Storm"),
                                          (7, "Ice Storm"), (9, "Cone of Cold")]),
        ("Temperate Land", "Terreno templado", [(3, "Misty Step, Shocking Grasp, Sleep"),
                                                 (5, "Lightning Bolt"), (7, "Freedom of Movement"),
                                                 (9, "Tree Stride")]),
        ("Tropical Land", "Terreno tropical", [(3, "Acid Splash, Ray of Sickness, Web"),
                                                (5, "Stinking Cloud"), (7, "Polymorph"),
                                                (9, "Insect Plague")])]),
    "feature.paladin-devotion-oath-of-devotion-spells": ("paladin", [
        ("Oath of Devotion Spells", "Conjuros del juramento de entrega", [
            (3, "Protection from Evil and Good, Shield of Faith"), (5, "Aid, Zone of Truth"),
            (9, "Beacon of Hope, Dispel Magic"), (13, "Freedom of Movement, Guardian of Faith"),
            (17, "Commune, Flame Strike")])]),
    "feature.sorcerer-draconic-draconic-spells": ("sorcerer", [
        ("Draconic Spells", "Conjuros dracónicos", [
            (3, "Alter Self, Chromatic Orb, Command, Dragon’s Breath"), (5, "Fear, Fly"),
            (7, "Arcane Eye, Charm Monster"), (9, "Legend Lore, Summon Dragon")])]),
    "feature.warlock-fiend-fiend-spells": ("warlock", [
        ("Fiend Spells", "Conjuros del infernal", [
            (3, "Burning Hands, Command, Scorching Ray, Suggestion"), (5, "Fireball, Stinking Cloud"),
            (7, "Fire Shield, Wall of Fire"), (9, "Geas, Insect Plague")])]),
}
LEVEL_HEAD = {
    "cleric": (("Cleric Level", "Prepared Spells"), ("Nivel de clérigo", "Conjuros preparados")),
    "druid": (("Druid Level", "Circle Spells"), ("Nivel de druida", "Conjuros del círculo")),
    "paladin": (("Paladin Level", "Spells"), ("Nivel de paladín", "Conjuros")),
    "sorcerer": (("Sorcerer Level", "Spells"), ("Nivel de hechicero", "Conjuros")),
    "warlock": (("Warlock Level", "Spells"), ("Nivel de brujo", "Conjuros")),
}
TABLES = {
    ("feature.druid-land-natures-ward", "en"): [{
        "t": "table", "caption": "Nature’s Ward", "head": ["Land Type", "Resistance", "Land Type", "Resistance"],
        "rows": [["Arid", "Fire", "Temperate", "Lightning"], ["Polar", "Cold", "Tropical", "Poison"]]}],
    ("feature.druid-land-natures-ward", "es"): [{
        "t": "table", "caption": "Protección de la naturaleza",
        "head": ["Tipo de terreno", "Resistencia", "Tipo de terreno", "Resistencia"],
        "rows": [["Árido", "Fuego", "Templado", "Relámpago"], ["Polar", "Frío", "Tropical", "Veneno"]]}],
    ("feature.druid-wild-shape", "es"): [{
        "t": "table", "caption": "Formas de bestia",
        "head": ["Nivel de druida", "Formas conocidas", "VD máx.", "Velocidad volando"],
        "rows": [["2", "4", "1/4", "No"], ["4", "6", "1/2", "No"], ["8", "8", "1", "Sí"]]}],
    ("feature.sorcerer-font-of-magic", "en"): [{
        "t": "table", "caption": "Creating Spell Slots",
        "head": ["Spell Slot Level", "Sorcery Point Cost", "Min. Sorcerer Level"],
        "rows": [["1", "2", "2"], ["2", "3", "3"], ["3", "5", "5"], ["4", "6", "7"], ["5", "7", "9"]]}],
    ("feature.sorcerer-font-of-magic", "es"): [{
        "t": "table", "caption": "Crear espacios de conjuro",
        "head": ["Nivel del espacio de conjuro", "Coste en puntos de hechicería", "Nivel mínimo de hechicero"],
        "rows": [["1", "2", "2"], ["2", "3", "3"], ["3", "5", "5"], ["4", "6", "7"], ["5", "7", "9"]]}],
    # A fragment of the full-width Rogue Features table, not part of the feature.
    ("feature.rogue-weapon-mastery", "en"): [],
}


def spell_names(index: list[dict]) -> dict:
    return {row["en"].replace("'", "’"): row["es"] for row in index if row["cat"] == "spell"}


def spell_tables(entry_id: str, lang: str, names: dict) -> list[dict] | None:
    spec = SPELL_TABLES.get(entry_id)
    if not spec:
        return None
    klass, tables = spec
    head = list(LEVEL_HEAD[klass][0 if lang == "en" else 1])
    out = []
    for caption_en, caption_es, rows in tables:
        body = []
        for level, spells in rows:
            listed = [s.strip() for s in spells.split(",")]
            if lang == "es":
                missing = [s for s in listed if s not in names]
                if missing:
                    raise SystemExit(f"{entry_id}: no Spanish spell name for {missing}")
                listed = [names[s] for s in listed]
                listed = [listed[0]] + [s[:1].lower() + s[1:] for s in listed[1:]]
            body.append([str(level), ", ".join(listed)])
        out.append({"t": "table", "caption": caption_en if lang == "en" else caption_es,
                    "head": head, "rows": body})
    return out


def with_tables(entry_id: str, lang: str, blocks: list[dict], names: dict) -> list[dict]:
    replacement = spell_tables(entry_id, lang, names)
    if replacement is None:
        replacement = TABLES.get((entry_id, lang))
    if replacement is None:
        return blocks
    out, placed = [], False
    for block in blocks:
        if block["t"] == "table":
            if not placed:
                out.extend(replacement)
                placed = True
            continue
        out.append(block)
    if not placed:
        out.extend(replacement)
    return out


def main(pdf_dir: str, content: str, report: bool) -> None:
    en, es = segment("en", pdf_dir), segment("es", pdf_dir)
    pairs = pair(en, es)
    if report:
        for a, b in pairs:
            print(f"{a['class']:<9} {a['sub'] or '-':<10} {a['level']:>2}  {a['name']:<40} {b['name']}")
    with open(os.path.join(content, "index.json"), encoding="utf-8") as fh:
        index = [row for row in json.load(fh) if row["cat"] != "feature"]
    bodies = {}
    for lang in ("en", "es"):
        with open(os.path.join(content, f"{lang}.json"), encoding="utf-8") as fh:
            bodies[lang] = {k: v for k, v in json.load(fh).items() if not k.startswith("feature.")}
    names = spell_names(index)
    seen: set[str] = set()
    for a, b in pairs:
        base = f"feature.{a['class']}-{a['sub'] + '-' if a['sub'] else ''}{slug(a['name'])}"
        entry_id = base if base not in seen else f"{base}-{a['level']}"
        if entry_id in seen:
            raise SystemExit(f"duplicate feature id {entry_id}")
        seen.add(entry_id)
        row = {"id": entry_id, "cat": "feature", "en": a["name"], "es": b["name"], "nl": 1,
               "lv": a["level"], "fc": a["class"]}
        if a["sub"]:
            row["sb"] = a["sub"]
        index.append(row)
        for lang, item in (("en", a), ("es", b)):
            summary = first_sentence(item["blocks"]) or item["name"]
            blocks = with_tables(entry_id, lang, item["blocks"], names)
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
    print("features", len(pairs), "entries", len(index))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], "--report" in sys.argv[3:])
