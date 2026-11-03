"""Spell header parsing shared by build_content.py (level, school, classes, components)."""

from __future__ import annotations

import re

SCHOOLS = {
    "abjuration": "abjuración", "conjuration": "conjuración", "divination": "adivinación",
    "enchantment": "encantamiento", "evocation": "evocación", "illusion": "ilusionismo",
    "necromancy": "nigromancia", "transmutation": "transmutación",
}
SCHOOL_BY_ES = {v: k for k, v in SCHOOLS.items()}
CLASSES = {
    "bard": "bardo", "cleric": "clérigo", "druid": "druida", "paladin": "paladín",
    "ranger": "explorador", "sorcerer": "hechicero", "warlock": "brujo", "wizard": "mago",
}
CLASS_BY_ES = {v: k for k, v in CLASSES.items()}


def parse_meta(meta: str, lang: str) -> dict:
    m = re.match(r"^(.*?)\((.*)\)\s*$", meta.strip())
    if not m:
        raise ValueError(f"bad spell meta: {meta!r}")
    head, classes = m.group(1).strip().lower(), m.group(2)
    names = [c.strip().lower() for c in classes.split(",") if c.strip()]
    if lang == "en":
        cantrip = "cantrip" in head
        level = 0 if cantrip else int(re.search(r"level (\d)", head).group(1))
        school = next(s for s in SCHOOLS if s in head)
        cls = [c for c in names]
    else:
        cantrip = head.startswith("truco")
        level = 0 if cantrip else int(re.search(r"nivel (\d)", head).group(1))
        school = next(SCHOOL_BY_ES[s] for s in SCHOOL_BY_ES if s in head)
        cls = [CLASS_BY_ES[c] for c in names]
    for c in cls:
        if c not in CLASSES:
            raise ValueError(f"unknown class {c!r} in {meta!r}")
    return {"level": level, "school": school, "classes": sorted(cls)}


def component_letters(text: str) -> str:
    head = text.split("(")[0]
    return "".join(sorted(set(re.findall(r"\b([VSM])\b", head))))


def concentration(duration: str) -> bool:
    return duration.lower().startswith(("concentration", "concentración"))


def ritual(casting: str) -> bool:
    return "ritual" in casting.lower()


def material(text: str) -> str | None:
    m = re.search(r"\((.*)\)\s*$", text)
    return m.group(1).strip() if m else None
