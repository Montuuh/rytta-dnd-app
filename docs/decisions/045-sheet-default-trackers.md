# ADR 045: default trackers for species, feats and subclasses, and options paid from a resource

Date: 2026-11-16. Status: accepted for RYT-102. Amends ADR 035 (class resources by level).

## Context

ADR 035 seeded class resources from the SRD 5.2.1 class tables. The user (2026-11-15) asked for
default trackers for every limited-use class, subclass, species and feat feature (Savage
Attacker, Goliath Giant Ancestry, Large Form, Breath Weapon...), once-per-turn features, and
abilities that spend a shared resource (Flurry of Blows, Patient Defense and Step of the Wind
from Focus; Channel Divinity options) as their own entries.

## Decision

1. **Sources.** `characters/domain/resources.ts` adds species and origin-feat trackers to the
   class and SRD subclass ones (names and numbers only; the rules text is the linked glossary
   entry). Only the SRD subclass of each class is covered. Maximums follow the level and the
   proficiency bonus; lineage spells appear only for the chosen option.
2. **Species options live on the sheet.** Choices such as the Goliath's Giant Ancestry are
   stored in `build.choices` and picked on the sheet, not in the creation wizard. Changing the
   choice drops the trackers of the option the character no longer has.
3. **Once per turn is a light mark.** Savage Attacker, Sneak Attack, Frenzy, Hunter's Prey and
   similar features are `per: 'turn'` trackers with one mark. "New turn" on the sheet or any
   rest clears the marks; the rest preview does not list them. No server-side per-turn reset
   was added: the sheet does not follow combat turns, so the mark is the Player's reminder.
4. **Options paid from a resource.** `resourceActions` lists options under their parent with a
   cost (Flurry of Blows, Patient Defense and Step of the Wind from Focus; Channel Divinity
   options; Cutting Words from Bardic Inspiration...). One tap spends the cost and is refused
   when the parent cannot pay; some options also spend a once-per-rest limit or give a use back.
   Each option links its own glossary entry.
5. **Glossary.** `scripts/glossary/origin_features.py` turns the species traits and feats of
   the English and official Spanish SRD 5.2.1 into `feature.species-*` and `feature.feat-*`
   entries, run after `class_features.py`. A test requires every tracker and option to link an
   existing entry.
6. **Sync and limits.** Existing sheets gain missing trackers on sync without duplicates;
   spent uses, renames, display changes and removed trackers are kept. The cap stays at 30
   trackers; when defaults would pass it the sheet shows a notice with the number left out
   instead of dropping them silently. No backend change: trackers stay in the existing build
   and play state.

## Consequences

- Trackers count uses; they apply no rule effect.
- Not implemented: Metamagic options and Font of Magic conversions, non-SRD subclasses and
  homebrew feature authoring, a per-turn reset tied to the combat turn order.
