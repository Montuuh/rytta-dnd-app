"""Builds src/features/bestiary/content/*.json from the SRD 5.2.1 monster chapters (bestiary ADR 028).

Usage (manual, not CI; PDFs are downloaded outside the repository and never committed):
  python3 -I scripts/bestiary/build_bestiary.py <pdf-dir> src/features/bestiary/content

Outputs
  index.json   language-neutral catalogue: ids, names in both languages, CR, XP, size, type,
               AC, HP, initiative and legendary uses for search and filters, plus the
               challenge rating baselines (medians computed from the SRD) used by templates.
  en.json, es.json   stat blocks per language and the reusable trait library.
"""

from __future__ import annotations

import json
import os
import re
import statistics
import sys
from collections import Counter

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "glossary"))

from build_content import tidy as text_tidy  # noqa: E402
from srd_monsters import parse_monsters  # noqa: E402

DOCS = {
    "en": ("SRD_CC_v5.2.1.pdf", 258, 364, 344),
    "es": ("SP_SRD_CC_v5.2.1.pdf", 283, 398, 367),
}
SIZES = ("tiny", "small", "medium", "large", "huge", "gargantuan")
TYPES = ("aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend",
         "giant", "humanoid", "monstrosity", "ooze", "plant", "undead")
CR_XP = {"0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100,
         "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200,
         "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000,
         "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000, "23": 50000,
         "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000,
         "30": 155000}
PROBLEMS: list[str] = []
# Printed XP that disagrees with the SRD's own "Experience Points by Challenge Rating" table.
XP_ERRATA = {"archmage": 8000}
NOUN_ES_GENDER = {"la": "la criatura", "el": "la criatura", "del": "de la criatura",
                  "al": "a la criatura"}


def slug(text: str) -> str:
    text = text.lower().replace("’", "").replace("'", "")
    text = re.sub(r"\(.*?\)", "", text)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def plain_text(text: str) -> str:
    return re.sub(r"\*+", "", text)


def crn(cr: str) -> float:
    if "/" in cr:
        a, b = cr.split("/")
        return int(a) / int(b)
    return float(cr)


def fix_text(text: str) -> str:
    text = text_tidy(text)
    text = re.sub(r"([A-Za-z])- ([A-Z])", r"\1-\2", text)  # "Shape- Shift" across a line break
    # "**At Will:**" leads keep their bold; empty emphasis left by the PDF runs goes away.
    text = re.sub(r"\*\*\s*\*\*", "", text)
    text = re.sub(r"(?<![*\w])\*\s+\*(?![*\w])", " ", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def parse_meta_en(meta: str) -> dict:
    head, _, alignment = meta.rpartition(",")
    words = head.lower()
    swarm = "swarm of" in words
    sizes = [s for s in SIZES if re.search(rf"\b{s}\b", words.split("swarm of")[0])]
    type_part = words.split("swarm of")[-1]
    kind = next((t for t in TYPES if re.search(rf"\b{t}s?\b", type_part)), None)
    tags = re.findall(r"\(([^)]+)\)", head)
    if not sizes or not kind:
        raise ValueError(f"bad meta {meta!r}")
    out = {"size": sizes, "type": kind}
    if tags:
        out["tags"] = [t.strip() for tag in tags for t in tag.split(",")]
    if swarm:
        out["swarm"] = 1
    return out


def parse_cr(text: str) -> tuple[str, int, int | None, int]:
    m = re.match(r"^(\d+(?:/\d+)?)\s*\((.*)\)", text)
    if not m:
        raise ValueError(f"bad CR {text!r}")
    cr = m.group(1)
    inner = m.group(2)
    numbers = [int(n.replace(",", "").replace(".", "")) for n in re.findall(r"\d[\d,.]*", inner)]
    pb = int(re.search(r"(?:PB|BC) \+(\d+)", inner).group(1))
    xp = numbers[0]
    lair = numbers[1] if re.search(r"lair|guarida", inner) else None
    return cr, xp, lair, pb


def parse_usage(name: str) -> dict | None:
    m = re.search(r"\((?:[^)]*?)Recharge (\d)(?:–\d)?\)", name)
    if m:
        return {"recharge": int(m.group(1))}
    if "Recharge after a Short or Long Rest" in name:
        return {"rest": 1}
    m = re.search(r"\((\d+)/Day(?:, or (\d+)/Day in Lair)?", name)
    if m:
        usage = {"perDay": int(m.group(1))}
        if m.group(2):
            usage["lair"] = int(m.group(2))
        return usage
    return None


TERMS: dict[str, list[tuple[re.Pattern, str]]] = {"en": [], "es": []}


def numeric_tokens(entry: dict, lang: str) -> Counter:
    """A language-neutral signature: dice, DCs, bonuses, unit-free numbers and the glossary
    terms (spells, conditions, damage types…) the entry mentions."""
    text = fix_text(" ".join(entry["paras"]) + " " + entry["name"])
    tokens = re.findall(r"\d+d\d+(?:\s*[+−-]\s*\d+)?|(?:DC|CD) \d+|\+\d+|\d+/(?:Day|día)", text)
    norm = [re.sub(r"\s+", "", t).replace("CD", "DC").replace("día", "Day").replace("−", "-")
            for t in tokens]
    bare = re.sub(r"\d+d\d+|(?:DC|CD) \d+|\+\d+|\d+/\w+", " ", text)
    norm += [f"n{n}" for n in re.findall(
        r"(?<![\d,.])(\d+)(?![\d,.]|\s*(?:ft|feet|foot|-foot|m\b|metros|miles?|km|millas?))", bare)]
    lowered = plain_text(text).lower()
    norm += [f"g:{gid}" for pattern, gid in TERMS[lang] if pattern.search(lowered)]
    return Counter(norm)


def pair_entries(en: list[dict], es: list[dict], where: str) -> list[int]:  # noqa: C901
    """For each English entry, the index of its Spanish entry (Spanish lists are often sorted
    alphabetically, so order alone is not enough). Greedy on shared numeric tokens."""
    if len(en) != len(es):
        raise ValueError(f"{where}: {len(en)} English vs {len(es)} Spanish entries")
    scores = []
    for i, a in enumerate(en):
        ta = numeric_tokens(a, "en")
        for j, b in enumerate(es):
            tb = numeric_tokens(b, "es")
            shared = sum((ta & tb).values())
            total = max(1, sum((ta | tb).values()))
            len_ratio = min(len(" ".join(a["paras"])), len(" ".join(b["paras"]))) / max(
                1, len(" ".join(a["paras"])), len(" ".join(b["paras"])))
            scores.append((shared / total + 0.3 * len_ratio - 0.01 * abs(i - j), i, j))
    scores.sort(reverse=True)
    out = [-1] * len(en)
    used = set()
    for _, i, j in scores:
        if out[i] == -1 and j not in used:
            out[i] = j
            used.add(j)
    return out


def spell_lists(entry: dict, by_name: dict, where: str) -> list[dict]:
    lists = []
    for para in entry["paras"]:
        para = fix_text(para)
        m = re.match(r"^\*\*(\d+)/(?:Day|día)(?: Each| cada uno)?:\*\*(.*)$", para)
        if not m:
            continue
        ids = []
        for name in re.findall(r"\*([^*]+)\*", m.group(2)):
            key = name.strip().rstrip(",").strip().lower()
            if key not in by_name:
                PROBLEMS.append(f"{where}: unknown spell {name!r}")
                continue
            ids.append(by_name[key])
        lists.append({"perDay": int(m.group(1)), "spells": ids})
    return lists


def stat_block(raw: dict, lang: str, keys: list[str], usages: list, spells: list) -> dict:
    f = raw["fields"]
    hp = f["hp"]
    formula = re.search(r"\((.*)\)", hp)
    block = {
        "name": raw["name"],
        "meta": raw["meta"],
        "ac": f["ac"],
        "initiative": f["initiative"],
        "hp": hp,
        "speed": f["speed"],
        "abilities": raw["abilities"],
        "details": {k: fix_text(f[k]) for k in ("skills", "resistances", "vulnerabilities",
                                                "immunities", "gear", "senses", "languages")
                    if k in f},
        "cr": f["cr"],
        "page": raw["page"],
        "sections": [],
    }
    if formula:
        block["hpFormula"] = formula.group(1).replace("−", "-").replace(" ", "")
    n = 0
    for section in raw["sections"]:
        out = {"kind": section["kind"], "entries": []}
        if section.get("intro"):
            out["intro"] = fix_text(section["intro"])
        for entry in section["entries"]:
            item = {"key": keys[n], "name": fix_text(entry["name"]),
                    "text": [fix_text(p) for p in entry["paras"] if fix_text(p)]}
            if usages[n]:
                item["usage"] = usages[n]
            if spells[n]:
                item["spells"] = spells[n]
            out["entries"].append(item)
            n += 1
        block["sections"].append(out)
    return block


def flat_entries(raw: dict) -> list[dict]:
    return [e for s in raw["sections"] for e in s["entries"]]


def noun_en(name: str) -> str:
    return re.sub(r"\(.*?\)", "", name).strip().split(" ")[-1].lower()


def generic_text(paras: list[str], name: str, lang: str) -> list[str]:
    out = []
    for p in paras:
        if lang == "en":
            noun = noun_en(name)
            p = re.sub(rf"\b([Tt])he {re.escape(name.lower())}\b", r"\1he creature", p)
            p = re.sub(rf"\b([Tt])he {re.escape(noun)}\b", r"\1he creature", p)
        else:
            first = re.sub(r"\(.*?\)", "", name).strip().split(" ")[0].lower()
            for art, repl in NOUN_ES_GENDER.items():
                p = re.sub(rf"\b{art} {re.escape(first)}\b", repl, p)
                cap = art.capitalize()
                p = re.sub(rf"\b{cap} {re.escape(first)}\b", repl[0].upper() + repl[1:], p)
        out.append(p)
    return out


def median_int(values: list[float]) -> int:
    return int(round(statistics.median(values))) if values else 0


def main(pdf_dir: str, out_dir: str) -> None:
    glossary = json.load(open(os.path.join(HERE, "..", "..", "src", "features", "glossary",
                                           "content", "index.json"), encoding="utf-8"))
    spells_by = {"en": {}, "es": {}}
    for e in glossary:
        for lang in ("en", "es"):
            name = e[lang].lower()
            if len(name) > 3 and e["cat"] in ("spell", "condition", "damage", "skill", "action"):
                TERMS[lang].append((re.compile(rf"(?<!\w){re.escape(name)}(?!\w)"), e["id"]))
        if e["cat"] == "spell":
            spells_by["en"][e["en"].lower()] = e["id"]
            spells_by["es"][e["es"].lower()] = e["id"]
    raw = {}
    for lang, (pdf, first, last, animals) in DOCS.items():
        cache = os.path.join(pdf_dir, f"raw_{lang}.json")
        if os.environ.get("BESTIARY_REUSE_RAW") and os.path.exists(cache):
            raw[lang] = json.load(open(cache, encoding="utf-8"))
        else:
            issues: list[str] = []
            raw[lang] = parse_monsters(os.path.join(pdf_dir, pdf), first, last, lang, issues)
            if issues:
                raise SystemExit("\n".join(issues))
            with open(cache, "w", encoding="utf-8") as fh:
                json.dump(raw[lang], fh, ensure_ascii=False)
        for b in raw[lang]:
            b["animal"] = b["page"] >= animals

    def fingerprint(b):
        a = b["abilities"]
        return (tuple(a[k]["score"] for k in ("str", "dex", "con", "int", "wis", "cha")),
                b["fields"]["hp"].split()[0], b["fields"]["ac"])

    es_by = {fingerprint(b): b for b in raw["es"]}
    if len(es_by) != len(raw["es"]) or len(raw["en"]) != len(raw["es"]):
        raise SystemExit("English and Spanish stat blocks do not pair one to one")

    index, bodies = [], {"en": {}, "es": {}}
    trait_pool: dict[str, list[tuple[str, dict, dict]]] = {}
    baseline_rows: dict[str, list[dict]] = {}
    ids = set()
    for en in raw["en"]:
        es = es_by[fingerprint(en)]
        mid = slug(en["name"])
        if mid in ids:
            raise SystemExit(f"duplicate id {mid}")
        ids.add(mid)
        en_entries, es_entries = flat_entries(en), flat_entries(es)
        kinds_en = [s["kind"] for s in en["sections"]]
        kinds_es = [s["kind"] for s in es["sections"]]
        if kinds_en != kinds_es:
            raise SystemExit(f"{mid}: sections differ {kinds_en} / {kinds_es}")
        # Pair entries section by section; keys and usages come from English.
        order_es: list[dict] = []
        keys, usages, spells_en = [], [], []
        seen = Counter()
        for s_en, s_es in zip(en["sections"], es["sections"]):
            pairs = pair_entries(s_en["entries"], s_es["entries"], f"{mid}/{s_en['kind']}")
            for i, entry in enumerate(s_en["entries"]):
                k = slug(entry["name"]) or "entry"
                seen[k] += 1
                keys.append(k if seen[k] == 1 else f"{k}-{seen[k]}")
                usages.append(parse_usage(entry["name"]))
                spells_en.append(spell_lists(entry, spells_by["en"], mid))
                order_es.append(s_es["entries"][pairs[i]])
        # Spanish keeps its own order; map each Spanish entry to the English key.
        es_keys, es_usages, es_spells = [], [], []
        flat_es = es_entries
        for entry in flat_es:
            j = next(i for i, e in enumerate(order_es) if e is entry)
            es_keys.append(keys[j])
            es_usages.append(usages[j])
            got = spell_lists(entry, spells_by["es"], mid + " (es)")
            want = spells_en[j]
            if sorted((g["perDay"], sorted(g["spells"])) for g in got) != sorted(
                    (w["perDay"], sorted(w["spells"])) for w in want):
                PROBLEMS.append(f"{mid}: spell lists differ in {keys[j]}: {got} / {want}")
            es_spells.append(want)
        en_block = stat_block(en, "en", keys, usages, spells_en)
        es_block = stat_block(es, "es", es_keys, es_usages, es_spells)
        meta = parse_meta_en(en["meta"])
        cr, xp, xp_lair, pb = parse_cr(en["fields"]["cr"])
        if CR_XP[cr] != xp and not (cr == "0" and xp in (0, 10)):
            if XP_ERRATA.get(mid) != xp:
                raise SystemExit(f"{mid}: XP {xp} does not match CR {cr}")
            xp = CR_XP[cr]  # the printed block keeps its text; the index uses the CR table
        legendary = 0
        lair_legendary = None
        for s in en["sections"]:
            if s["kind"] == "legendaryActions":
                m = re.search(r"Uses: (\d+)(?: \((\d+) in Lair\))?", s["intro"])
                legendary = int(m.group(1))
                lair_legendary = int(m.group(2)) if m.group(2) else None
        hp = int(en["fields"]["hp"].split()[0])
        init = int(en["fields"]["initiative"].split()[0].replace("−", "-").replace("+", ""))
        ac = int(re.match(r"\d+", en["fields"]["ac"]).group(0))
        item = {"id": mid, "en": en["name"], "es": es["name"], "cr": cr, "xp": xp, "pb": pb,
                "ac": ac, "hp": hp, "init": init, **meta,
                "pages": {"en": en["page"], "es": es["page"]}}
        if en.get("group") and en["group"] != en["name"]:
            item["group"] = {"en": en["group"], "es": es.get("group") or en["group"]}
        if xp_lair:
            item["xpLair"] = xp_lair
        if legendary:
            item["leg"] = legendary
            if lair_legendary:
                item["legLair"] = lair_legendary
        if en["animal"]:
            item["animal"] = 1
        index.append(item)
        bodies["en"][mid] = en_block
        bodies["es"][mid] = es_block
        for entry_en in en_block["sections"]:
            if entry_en["kind"] != "traits":
                continue
            for e in entry_en["entries"]:
                es_e = next(x for s in es_block["sections"] for x in s["entries"]
                            if x["key"] == e["key"])
                trait_pool.setdefault(e["key"], []).append((mid, e, es_e))
        # Baselines: attack bonus and save DC are the first ones in Actions.
        actions = " ".join(" ".join(e["text"]) for s in en_block["sections"]
                           if s["kind"] == "actions" for e in s["entries"])
        attack = re.search(r"Attack Roll:\*?\s*\+(\d+)", actions)
        dc = re.search(r"DC (\d+)", actions)
        baseline_rows.setdefault(cr, []).append(
            {"ac": ac, "hp": hp, "attack": int(attack.group(1)) if attack else None,
             "dc": int(dc.group(1)) if dc else None, "init": init})

    baselines = []
    for cr in CR_XP:
        rows = baseline_rows.get(cr)
        if not rows:
            continue
        baselines.append({
            "cr": cr, "n": len(rows), "xp": CR_XP[cr],
            "ac": median_int([r["ac"] for r in rows]), "hp": median_int([r["hp"] for r in rows]),
            "attack": median_int([r["attack"] for r in rows if r["attack"] is not None]),
            "dc": median_int([r["dc"] for r in rows if r["dc"] is not None]),
        })

    traits = {"en": [], "es": []}
    for key, uses in sorted(trait_pool.items()):
        if len(uses) < 2 or key.startswith("legendary-resistance"):
            continue
        mid, e_en, e_es = min(uses, key=lambda u: len(" ".join(u[1]["text"])))
        name_en = bodies["en"][mid]["name"]
        name_es = bodies["es"][mid]["name"]
        base = {"key": key, "from": mid, "count": len(uses)}
        traits["en"].append({**base, "name": e_en["name"],
                             "text": generic_text(e_en["text"], name_en, "en")})
        traits["es"].append({**base, "name": e_es["name"],
                             "text": generic_text(e_es["text"], name_es, "es")})

    if PROBLEMS:
        raise SystemExit("\n".join(PROBLEMS))
    index.sort(key=lambda m: m["en"])
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as fh:
        json.dump({"monsters": index, "baselines": baselines}, fh, ensure_ascii=False,
                  separators=(",", ":"))
        fh.write("\n")
    for lang in ("en", "es"):
        with open(os.path.join(out_dir, f"{lang}.json"), "w", encoding="utf-8") as fh:
            json.dump({"monsters": bodies[lang], "traits": traits[lang]}, fh, ensure_ascii=False,
                      separators=(",", ":"))
            fh.write("\n")
    print(f"{len(index)} monsters, {len(traits['en'])} library traits, {len(baselines)} CR rows")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
