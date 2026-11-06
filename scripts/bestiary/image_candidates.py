"""Collect freely licensed image candidates for every SRD creature (ADR 030).

Usage: python3 -I scripts/bestiary/image_candidates.py <index.json> <out.json> [--only id,id] [--leads-only]

Sources: the lead images of English Wikipedia articles (the API's `pilicense=free` keeps only free
files) for the creature's own name and the curated `TERMS` below, then a Wikimedia Commons file
search for its first terms. Every candidate keeps its Commons file page, author, licence and licence
URL so `build_images.py` can write the attribution. Non-free, NC and ND licences are dropped.
Requests are batched (50 titles per call) and paced: Wikimedia rate-limits anonymous clients.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

UA = "RyttaBestiaryImages/0.1 (tabletop companion; manual content build)"
WIKI = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
PAUSE = 1.2

# Wikipedia article titles and Commons search terms for creatures whose own name is not a good title.
TERMS: dict[str, list[str]] = {
    # Animals and dinosaurs: the real animal.
    "ape": ["Chimpanzee"], "badger": ["European badger"], "black-bear": ["American black bear"],
    "blood-hawk": ["Red-tailed hawk"], "boar": ["Wild boar"], "camel": ["Dromedary"],
    "constrictor-snake": ["Boa constrictor"], "crocodile": ["Nile crocodile"], "deer": ["Red deer"],
    "draft-horse": ["Shire horse"], "eagle": ["Bald eagle"], "elephant": ["African bush elephant"],
    "flying-snake": ["Chrysopelea"], "hunter-shark": ["Great white shark"], "hyena": ["Spotted hyena"],
    "jackal": ["Golden jackal"], "killer-whale": ["Orca"], "mammoth": ["Woolly mammoth"],
    "mastiff": ["English Mastiff"], "owl": ["Barn owl"], "panther": ["Black panther"],
    "piranha": ["Red-bellied piranha"], "rat": ["Brown rat"], "raven": ["Common raven"],
    "reef-shark": ["Grey reef shark"], "rhinoceros": ["White rhinoceros"], "riding-horse": ["Horse"],
    "saber-toothed-tiger": ["Smilodon"], "venomous-snake": ["Gaboon viper"], "vulture": ["Griffon vulture"],
    "warhorse": ["Destrier"], "weasel": ["Least weasel"], "tyrannosaurus-rex": ["Tyrannosaurus"],
    "axe-beak": ["Gastornis"], "archelon": ["Archelon"], "plesiosaurus": ["Plesiosaurus"],
    "giant-ape": ["Gigantopithecus", "Gorilla"], "giant-badger": ["Honey badger"],
    "giant-bat": ["Megabat", "Flying fox"], "giant-boar": ["Entelodont", "Wild boar"],
    "giant-constrictor-snake": ["Reticulated python"], "giant-crab": ["Japanese spider crab"],
    "giant-crocodile": ["Saltwater crocodile"], "giant-eagle": ["Haast's eagle", "Golden eagle"],
    "giant-elk": ["Irish elk"], "giant-fire-beetle": ["Firefly", "Pyrophorus"],
    "giant-frog": ["Goliath frog"], "giant-goat": ["Markhor"], "giant-hyena": ["Pachycrocuta"],
    "giant-lizard": ["Komodo dragon"], "giant-octopus": ["Giant Pacific octopus"],
    "giant-owl": ["Eurasian eagle-owl"], "giant-rat": ["Gambian pouched rat"],
    "giant-scorpion": ["Emperor scorpion"], "giant-seahorse": ["Big-belly seahorse"],
    "giant-shark": ["Megalodon"], "giant-spider": ["Goliath birdeater"], "giant-toad": ["Cane toad"],
    "giant-venomous-snake": ["King cobra"], "giant-vulture": ["Cinereous vulture"],
    "giant-wasp": ["Asian giant hornet"], "giant-weasel": ["Wolverine"],
    "giant-wolf-spider": ["Wolf spider"], "swarm-of-bats": ["bat swarm cave"],
    "swarm-of-insects": ["Locust swarm"], "swarm-of-piranhas": ["piranhas school"],
    "swarm-of-rats": ["rats swarm"], "swarm-of-ravens": ["ravens flock"],
    "swarm-of-venomous-snakes": ["vipers snake pit"], "dire-wolf": ["Dire wolf"],
    # People of the SRD: period art.
    "archmage": ["Merlin", "wizard illustration"], "assassin": ["Order of Assassins", "assassin painting"],
    "bandit": ["Brigandage", "bandits painting"], "bandit-captain": ["Highwayman", "brigand chief painting"],
    "berserker": ["Berserker"], "commoner": ["Peasant"], "cultist": ["hooded cultist", "Cult"],
    "cultist-fanatic": ["Flagellant", "fanatic painting"], "druid": ["Druid"], "gladiator": ["Gladiator"],
    "guard": ["Halberdier", "Yeomen Warders"], "guard-captain": ["Landsknecht"], "knight": ["Knight"],
    "mage": ["Magician (fantasy)", "sorcerer painting"], "noble": ["Nobility"], "pirate": ["Piracy"],
    "pirate-captain": ["Blackbeard"], "priest": ["Priest"], "priest-acolyte": ["Acolyte"],
    "scout": ["Ranger (character class)", "medieval scout"], "spy": ["Espionage", "spy painting"],
    "tough": ["Thug"], "tough-boss": ["Gangster", "thug boss"], "warrior-infantry": ["Men-at-arms"],
    "warrior-veteran": ["Mercenary"],
    # Myth and folklore.
    "basilisk": ["Basilisk"], "centaur-trooper": ["Centaur"], "chimera": ["Chimera (mythology)"],
    "cockatrice": ["Cockatrice"], "couatl": ["Feathered Serpent", "Quetzalcoatl"],
    "deva": ["Angel", "angel painting"], "planetar": ["Archangel"], "solar": ["Seraph"],
    "djinni": ["Jinn"], "efreeti": ["Ifrit"], "erinyes": ["Erinyes"], "doppelganger": ["Doppelgänger"],
    "dryad": ["Dryad"], "gargoyle": ["Gargoyle"], "ghost": ["Ghost"], "ghoul": ["Ghoul"],
    "gorgon": ["Catoblepas", "Gorgon"], "green-hag": ["Hag", "witch painting"],
    "night-hag": ["Night hag", "The Nightmare"], "sea-hag": ["sea witch"], "griffon": ["Griffin"],
    "harpy": ["Harpy"], "hell-hound": ["Hellhound"], "hippogriff": ["Hippogriff"],
    "homunculus": ["Homunculus"], "hydra": ["Lernaean Hydra"], "imp": ["Imp"], "incubus": ["Incubus"],
    "succubus": ["Succubus"], "kraken": ["Kraken"], "lamia": ["Lamia (mythology)"], "lich": ["Lich"],
    "manticore": ["Manticore"], "medusa": ["Medusa"], "merfolk-skirmisher": ["Merman", "Merfolk"],
    "merrow": ["Merrow"], "minotaur-of-baphomet": ["Minotaur"], "minotaur-skeleton": ["Minotaur skeleton"],
    "mummy": ["Mummy"], "mummy-lord": ["Egyptian mummy pharaoh"], "nightmare": ["Nightmare (horse)", "The Nightmare"],
    "ogre": ["Ogre"], "oni": ["Oni"], "pegasus": ["Pegasus"], "pseudodragon": ["Dragon miniature"],
    "rakshasa": ["Rakshasa"], "roc": ["Roc (mythology)"], "salamander": ["Salamander (legendary creature)"],
    "satyr": ["Satyr"], "shadow": ["Shadow person"], "specter": ["Spectre (paranormal)", "spectre"],
    "sphinx-of-lore": ["Sphinx"], "sphinx-of-valor": ["Great Sphinx of Giza"], "sphinx-of-wonder": ["Greek sphinx"],
    "sprite": ["Sprite (folklore)", "fairy painting"], "tarrasque": ["Tarasque"], "treant": ["Tree spirit", "Green Man"],
    "troll": ["Troll"], "troll-limb": ["Troll"], "unicorn": ["Unicorn"], "vampire": ["Vampire"],
    "vampire-spawn": ["Nosferatu"], "vampire-familiar": ["Renfield", "vampire servant"],
    "werebear": ["Werebear", "bear man"], "wereboar": ["Wereboar", "boar man"],
    "wererat": ["Wererat", "rat man"], "weretiger": ["Weretiger"], "werewolf": ["Werewolf"],
    "wight": ["Barrow-wight", "Draugr"], "will-o-wisp": ["Will-o'-the-wisp"], "winter-wolf": ["Arctic wolf"],
    "worg": ["Warg"], "wraith": ["Wraith"], "wyvern": ["Wyvern"], "zombie": ["Zombie"],
    "skeleton": ["Danse Macabre", "skeleton warrior"], "warhorse-skeleton": ["horse skeleton"],
    "ogre-zombie": ["Ogre", "zombie giant"], "dragon-turtle": ["Dragon turtle"],
    "guardian-naga": ["Nāga", "naga statue"], "spirit-naga": ["Nāga", "naga serpent"],
    "death-dog": ["Orthrus"], "blink-dog": ["Blink dog", "fantasy dog"], "ettin": ["Ettin", "two-headed giant"],
    "cloud-giant": ["Giant (mythology)", "cloud giant"], "fire-giant": ["Surtr"], "frost-giant": ["Jötunn"],
    "hill-giant": ["Giant", "hill giant"], "stone-giant": ["Stone giant"], "storm-giant": ["Storm giant", "Titan (mythology)"],
    "clay-golem": ["Golem"], "flesh-golem": ["Frankenstein's monster"], "iron-golem": ["Talos"],
    "stone-golem": ["Stone golem", "stone giant statue"], "shield-guardian": ["Automaton"],
    "animated-armor": ["Plate armour"], "animated-flying-sword": ["Flaming sword (mythology)", "Longsword"],
    "animated-rug-of-smothering": ["Flying carpet", "Persian carpet"],
    "air-elemental": ["Air elemental", "Sylph"], "earth-elemental": ["Earth elemental", "Gnome"],
    "fire-elemental": ["Fire elemental", "fire spirit"], "water-elemental": ["Water elemental", "Undine"],
    "invisible-stalker": ["Invisible man"], "magmin": ["Magmin", "lava creature"],
    "dust-mephit": ["Dust devil"], "ice-mephit": ["Ice imp"], "magma-mephit": ["magma imp"],
    "steam-mephit": ["steam imp"],
    # Fiends: the Dictionnaire Infernal and other public-domain engravings.
    "balor": ["Balor", "Asmodeus Dictionnaire infernal"], "barbed-devil": ["devil engraving"],
    "bearded-devil": ["bearded devil engraving"], "bone-devil": ["devil skeleton engraving"],
    "chain-devil": ["chained devil"], "horned-devil": ["horned devil"], "ice-devil": ["ice demon"],
    "pit-fiend": ["Satan", "Baal Dictionnaire infernal"], "lemure": ["Lemures"], "dretch": ["demon gargoyle"],
    "hezrou": ["toad demon"], "glabrezu": ["demon Dictionnaire infernal"], "marilith": ["serpent goddess many arms"],
    "nalfeshnee": ["boar demon"], "vrock": ["vulture demon"], "quasit": ["imp demon"],
    # Dungeon creatures.
    "aboleth": ["Aboleth"], "ankheg": ["Ankheg", "giant insect"], "azer-sentinel": ["Azer", "dwarf of fire"],
    "behir": ["Behir", "many-legged serpent"], "black-pudding": ["black slime", "ooze"],
    "bugbear-stalker": ["Bugbear"], "bugbear-warrior": ["Bugbear"], "bulette": ["Bulette"],
    "chuul": ["Chuul", "lobster monster"], "cloaker": ["Cloaker", "manta ray"], "darkmantle": ["Darkmantle"],
    "drider": ["Drider"], "ettercap": ["Ettercap"], "gelatinous-cube": ["Gelatinous cube"], "ghast": ["Ghast"],
    "gibbering-mouther": ["Gibbering mouther"], "gnoll-warrior": ["Gnoll"], "goblin-boss": ["Goblin"],
    "goblin-minion": ["Goblin"], "goblin-warrior": ["Goblin"], "gray-ooze": ["Gray ooze", "slime mold"],
    "grick": ["Grick"], "grimlock": ["Grimlock"], "half-dragon": ["Half-dragon", "dragon man"],
    "hobgoblin-captain": ["Hobgoblin"], "hobgoblin-warrior": ["Hobgoblin"], "kobold-warrior": ["Kobold"],
    "mimic": ["Mimic (Dungeons & Dragons)", "treasure chest monster"], "ochre-jelly": ["Ochre jelly", "slime mold yellow"],
    "otyugh": ["Otyugh"], "owlbear": ["Owlbear"], "phase-spider": ["Phase spider"],
    "purple-worm": ["Purple worm", "Mongolian death worm"], "remorhaz": ["Remorhaz"], "roper": ["Roper (Dungeons & Dragons)", "Stalagmite"],
    "rust-monster": ["Rust monster"], "sahuagin-warrior": ["Sahuagin", "fish man"], "shambling-mound": ["Shambling mound", "Swamp monster"],
    "shrieker-fungus": ["Amanita muscaria"], "violet-fungus": ["Violet webcap", "purple mushroom"],
    "stirge": ["Stirge"], "xorn": ["Xorn"], "swarm-of-crawling-claws": ["Hand of Glory"],
    "awakened-shrub": ["Shrub"], "awakened-tree": ["Ent", "Tree spirit"],
}

FREE = re.compile(r"^(cc0|cc[ -]by(-sa)?([ -][\d.]+)?.*|cc[ -]sa.*|gfdl.*|public domain|pd.*|attribution.*|no restrictions)$", re.I)
NOT_FREE = re.compile(r"\b(nc|nd|noncommercial|no ?derivs|fair use|non-free|copyrighted)\b", re.I)
AGE = re.compile(r"^(adult|ancient|young)\s+|\s+wyrmling$", re.I)
_last = 0.0


def get(url: str, params: dict[str, str]) -> dict:
    """GET through curl: Wikimedia's edge throttles Python's HTTP client far more than curl."""
    global _last
    query = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    for attempt in range(8):
        time.sleep(max(0.0, _last + PAUSE - time.monotonic()))
        _last = time.monotonic()
        run = subprocess.run(["curl", "-s", "-A", UA, "-w", "\n%{http_code}", f"{url}?{query}"],
                             capture_output=True, text=True, encoding="utf-8", timeout=60)
        body, _, code = run.stdout.rpartition("\n")
        if code == "200":
            return json.loads(body)
        wait = 15 if code == "429" else 3
        print(f"  HTTP {code or run.returncode}, waiting {wait + attempt * 5}s", file=sys.stderr, flush=True)
        time.sleep(wait + attempt * 5)
    raise RuntimeError(f"Wikimedia API unavailable: {url}")


def strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text or "")).strip()


def describe(page: dict) -> dict | None:
    """A free Commons file as a candidate (licence, author, 320px thumbnail), or None."""
    info = (page.get("imageinfo") or [None])[0]
    if not info:
        return None
    meta = info.get("extmetadata", {})
    value = lambda key: strip_html(meta.get(key, {}).get("value", ""))  # noqa: E731
    license_name = value("LicenseShortName")
    if not FREE.match(license_name) or NOT_FREE.search(license_name) or value("NonFree"):
        return None
    if info.get("mime") not in ("image/jpeg", "image/png", "image/webp", "image/tiff"):
        return None
    if min(info.get("width") or 0, info.get("height") or 0) < 150:
        return None
    return {
        "file": page["title"],
        "page": info.get("descriptionurl"),
        "thumb": info.get("thumburl"),
        "width": info.get("width"),
        "height": info.get("height"),
        "license": license_name,
        "licenseUrl": value("LicenseUrl"),
        "artist": value("Artist")[:200],
        "credit": value("Credit")[:200],
    }


IMAGEINFO = {"prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": "320",
             "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Credit|NonFree"}


def file_info(titles: list[str]) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for start in range(0, len(titles), 50):
        data = get(COMMONS, {"action": "query", "titles": "|".join(titles[start:start + 50]), **IMAGEINFO})
        for page in data.get("query", {}).get("pages", []):
            if (candidate := describe(page)) is not None:
                found[page["title"]] = candidate
    return found


def wiki_leads(titles: list[str]) -> dict[str, str]:
    """Article title (as asked) -> its free lead image file title."""
    leads: dict[str, str] = {}
    for start in range(0, len(titles), 50):
        chunk = titles[start:start + 50]
        data = get(WIKI, {"action": "query", "prop": "pageimages", "piprop": "name", "pilicense": "free",
                          "redirects": "1", "titles": "|".join(chunk)})
        query = data.get("query", {})
        back: dict[str, str] = {}
        for item in query.get("normalized", []) + query.get("redirects", []):
            back[item["to"]] = back.get(item["from"], item["from"])
        for page in query.get("pages", []):
            if page.get("pageimage"):
                leads[back.get(page["title"], page["title"])] = "File:" + page["pageimage"].replace("_", " ")
    return leads


def commons_search(term: str, limit: int = 8) -> list[dict]:
    data = get(COMMONS, {"action": "query", "generator": "search", "gsrnamespace": "6",
                         "gsrlimit": str(limit), "gsrsearch": f"{term} filetype:bitmap", **IMAGEINFO})
    pages = sorted(data.get("query", {}).get("pages", []), key=lambda p: p.get("index", 99))
    return [c for page in pages if (c := describe(page)) is not None]


def titles_for(monster: dict) -> list[str]:
    name = monster["en"].replace("’", "'")
    base = AGE.sub("", name).strip()
    return list(dict.fromkeys([*TERMS.get(monster["id"], []), name, base]))


def main() -> None:
    index_path, out_path = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
    # --leads-only: article lead images alone (batched, fast); Commons search finds little for monsters.
    leads_only = "--leads-only" in args
    monsters = [m for m in json.load(open(index_path, encoding="utf-8"))["monsters"]
                if only is None or m["id"] in only]
    try:
        result = json.load(open(out_path, encoding="utf-8"))
    except FileNotFoundError:
        result = {}
    todo = [m for m in monsters if only is not None or leads_only or m["id"] not in result]
    leads = wiki_leads(list(dict.fromkeys(t for m in todo for t in titles_for(m))))
    lead_info = file_info(list(dict.fromkeys(leads.values())))
    print(f"{len(leads)} article lead images, {len(lead_info)} free and large enough", flush=True)
    for count, monster in enumerate(todo, 1):
        found = [lead_info[leads[t]] for t in titles_for(monster) if leads.get(t) in lead_info]
        name = monster["en"].replace("’", "'")
        terms = TERMS.get(monster["id"]) or [name]
        if not leads_only:
            for term in dict.fromkeys(terms[:2] if len(terms) > 1 else [terms[0], f"{terms[0]} illustration"]):
                found += commons_search(term)
        unique = list({c["file"]: c for c in found}.values())[:12]
        result[monster["id"]] = unique
        print(f"{count:3}/{len(todo)} {monster['id']}: {len(unique)}", flush=True)
        json.dump(result, open(out_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    root = Path(__file__).resolve().parents[2]
    if Path(out_path).exists() and Path(out_path).resolve().is_relative_to(root):
        prettier(Path(out_path).resolve(), root)


def prettier(path: Path, root: Path) -> None:
    """Formats a written file as the repository's format check expects, so a rebuild never fails CI."""
    subprocess.run(["npx", "prettier", "--write", str(path)], cwd=root, check=True, shell=os.name == "nt",
                   stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
