"""Builds src/features/glossary/content/*.json from the reviewed raw SRD extraction (RYT-008).

Usage: python3 -I scripts/glossary/build_content.py <raw-dir> <out-dir>

Outputs
  index.json   language-neutral index: ids, categories, names and aliases in both languages,
               auto-link flags and spell filters. Small; loaded wherever terms are linked.
  en.json, es.json   entry bodies per language: summary, blocks, facts, spell stats and the
               optional SRD 5.1 (2014) block. Loaded when a definition is opened.
"""

from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))

from curated import (  # noqa: E402
    ABILITIES, ABILITY_ATTACK, ABILITY_SHORT, ALIASES, DAMAGE_TYPES, FACTS, LEGACY, LEGACY_ONLY,
    MASTERIES_EN_ES, NO_AUTOLINK, SKILLS, SUMMARIES, TABLE_OVERRIDES, WEAPON_PROPERTIES_EN_ES,
)
from rules_map import RULES_EN_ES  # noqa: E402
from spells_parse import component_letters, concentration, material, parse_meta, ritual  # noqa: E402

TAGS = {
    "action": "action", "acción": "action", "condition": "condition", "estado": "condition",
    "area of effect": "area", "área de efecto": "area", "attitude": "attitude", "actitud": "attitude",
    "hazard": "hazard", "peligro": "hazard",
}
SPELL_PAIRS = {
    "Arcane Hand": "Mano arcana", "Conjure Celestial": "Conjurar celestial",
    "Control Weather": "Controlar el clima", "Fear": "Terror", "Major Image": "Imagen mayor",
    "Hypnotic Pattern": "Patrón hipnótico", "Find Familiar": "Encontrar familiar",
    "Floating Disk": "Disco flotante", "Fireball": "Bola de fuego", "Lightning Bolt": "Relámpago",
    "Flesh to Stone": "De la carne a la piedra", "Move Earth": "Mover la tierra", "Fly": "Volar",
    "Gaseous Form": "Forma gaseosa", "Mirror Image": "Imagen múltiple",
    "Plant Growth": "Crecimiento vegetal", "Speak with Plants": "Hablar con las plantas",
    "Ray of Frost": "Rayo de escarcha", "Shocking Grasp": "Agarre electrizante",
}
ABILITY_EN = {a[0]: a[1] for a in ABILITIES}
ABILITY_ES = {a[0]: a[2] for a in ABILITIES}
DAMAGE_EN = {d[1].lower(): d[0] for d in DAMAGE_TYPES}
DAMAGE_ES = {d[2].lower(): d[0] for d in DAMAGE_TYPES}
SMALL_WORDS = {"of", "the", "and", "from", "to", "with", "in", "on", "a", "an", "or", "for", "into", "over"}


def slug(text: str) -> str:
    text = text.lower().replace("’", "").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def split_tag(heading: str) -> tuple[str, str | None]:
    m = re.match(r"^(.*?)\s*\[(.+)\]$", heading)
    if not m:
        return heading.strip(), None
    return m.group(1).strip(), TAGS[m.group(2).strip().lower()]


def fix_case(name: str) -> str:
    words = []
    for i, word in enumerate(name.split(" ")):
        if re.search(r"[a-z][A-Z]", word):
            word = word[:1].upper() + word[1:].lower()
        if i and word.lower() in SMALL_WORDS:
            word = word.lower()
        words.append(word)
    return " ".join(words)


def tidy(text: str) -> str:
    text = text.replace("‑", "-").replace("‐", "-").replace("­", "")
    text = re.sub(r"-{2,}", "-", text)
    text = re.sub(r"(\d)- (?=[a-z])", r"\1-", text)  # "10- foot" → "10-foot"
    text = re.sub(r"([a-záéíóúñ])- (?!(and|or|y|o|u|e)\b)([a-záéíóúñ])", r"\1\3", text)
    text = re.sub(r"(\*+)([^*]+?)- \1\s*\1([a-záéíóúñ])", r"\1\2\3", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def join_cell(a: str, b: str) -> str:
    if a.endswith("-") and len(a) > 1 and a[-2].isalpha() and b[:1].islower():
        return a[:-1] + b
    return a + " " + b


def normalize_table(block: dict) -> dict:
    """Bullet lists typeset as sans lines become lists; wrapped cell lines rejoin their row."""
    rows = block["rows"]
    if rows and all(len(r) == 1 for r in rows) and rows[0][0].startswith("•"):
        items: list[str] = []
        for (cell,) in rows:
            if cell.startswith("•") or not items:
                items.append(cell.lstrip("• ").strip())
            else:
                items[-1] = join_cell(items[-1], cell)
        return {"t": "ul", "items": [i.rstrip(";").strip() for i in items]}
    merged: list[list[str]] = []
    for row in rows:
        if len(row) == 1 and merged and len(merged[-1]) > 1:
            merged[-1][-1] = join_cell(merged[-1][-1], row[0])
        else:
            merged.append(list(row))
    return {**block, "rows": merged}


def merge_broken_paragraphs(blocks: list[dict]) -> list[dict]:
    """A paragraph never ends without punctuation: such a break is a column/page artefact."""
    out: list[dict] = []
    for block in blocks:
        prev = out[-1] if out else None
        if (prev and prev["t"] == "p" and block["t"] == "p" and prev["x"]
                and not re.search(r"[.:!?”)\]]\**$", prev["x"])):
            tail = f"**{block['lead']}** {block['x']}" if block.get("lead") else block["x"]
            prev["x"] = join_cell(prev["x"], tail)
            continue
        out.append(block)
    return out


def tidy_blocks(blocks: list[dict]) -> list[dict]:
    blocks = [normalize_table(b) if b["t"] == "table" else b for b in blocks]
    blocks = merge_broken_paragraphs([dict(b) for b in blocks])
    out = []
    for block in blocks:
        if block["t"] == "p":
            text = tidy(block["x"])
            lead = tidy(block["lead"]) if block.get("lead") else None
            if "•" in text:
                head, *items = [part.strip(" ;") for part in text.split("•")]
                if head:
                    out.append({"t": "p", **({"lead": lead} if lead else {}), "x": head})
                elif lead:
                    out.append({"t": "p", "lead": lead, "x": ""})
                tail = None
                if items:
                    last = items[-1]
                    m = re.match(r"^(.*?[.;])\s+([A-ZÁÉÍÓÚ*].*)$", last)
                    if m and len(m.group(2)) > 40:
                        items[-1], tail = m.group(1), m.group(2)
                out.append({"t": "ul", "items": [i.rstrip(";") for i in items if i]})
                if tail:
                    out.append({"t": "p", "x": tail})
                continue
            if not text and not lead:
                continue
            out.append({"t": "p", **({"lead": lead} if lead else {}), "x": text})
        elif block["t"] == "table":
            head = [tidy(c) for c in block.get("head", [])]
            rows = [[tidy(c) for c in row] for row in block["rows"] if [tidy(c) for c in row] != head]
            table = {"t": "table"}
            if block.get("caption"):
                table["caption"] = tidy(block["caption"])
            if head:
                table["head"] = head
            table["rows"] = rows
            out.append(table)
        elif block["t"] == "ul":
            out.append({"t": "ul", "items": [tidy(i) for i in block["items"]]})
    return out


def plain(text: str) -> str:
    text = re.sub(r"\*+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def first_sentence(blocks: list[dict], limit: int = 190) -> str:
    for block in blocks:
        if block["t"] != "p" or not block.get("x"):
            continue
        text = plain(block["x"])
        text = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ“¿¡])", text)[0]
        text = re.sub(r"\s*(See also|Consulta también).*$", "", text).strip()
        if len(text) > limit:
            cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:")
            text = cut + "…"
        if text:
            return text
    return ""


def condition_summary(blocks: list[dict]) -> str:
    leads = [b["lead"].rstrip(".") for b in blocks if b.get("lead")]
    return ". ".join(leads) + "." if leads else first_sentence(blocks)


def spell_facts(blocks: list[dict], lang: str) -> dict:
    text = plain(" ".join(b.get("x", "") for b in blocks if b["t"] == "p"))
    facts: dict = {}
    if lang == "en":
        m = re.search(r"(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw", text)
        if m:
            facts["save"] = next(k for k, v in ABILITY_EN.items() if v == m.group(1))
        m = re.search(r"(melee|ranged) spell attack", text, re.I)
        if m:
            facts["attack"] = m.group(1).lower()
        dmg = re.findall(r"\b(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder) damage", text)
        facts["damage"] = sorted({DAMAGE_EN[d.lower()] for d in dmg})
    else:
        m = re.search(r"salvación de (Fuerza|Destreza|Constitución|Inteligencia|Sabiduría|Carisma)", text)
        if m:
            facts["save"] = next(k for k, v in ABILITY_ES.items() if v == m.group(1))
        m = re.search(r"ataque de conjuro (cuerpo a cuerpo|a distancia)", text, re.I)
        if m:
            facts["attack"] = "melee" if "cuerpo" in m.group(1) else "ranged"
        dmg = re.findall(r"daño (?:de )?(ácido|contundente|frío|fuego|fuerza|relámpago|necrótico|perforante|veneno|psíquico|radiante|cortante|trueno)", text, re.I)
        facts["damage"] = sorted({DAMAGE_ES[d.lower()] for d in dmg})
    if not facts["damage"]:
        del facts["damage"]
    return facts


def load(raw: str, name: str):
    with open(os.path.join(raw, name), encoding="utf-8") as fh:
        return json.load(fh)


def main(raw: str, out: str) -> None:
    index: list[dict] = []
    bodies = {"en": {}, "es": {}}
    legacy = {lang: load(raw, f"raw-legacy.{lang}.json") for lang in ("en", "es")}

    def add(entry_id: str, cat: str, en: str, es: str, body_en: dict, body_es: dict, **extra):
        en_alias, es_alias = ALIASES.get(entry_id, ([], []))
        item = {"id": entry_id, "cat": cat, "en": en, "es": es}
        if en_alias:
            item["ea"] = en_alias
        if es_alias:
            item["sa"] = es_alias
        if entry_id in NO_AUTOLINK:
            item["nl"] = 1
        item.update(extra)
        index.append(item)
        for lang, body in (("en", body_en), ("es", body_es)):
            override = TABLE_OVERRIDES.get((entry_id, lang))
            if override:
                at, replacement = override
                assert body["blocks"][at]["t"] in ("table", "ul"), (entry_id, lang, body["blocks"][at])
                body["blocks"][at:at + 1] = replacement
            facts = FACTS.get(entry_id)
            if facts:
                body["facts"] = [[k, en_text if lang == "en" else es_text] for k, en_text, es_text in facts]
            if entry_id in SUMMARIES:
                body["summary"] = SUMMARIES[entry_id][0 if lang == "en" else 1]
            if entry_id in legacy[lang] and entry_id not in LEGACY_ONLY:
                body["legacy"] = {"page": legacy[lang][entry_id]["page"],
                                  "blocks": tidy_blocks(legacy[lang][entry_id]["blocks"])}
            bodies[lang][entry_id] = body

    # Rules glossary
    rules = {lang: {e["heading"]: e for e in load(raw, f"raw-rules.{lang}.json")} for lang in ("en", "es")}
    for heading_en, heading_es in RULES_EN_ES.items():
        en_entry, es_entry = rules["en"][heading_en], rules["es"][heading_es]
        name_en, tag = split_tag(heading_en)
        name_es, tag_es = split_tag(heading_es)
        assert tag == tag_es, (heading_en, heading_es)
        cat = tag or "rule"
        entry_id = f"{cat}.{slug(name_en)}"
        bodies_lang = {}
        for lang, raw_entry in (("en", en_entry), ("es", es_entry)):
            blocks = tidy_blocks(raw_entry["blocks"])
            summary = condition_summary(blocks) if cat == "condition" else first_sentence(blocks)
            bodies_lang[lang] = {"page": raw_entry["page"], "summary": summary, "blocks": blocks}
        add(entry_id, cat, name_en, name_es, bodies_lang["en"], bodies_lang["es"])

    # Abilities (SRD tables "Ability Descriptions", "Ability Check Examples", "Saving Throw Examples")
    skill_names = {}
    for sid, en, es, ability, _ex_en, _ex_es in SKILLS:
        skill_names.setdefault(ability, []).append((en, es))
    for aid, en, es, measures_en, measures_es, check_en, check_es, save_en, save_es in ABILITIES:
        body_en = {"page": 5, "summary": measures_en + ".", "blocks": [
            {"t": "p", "lead": "Measures.", "x": measures_en + "."},
            {"t": "p", "lead": "Ability checks.", "x": check_en},
            {"t": "p", "lead": "Saving throws.", "x": save_en}]}
        body_es = {"page": 5, "summary": measures_es + ".", "blocks": [
            {"t": "p", "lead": "Mide.", "x": measures_es + "."},
            {"t": "p", "lead": "Pruebas de característica.", "x": check_es},
            {"t": "p", "lead": "Tiradas de salvación.", "x": save_es}]}
        if aid in ABILITY_ATTACK:
            body_en["blocks"].append({"t": "p", "lead": "Attack rolls.", "x": ABILITY_ATTACK[aid][0]})
            body_es["blocks"].append({"t": "p", "lead": "Tiradas de ataque.", "x": ABILITY_ATTACK[aid][1]})
        skills = skill_names.get(aid, [])
        if skills:
            body_en["facts"] = [["check", "Skills: " + ", ".join(s[0] for s in skills) + "."]]
            body_es["facts"] = [["check", "Habilidades: " + ", ".join(s[1] for s in skills) + "."]]
        short_en, short_es = ABILITY_SHORT[aid]
        ALIASES.setdefault(f"ability.{aid}", ([short_en], [short_es]))
        add(f"ability.{aid}", "ability", en, es, body_en, body_es)

    # Skills (SRD table "Skills")
    for sid, en, es, ability, ex_en, ex_es in SKILLS:
        body_en = {"page": 9, "summary": ex_en, "blocks": [{"t": "p", "lead": "Example uses.", "x": ex_en}],
                   "facts": [["check", f"{ABILITY_EN[ability]} ({en}) check."]]}
        body_es = {"page": 9, "summary": ex_es, "blocks": [{"t": "p", "lead": "Ejemplos de usos.", "x": ex_es}],
                   "facts": [["check", f"Prueba de {ABILITY_ES[ability]} ({es})."]]}
        add(f"skill.{sid}", "skill", en, es, body_en, body_es, ab=ability)

    # Damage types (Rules Glossary table "Damage Types")
    page_en = rules["en"]["Damage Types"]["page"]
    page_es = rules["es"]["Tipos de daño"]["page"]
    for did, en, es, ex_en, ex_es in DAMAGE_TYPES:
        add(f"damage.{did}", "damage", en, es,
            {"page": page_en, "summary": ex_en + ".", "blocks": [{"t": "p", "lead": "Examples.", "x": ex_en + "."}]},
            {"page": page_es, "summary": ex_es + ".", "blocks": [{"t": "p", "lead": "Ejemplos.", "x": ex_es + "."}]})

    # Weapon properties and masteries (SRD "Equipment")
    weapons = {lang: {e["heading"]: e for e in load(raw, f"raw-weapons.{lang}.json")} for lang in ("en", "es")}
    for table, cat in ((WEAPON_PROPERTIES_EN_ES, "property"), (MASTERIES_EN_ES, "mastery")):
        for en, es in table.items():
            entry_id = f"{cat}.{slug(en)}"
            pair = {}
            for lang, name in (("en", en), ("es", es)):
                raw_entry = weapons[lang][name]
                blocks = tidy_blocks(raw_entry["blocks"])
                pair[lang] = {"page": raw_entry["page"], "summary": first_sentence(blocks), "blocks": blocks}
            add(entry_id, cat, en, es, pair["en"], pair["es"])

    # 2014-only entries
    for entry_id, (en, es) in LEGACY_ONLY.items():
        pair = {}
        for lang in ("en", "es"):
            raw_entry = legacy[lang][entry_id]
            blocks = tidy_blocks(raw_entry["blocks"])
            pair[lang] = {"page": raw_entry["page"], "summary": first_sentence(blocks), "blocks": blocks}
        add(entry_id, "rule", en, es, pair["en"], pair["es"], ed="2014")

    # Spells
    spells_en = load(raw, "raw-spells.en.json")
    spells_es = {e["heading"]: e for e in load(raw, "raw-spells.es.json")}

    def signature(entry, lang):
        meta = parse_meta(entry["meta"], lang)
        stats = [s[1] for s in entry["stats"]]
        dice = tuple(re.findall(r"\d+d\d+", json.dumps(entry["blocks"])))[:3]
        return (meta["level"], meta["school"], tuple(meta["classes"]), component_letters(stats[2]),
                concentration(stats[3]), ritual(stats[0]), dice)

    by_sig: dict = {}
    for heading, entry in spells_es.items():
        by_sig.setdefault(signature(entry, "es"), []).append(heading)
    used = set()
    for entry_en in spells_en:
        name_en = fix_case(entry_en["heading"])
        if name_en in SPELL_PAIRS:
            heading_es = SPELL_PAIRS[name_en]
        else:
            candidates = by_sig.get(signature(entry_en, "en"), [])
            if len(candidates) != 1:
                raise SystemExit(f"Unpaired spell {name_en}: {candidates}")
            heading_es = candidates[0]
        if heading_es in used:
            raise SystemExit(f"Spanish spell paired twice: {heading_es}")
        used.add(heading_es)
        entry_es = spells_es[heading_es]
        meta = parse_meta(entry_en["meta"], "en")
        stats_en = [s[1] for s in entry_en["stats"]]
        entry_id = f"spell.{slug(name_en)}"
        pair = {}
        for lang, entry in (("en", entry_en), ("es", entry_es)):
            stats = [tidy(s[1]) for s in entry["stats"]]
            blocks = tidy_blocks(entry["blocks"])
            # Stats typeset in bold (Chill Touch) swallow the first body paragraph.
            spill = re.match(r"^(Instantaneous|Instantáneo)\s+(\S.+)$", stats[3])
            if spill:
                stats[3] = spill.group(1)
                blocks.insert(0, {"t": "p", "x": spill.group(2)})
            spell = {"time": stats[0], "range": stats[1], "components": component_letters(stats[2]),
                     "duration": stats[3]}
            mat = material(stats[2])
            if mat:
                spell["material"] = tidy(mat)
            spell.update(spell_facts(blocks, lang))
            pair[lang] = {"page": entry["page"], "summary": first_sentence(blocks), "blocks": blocks, "spell": spell}
        extra = {"lv": meta["level"], "sc": meta["school"], "cl": meta["classes"]}
        if concentration(stats_en[3]):
            extra["co"] = 1
        if ritual(stats_en[0]):
            extra["ri"] = 1
        add(entry_id, "spell", name_en, heading_es, pair["en"], pair["es"], **extra)
    missing = set(spells_es) - used
    if missing:
        raise SystemExit(f"Unused Spanish spells: {sorted(missing)}")

    ids = [i["id"] for i in index]
    assert len(ids) == len(set(ids)), "duplicate ids"
    os.makedirs(out, exist_ok=True)
    index.sort(key=lambda i: i["id"])
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    for lang in ("en", "es"):
        ordered = {k: bodies[lang][k] for k in sorted(bodies[lang])}
        with open(os.path.join(out, f"{lang}.json"), "w", encoding="utf-8") as fh:
            json.dump(ordered, fh, ensure_ascii=False, separators=(",", ":"))
            fh.write("\n")
    cats: dict = {}
    for item in index:
        cats[item["cat"]] = cats.get(item["cat"], 0) + 1
    print("entries", len(index), cats)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
