-- Rytta staging seed (RYT-116): synthetic data for the STAGING Supabase project only.
--
-- What it is. One idempotent script that fills an empty staging project (schemas public and
-- private, every migration applied, no PRE) with a small invented table: 5 accounts, 2 campaigns,
-- characters, items, a shop, a tabletop, a live and a closed encounter, an open rest, rolls, a
-- level-up and a pending invitation. Every person, place, character, address and text is invented
-- for this file; nothing comes from production data. Accounts use the reserved domain example.test.
--
-- Who can sign in. Nobody, with these rows. The seed accounts have no password and no identity
-- (no auth.identities row): they exist so the data has owners and the database rules have actors.
-- Real sign-in on staging needs the staging Google OAuth client that the project owner configures;
-- a person who signs in that way is a new account, and while that account exists this script
-- refuses to run (see the guard).
--
-- Guard. The script refuses to run unless the database looks like staging: no schema pre or
-- pre_private, no auth.users row other than the 5 seed accounts, and no campaign other than the
-- 2 seed campaigns. Production (with PRE and real accounts) is always refused.
--
-- Re-running. Safe: when seed rows exist the script first removes them through the application's
-- own account deletion (prepare_account_deletion and delete_my_account for every seed account,
-- after the one membership change that would otherwise block it), then a sweep of the fixed seed
-- ids, and creates everything again. The same removal is supabase/seed/staging_unseed.sql. Two
-- runs in a row leave the same rows. The open short rest expires 10 minutes after the run (the
-- application's rest window); run the seed again for a fresh one.
--
-- How it writes. As the owner role it inserts only what has no application path: the auth.users
-- rows and the two campaigns with their first DM membership (create_campaign has no fixed id; the
-- two inserts are exactly what it does). Everything else goes through the application's RPCs,
-- called as the acting seed user: request.jwt.claim.sub and request.jwt.claims carry the user and
-- the role is switched with set local role authenticated, as the database tests do. Lookups of
-- generated ids switch back to the owner role for a read.
--
-- Transport. Pure ASCII, no backslash anywhere; accented text is built with chr().
--
-- Fixed ids (00000000-5eed-4000-8xxx-...):
--   accounts  ...8000-000000000001 Mara Quill    mara.quill@example.test    DM of The Salt Road; Player in Hollowmere
--             ...8000-000000000002 Teodor Venn   teodor.venn@example.test   DM of Hollowmere; Player in The Salt Road
--             ...8000-000000000003 Ilse Marrow   ilse.marrow@example.test   second DM of Hollowmere; Player in The Salt Road
--             ...8000-000000000004 Corin Ashby   corin.ashby@example.test   Player in both campaigns
--             ...8000-000000000005 Nell Pruett   nell.pruett@example.test   Player in both campaigns
--   campaigns ...8000-0000000c0001 The Salt Road (dice in the app, party level 3)
--             ...8000-0000000c0002 Lanterns of Hollowmere (physical dice)
--   rolls ...8003-, open rest ...8004-, glossary ...8005-, tabletop items ...8002-, account
--   deletion requests ...8006-. Other rows (characters, items, encounters, scenes) get their ids
--   from the RPCs and are owned by the campaigns above.
do $seed$
declare
  u_mara constant uuid := '00000000-5eed-4000-8000-000000000001';
  u_teo constant uuid := '00000000-5eed-4000-8000-000000000002';
  u_ilse constant uuid := '00000000-5eed-4000-8000-000000000003';
  u_corin constant uuid := '00000000-5eed-4000-8000-000000000004';
  u_nell constant uuid := '00000000-5eed-4000-8000-000000000005';
  c_salt constant uuid := '00000000-5eed-4000-8000-0000000c0001';
  c_mere constant uuid := '00000000-5eed-4000-8000-0000000c0002';
  seed_users constant uuid[] := array['00000000-5eed-4000-8000-000000000001',
    '00000000-5eed-4000-8000-000000000002', '00000000-5eed-4000-8000-000000000003',
    '00000000-5eed-4000-8000-000000000004', '00000000-5eed-4000-8000-000000000005']::uuid[];
  seed_campaigns constant uuid[] := array['00000000-5eed-4000-8000-0000000c0001',
    '00000000-5eed-4000-8000-0000000c0002']::uuid[];
  -- Account deletion request ids, in the order the accounts are removed.
  leave_order constant uuid[] := array['00000000-5eed-4000-8000-000000000005',
    '00000000-5eed-4000-8000-000000000004', '00000000-5eed-4000-8000-000000000003',
    '00000000-5eed-4000-8000-000000000002', '00000000-5eed-4000-8000-000000000001']::uuid[];
  deletion_requests constant uuid[] := array['00000000-5eed-4000-8006-000000000005',
    '00000000-5eed-4000-8006-000000000004', '00000000-5eed-4000-8006-000000000003',
    '00000000-5eed-4000-8006-000000000002', '00000000-5eed-4000-8006-000000000001']::uuid[];
  who uuid; i integer;
  -- Sheets built with the application's own quick build and progression (class features and
  -- resources as the app stores them), plus invented names and notes.
  b_wizard constant jsonb := '{"classKey":"wizard","classLabel":"Wizard","subclass":"","speciesKey":"elf","speciesLabel":"Elf","backgroundKey":"sage","backgroundLabel":"Sage","alignment":"Neutral Good","abilityMethod":"standard","baseAbilities":{"str":8,"dex":13,"con":14,"int":15,"wis":12,"cha":10},"bonuses":{"str":0,"dex":0,"con":1,"int":2,"wis":0,"cha":0},"saves":["int","wis"],"skills":{"arcana":"proficient","history":"proficient","investigation":"proficient","insight":"proficient"},"hitDie":6,"speed":30,"acOverride":null,"casterKind":"full","spellAbility":"int","languages":"Common, Elvish, Draconic","proficiencies":"","appearance":"Ink-stained fingers and a patched grey coat.","notes":"Keeps a spellbook bound in eel leather.","features":[{"id":"species-darkvision","name":"Darkvision","source":"species","description":"","ref":"feature.species-elf-darkvision"},{"id":"species-elvenLineage","name":"Elven Lineage","source":"species","description":"","ref":"feature.species-elf-elven-lineage"},{"id":"species-feyAncestry","name":"Fey Ancestry","source":"species","description":"","ref":"feature.species-elf-fey-ancestry"},{"id":"species-keenSenses","name":"Keen Senses","source":"species","description":"","ref":"feature.species-elf-keen-senses"},{"id":"species-trance","name":"Trance","source":"species","description":"","ref":"feature.species-elf-trance"},{"id":"background-magicInitiateWizard","name":"Magic Initiate Wizard","source":"feat","description":"","ref":"feature.feat-magic-initiate"},{"id":"srd-wizard-arcane-recovery","name":"Arcane Recovery","source":"class","description":"","ref":"feature.wizard-arcane-recovery","level":1},{"id":"srd-wizard-ritual-adept","name":"Ritual Adept","source":"class","description":"","ref":"feature.wizard-ritual-adept","level":1},{"id":"srd-wizard-spellcasting","name":"Spellcasting","source":"class","description":"","ref":"feature.wizard-spellcasting","level":1},{"id":"srd-wizard-scholar","name":"Scholar","source":"class","description":"","ref":"feature.wizard-scholar","level":2},{"id":"srd-wizard-wizard-subclass","name":"Wizard Subclass","source":"class","description":"","ref":"feature.wizard-wizard-subclass","level":3}],"trackers":[{"id":"class-wizard-arcane-recovery","name":"wizard-arcane-recovery","max":1,"reset":"long","key":"wizard-arcane-recovery","display":"pips"},{"id":"origin-feat-magic-initiate","name":"feat-magic-initiate","max":1,"reset":"long","key":"feat-magic-initiate","display":"pips"}],"spells":[{"id":"spell.fire-bolt","name":"Fire Bolt","level":0,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.fire-bolt"},{"id":"spell.mage-hand","name":"Mage Hand","level":0,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.mage-hand"},{"id":"spell.light","name":"Light","level":0,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.light"},{"id":"spell.magic-missile","name":"Magic Missile","level":1,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.magic-missile"},{"id":"spell.shield","name":"Shield","level":1,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.shield"},{"id":"spell.detect-magic","name":"Detect Magic","level":1,"concentration":true,"ritual":true,"prepared":true,"notes":"","ref":"spell.detect-magic"},{"id":"spell.sleep","name":"Sleep","level":1,"concentration":true,"ritual":false,"prepared":false,"notes":"","ref":"spell.sleep"},{"id":"spell.misty-step","name":"Misty Step","level":2,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.misty-step"},{"id":"spell.hold-person","name":"Hold Person","level":2,"concentration":true,"ritual":false,"prepared":true,"notes":"","ref":"spell.hold-person"}],"subclassKey":"","origin":"quick"}';
  b_paladin constant jsonb := '{"classKey":"paladin","classLabel":"Paladin","subclass":"","speciesKey":"human","speciesLabel":"Human","backgroundKey":"soldier","backgroundLabel":"Soldier","alignment":"Lawful Good","abilityMethod":"standard","baseAbilities":{"str":15,"dex":10,"con":13,"int":8,"wis":12,"cha":14},"bonuses":{"str":2,"dex":0,"con":1,"int":0,"wis":0,"cha":0},"saves":["wis","cha"],"skills":{"athletics":"proficient","intimidation":"proficient","persuasion":"proficient","insight":"proficient"},"hitDie":10,"speed":30,"acOverride":null,"casterKind":"half","spellAbility":"cha","languages":"Common, Dwarvish","proficiencies":"","appearance":"Dented breastplate polished every morning.","notes":"Swore an oath at the lighthouse of Cair Brenn.","features":[{"id":"species-resourceful","name":"Resourceful","source":"species","description":"","ref":"feature.species-human-resourceful"},{"id":"species-skillful","name":"Skillful","source":"species","description":"","ref":"feature.species-human-skillful"},{"id":"species-versatile","name":"Versatile","source":"species","description":"","ref":"feature.species-human-versatile"},{"id":"background-savageAttacker","name":"Savage Attacker","source":"feat","description":"","ref":"feature.feat-savage-attacker"},{"id":"srd-paladin-lay-on-hands","name":"Lay on Hands","source":"class","description":"","ref":"feature.paladin-lay-on-hands","level":1},{"id":"srd-paladin-spellcasting","name":"Spellcasting","source":"class","description":"","ref":"feature.paladin-spellcasting","level":1},{"id":"srd-paladin-weapon-mastery","name":"Weapon Mastery","source":"class","description":"","ref":"feature.paladin-weapon-mastery","level":1},{"id":"srd-paladin-fighting-style","name":"Fighting Style","source":"class","description":"","ref":"feature.paladin-fighting-style","level":2},{"id":"srd-paladin-paladins-smite","name":"Paladin''s Smite","source":"class","description":"","ref":"feature.paladin-paladins-smite","level":2},{"id":"srd-paladin-channel-divinity","name":"Channel Divinity","source":"class","description":"","ref":"feature.paladin-channel-divinity","level":3},{"id":"srd-paladin-divine-sense","name":"Divine Sense","source":"class","description":"","ref":"feature.paladin-divine-sense","level":3},{"id":"srd-paladin-paladin-subclass","name":"Paladin Subclass","source":"class","description":"","ref":"feature.paladin-paladin-subclass","level":3}],"trackers":[{"id":"class-paladin-lay-on-hands","name":"paladin-lay-on-hands","max":15,"reset":"long","key":"paladin-lay-on-hands","display":"counter"},{"id":"origin-feat-savage-attacker","name":"feat-savage-attacker","max":1,"reset":"short","key":"feat-savage-attacker","display":"pips","per":"turn"},{"id":"class-paladin-smite","name":"paladin-smite","max":1,"reset":"long","key":"paladin-smite","display":"pips"},{"id":"class-paladin-channel-divinity","name":"paladin-channel-divinity","max":2,"reset":"long","key":"paladin-channel-divinity","display":"pips"}],"spells":[{"id":"spell.bless","name":"Bless","level":1,"concentration":true,"ritual":false,"prepared":true,"notes":"","ref":"spell.bless"},{"id":"spell.cure-wounds","name":"Cure Wounds","level":1,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.cure-wounds"},{"id":"spell.shield-of-faith","name":"Shield of Faith","level":1,"concentration":true,"ritual":false,"prepared":true,"notes":"","ref":"spell.shield-of-faith"},{"id":"spell.divine-smite","name":"Divine Smite","level":1,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.divine-smite"}],"subclassKey":"","origin":"quick"}';
  b_warlock constant jsonb := '{"classKey":"warlock","classLabel":"Warlock","subclass":"","speciesKey":"tiefling","speciesLabel":"Tiefling","backgroundKey":"acolyte","backgroundLabel":"Acolyte","alignment":"Chaotic Neutral","abilityMethod":"standard","baseAbilities":{"str":8,"dex":13,"con":14,"int":10,"wis":12,"cha":15},"bonuses":{"str":0,"dex":0,"con":0,"int":0,"wis":1,"cha":2},"saves":["wis","cha"],"skills":{"insight":"proficient","religion":"proficient","arcana":"proficient","deception":"proficient"},"hitDie":8,"speed":30,"acOverride":null,"casterKind":"pact","spellAbility":"cha","languages":"Common, Infernal","proficiencies":"","appearance":"Ash-grey horns wrapped in copper wire.","notes":"Her patron speaks only at low tide.","features":[{"id":"species-darkvision","name":"Darkvision","source":"species","description":"","ref":"feature.species-tiefling-darkvision"},{"id":"species-fiendishLegacy","name":"Fiendish Legacy","source":"species","description":"","ref":"feature.species-tiefling-fiendish-legacy"},{"id":"species-otherworldlyPresence","name":"Otherworldly Presence","source":"species","description":"","ref":"feature.species-tiefling-otherworldly-presence"},{"id":"background-magicInitiateCleric","name":"Magic Initiate Cleric","source":"feat","description":"","ref":"feature.feat-magic-initiate"},{"id":"srd-warlock-eldritch-invocations","name":"Eldritch Invocations","source":"class","description":"","ref":"feature.warlock-eldritch-invocations","level":1},{"id":"srd-warlock-pact-magic","name":"Pact Magic","source":"class","description":"","ref":"feature.warlock-pact-magic","level":1},{"id":"srd-warlock-magical-cunning","name":"Magical Cunning","source":"class","description":"","ref":"feature.warlock-magical-cunning","level":2},{"id":"srd-warlock-warlock-subclass","name":"Warlock Subclass","source":"class","description":"","ref":"feature.warlock-warlock-subclass","level":3}],"trackers":[{"id":"origin-feat-magic-initiate","name":"feat-magic-initiate","max":1,"reset":"long","key":"feat-magic-initiate","display":"pips"},{"id":"class-warlock-magical-cunning","name":"warlock-magical-cunning","max":1,"reset":"long","key":"warlock-magical-cunning","display":"pips"}],"spells":[{"id":"spell.eldritch-blast","name":"Eldritch Blast","level":0,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.eldritch-blast"},{"id":"spell.minor-illusion","name":"Minor Illusion","level":0,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.minor-illusion"},{"id":"spell.hex","name":"Hex","level":1,"concentration":true,"ritual":false,"prepared":true,"notes":"","ref":"spell.hex"},{"id":"spell.charm-person","name":"Charm Person","level":1,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.charm-person"},{"id":"spell.misty-step","name":"Misty Step","level":2,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.misty-step"},{"id":"spell.hold-person","name":"Hold Person","level":2,"concentration":true,"ritual":false,"prepared":true,"notes":"","ref":"spell.hold-person"}],"subclassKey":"","origin":"quick"}';
  b_fighter2 constant jsonb := '{"classKey":"fighter","classLabel":"Fighter","subclass":"","speciesKey":"dwarf","speciesLabel":"Dwarf","backgroundKey":"soldier","backgroundLabel":"Soldier","alignment":"Lawful Neutral","abilityMethod":"standard","baseAbilities":{"str":15,"dex":13,"con":14,"int":8,"wis":12,"cha":10},"bonuses":{"str":2,"dex":0,"con":1,"int":0,"wis":0,"cha":0},"saves":["str","con"],"skills":{"athletics":"proficient","intimidation":"proficient","perception":"proficient","acrobatics":"proficient"},"hitDie":10,"speed":30,"acOverride":null,"casterKind":"none","spellAbility":null,"languages":"Common, Dwarvish","proficiencies":"","appearance":"Braided beard with iron rings.","notes":"Former caravan guard on the Salt Road.","features":[{"id":"species-darkvision","name":"Darkvision","source":"species","description":"","ref":"feature.species-dwarf-darkvision"},{"id":"species-dwarvenResilience","name":"Dwarven Resilience","source":"species","description":"","ref":"feature.species-dwarf-dwarven-resilience"},{"id":"species-dwarvenToughness","name":"Dwarven Toughness","source":"species","description":"","ref":"feature.species-dwarf-dwarven-toughness"},{"id":"species-stonecunning","name":"Stonecunning","source":"species","description":"","ref":"feature.species-dwarf-stonecunning"},{"id":"background-savageAttacker","name":"Savage Attacker","source":"feat","description":"","ref":"feature.feat-savage-attacker"},{"id":"srd-fighter-fighting-style","name":"Fighting Style","source":"class","description":"","ref":"feature.fighter-fighting-style","level":1},{"id":"srd-fighter-second-wind","name":"Second Wind","source":"class","description":"","ref":"feature.fighter-second-wind","level":1},{"id":"srd-fighter-weapon-mastery","name":"Weapon Mastery","source":"class","description":"","ref":"feature.fighter-weapon-mastery","level":1},{"id":"srd-fighter-action-surge","name":"Action Surge","source":"class","description":"","ref":"feature.fighter-action-surge","level":2},{"id":"srd-fighter-tactical-mind","name":"Tactical Mind","source":"class","description":"","ref":"feature.fighter-tactical-mind","level":2}],"trackers":[{"id":"class-fighter-second-wind","name":"fighter-second-wind","max":2,"reset":"long","key":"fighter-second-wind","display":"pips"},{"id":"origin-dwarf-stonecunning","name":"dwarf-stonecunning","max":2,"reset":"long","key":"dwarf-stonecunning","display":"pips"},{"id":"origin-feat-savage-attacker","name":"feat-savage-attacker","max":1,"reset":"short","key":"feat-savage-attacker","display":"pips","per":"turn"},{"id":"class-fighter-action-surge","name":"fighter-action-surge","max":1,"reset":"short","key":"fighter-action-surge","display":"pips"}],"spells":[],"subclassKey":"","origin":"quick"}';
  b_fighter3 constant jsonb := '{"classKey":"fighter","classLabel":"Fighter","subclass":"","speciesKey":"dwarf","speciesLabel":"Dwarf","backgroundKey":"soldier","backgroundLabel":"Soldier","alignment":"Lawful Neutral","abilityMethod":"standard","baseAbilities":{"str":15,"dex":13,"con":14,"int":8,"wis":12,"cha":10},"bonuses":{"str":2,"dex":0,"con":1,"int":0,"wis":0,"cha":0},"saves":["str","con"],"skills":{"athletics":"proficient","intimidation":"proficient","perception":"proficient","acrobatics":"proficient"},"hitDie":10,"speed":30,"acOverride":null,"casterKind":"none","spellAbility":null,"languages":"Common, Dwarvish","proficiencies":"","appearance":"Braided beard with iron rings.","notes":"Former caravan guard on the Salt Road.","features":[{"id":"species-darkvision","name":"Darkvision","source":"species","description":"","ref":"feature.species-dwarf-darkvision"},{"id":"species-dwarvenResilience","name":"Dwarven Resilience","source":"species","description":"","ref":"feature.species-dwarf-dwarven-resilience"},{"id":"species-dwarvenToughness","name":"Dwarven Toughness","source":"species","description":"","ref":"feature.species-dwarf-dwarven-toughness"},{"id":"species-stonecunning","name":"Stonecunning","source":"species","description":"","ref":"feature.species-dwarf-stonecunning"},{"id":"background-savageAttacker","name":"Savage Attacker","source":"feat","description":"","ref":"feature.feat-savage-attacker"},{"id":"srd-fighter-fighting-style","name":"Fighting Style","source":"class","description":"","ref":"feature.fighter-fighting-style","level":1},{"id":"srd-fighter-second-wind","name":"Second Wind","source":"class","description":"","ref":"feature.fighter-second-wind","level":1},{"id":"srd-fighter-weapon-mastery","name":"Weapon Mastery","source":"class","description":"","ref":"feature.fighter-weapon-mastery","level":1},{"id":"srd-fighter-action-surge","name":"Action Surge","source":"class","description":"","ref":"feature.fighter-action-surge","level":2},{"id":"srd-fighter-tactical-mind","name":"Tactical Mind","source":"class","description":"","ref":"feature.fighter-tactical-mind","level":2},{"id":"srd-fighter-fighter-subclass","name":"Fighter Subclass","source":"class","description":"","ref":"feature.fighter-fighter-subclass","level":3}],"trackers":[{"id":"class-fighter-second-wind","name":"fighter-second-wind","max":2,"reset":"long","key":"fighter-second-wind","display":"pips"},{"id":"origin-dwarf-stonecunning","name":"dwarf-stonecunning","max":2,"reset":"long","key":"dwarf-stonecunning","display":"pips"},{"id":"origin-feat-savage-attacker","name":"feat-savage-attacker","max":1,"reset":"short","key":"feat-savage-attacker","display":"pips","per":"turn"},{"id":"class-fighter-action-surge","name":"fighter-action-surge","max":1,"reset":"short","key":"fighter-action-surge","display":"pips"}],"spells":[],"subclassKey":"","origin":"quick"}';
  b_ranger constant jsonb := '{"classKey":"ranger","classLabel":"Ranger","subclass":"","speciesKey":"human","speciesLabel":"Human","backgroundKey":"soldier","backgroundLabel":"Soldier","alignment":"Neutral Good","abilityMethod":"standard","baseAbilities":{"str":12,"dex":15,"con":13,"int":10,"wis":14,"cha":8},"bonuses":{"str":0,"dex":2,"con":1,"int":0,"wis":0,"cha":0},"saves":["str","dex"],"skills":{"athletics":"proficient","intimidation":"proficient","perception":"proficient","survival":"proficient","nature":"proficient"},"hitDie":10,"speed":30,"acOverride":null,"casterKind":"half","spellAbility":"wis","languages":"","proficiencies":"","appearance":"","notes":"Retired to the reserve.","features":[{"id":"species-resourceful","name":"Resourceful","source":"species","description":"","ref":"feature.species-human-resourceful"},{"id":"species-skillful","name":"Skillful","source":"species","description":"","ref":"feature.species-human-skillful"},{"id":"species-versatile","name":"Versatile","source":"species","description":"","ref":"feature.species-human-versatile"},{"id":"background-savageAttacker","name":"Savage Attacker","source":"feat","description":"","ref":"feature.feat-savage-attacker"},{"id":"srd-ranger-favored-enemy","name":"Favored Enemy","source":"class","description":"","ref":"feature.ranger-favored-enemy","level":1},{"id":"srd-ranger-spellcasting","name":"Spellcasting","source":"class","description":"","ref":"feature.ranger-spellcasting","level":1},{"id":"srd-ranger-weapon-mastery","name":"Weapon Mastery","source":"class","description":"","ref":"feature.ranger-weapon-mastery","level":1},{"id":"srd-ranger-deft-explorer","name":"Deft Explorer","source":"class","description":"","ref":"feature.ranger-deft-explorer","level":2},{"id":"srd-ranger-fighting-style","name":"Fighting Style","source":"class","description":"","ref":"feature.ranger-fighting-style","level":2}],"trackers":[{"id":"class-ranger-favored-enemy","name":"ranger-favored-enemy","max":2,"reset":"long","key":"ranger-favored-enemy","display":"pips"},{"id":"origin-feat-savage-attacker","name":"feat-savage-attacker","max":1,"reset":"short","key":"feat-savage-attacker","display":"pips","per":"turn"}],"spells":[],"subclassKey":"","origin":"quick"}';
  b_cleric3 constant jsonb := '{"classKey":"cleric","classLabel":"Cleric","subclass":"","speciesKey":"human","speciesLabel":"Human","backgroundKey":"acolyte","backgroundLabel":"Acolyte","alignment":"Lawful Good","abilityMethod":"standard","baseAbilities":{"str":13,"dex":12,"con":14,"int":8,"wis":15,"cha":10},"bonuses":{"str":0,"dex":0,"con":0,"int":0,"wis":2,"cha":1},"saves":["wis","cha"],"skills":{"insight":"proficient","religion":"proficient","medicine":"proficient","persuasion":"proficient"},"hitDie":8,"speed":30,"acOverride":null,"casterKind":"full","spellAbility":"wis","languages":"Common, Halfling","proficiencies":"","appearance":"Salt-white cloak and a bell on a cord.","notes":"Keeps the lighthouse shrine. Waiting for a party.","features":[{"id":"species-resourceful","name":"Resourceful","source":"species","description":"","ref":"feature.species-human-resourceful"},{"id":"species-skillful","name":"Skillful","source":"species","description":"","ref":"feature.species-human-skillful"},{"id":"species-versatile","name":"Versatile","source":"species","description":"","ref":"feature.species-human-versatile"},{"id":"background-magicInitiateCleric","name":"Magic Initiate Cleric","source":"feat","description":"","ref":"feature.feat-magic-initiate"},{"id":"srd-cleric-divine-order","name":"Divine Order","source":"class","description":"","ref":"feature.cleric-divine-order","level":1},{"id":"srd-cleric-spellcasting","name":"Spellcasting","source":"class","description":"","ref":"feature.cleric-spellcasting","level":1},{"id":"srd-cleric-channel-divinity","name":"Channel Divinity","source":"class","description":"","ref":"feature.cleric-channel-divinity","level":2},{"id":"srd-cleric-divine-spark","name":"Divine Spark","source":"class","description":"","ref":"feature.cleric-divine-spark","level":2},{"id":"srd-cleric-turn-undead","name":"Turn Undead","source":"class","description":"","ref":"feature.cleric-turn-undead","level":2},{"id":"srd-cleric-cleric-subclass","name":"Cleric Subclass","source":"class","description":"","ref":"feature.cleric-cleric-subclass","level":3}],"trackers":[{"id":"origin-feat-magic-initiate","name":"feat-magic-initiate","max":1,"reset":"long","key":"feat-magic-initiate","display":"pips"},{"id":"class-cleric-channel-divinity","name":"cleric-channel-divinity","max":2,"reset":"long","key":"cleric-channel-divinity","display":"pips"}],"spells":[{"id":"spell.sacred-flame","name":"Sacred Flame","level":0,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.sacred-flame"},{"id":"spell.guidance","name":"Guidance","level":0,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.guidance"},{"id":"spell.light","name":"Light","level":0,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.light"},{"id":"spell.bless","name":"Bless","level":1,"concentration":true,"ritual":false,"prepared":true,"notes":"","ref":"spell.bless"},{"id":"spell.cure-wounds","name":"Cure Wounds","level":1,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.cure-wounds"},{"id":"spell.healing-word","name":"Healing Word","level":1,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.healing-word"},{"id":"spell.aid","name":"Aid","level":2,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.aid"},{"id":"spell.spiritual-weapon","name":"Spiritual Weapon","level":2,"concentration":true,"ritual":false,"prepared":true,"notes":"","ref":"spell.spiritual-weapon"}],"subclassKey":"","origin":"quick"}';
  b_rogue constant jsonb := '{"classKey":"rogue","classLabel":"Rogue","subclass":"","speciesKey":"halfling","speciesLabel":"Halfling","backgroundKey":"criminal","backgroundLabel":"Criminal","alignment":"Chaotic Good","abilityMethod":"standard","baseAbilities":{"str":8,"dex":15,"con":14,"int":13,"wis":12,"cha":10},"bonuses":{"str":0,"dex":2,"con":1,"int":0,"wis":0,"cha":0},"saves":["dex","int"],"skills":{"sleightOfHand":"proficient","stealth":"proficient","perception":"proficient","acrobatics":"proficient","investigation":"proficient","deception":"proficient"},"hitDie":8,"speed":30,"acOverride":null,"casterKind":"none","spellAbility":null,"languages":"Common, Halfling, Thieves Cant","proficiencies":"","appearance":"Always a step behind you.","notes":"Owes the ferryman three favours.","features":[{"id":"species-brave","name":"Brave","source":"species","description":"","ref":"feature.species-halfling-brave"},{"id":"species-halflingNimbleness","name":"Halfling Nimbleness","source":"species","description":"","ref":"feature.species-halfling-halfling-nimbleness"},{"id":"species-luck","name":"Luck","source":"species","description":"","ref":"feature.species-halfling-luck"},{"id":"species-naturallyStealthy","name":"Naturally Stealthy","source":"species","description":"","ref":"feature.species-halfling-naturally-stealthy"},{"id":"background-alert","name":"Alert","source":"feat","description":"","ref":"feature.feat-alert"},{"id":"srd-rogue-expertise","name":"Expertise","source":"class","description":"","ref":"feature.rogue-expertise","level":1},{"id":"srd-rogue-sneak-attack","name":"Sneak Attack","source":"class","description":"","ref":"feature.rogue-sneak-attack","level":1},{"id":"srd-rogue-thieves-cant","name":"Thieves'' Cant","source":"class","description":"","ref":"feature.rogue-thieves-cant","level":1},{"id":"srd-rogue-weapon-mastery","name":"Weapon Mastery","source":"class","description":"","ref":"feature.rogue-weapon-mastery","level":1},{"id":"srd-rogue-cunning-action","name":"Cunning Action","source":"class","description":"","ref":"feature.rogue-cunning-action","level":2}],"trackers":[{"id":"class-rogue-sneak-attack","name":"rogue-sneak-attack","max":1,"reset":"short","key":"rogue-sneak-attack","display":"pips","per":"turn"}],"spells":[],"subclassKey":"","origin":"quick"}';
  b_bard constant jsonb := '{"classKey":"bard","classLabel":"Bard","subclass":"","speciesKey":"gnome","speciesLabel":"Gnome","backgroundKey":"acolyte","backgroundLabel":"Acolyte","alignment":"Neutral","abilityMethod":"standard","baseAbilities":{"str":8,"dex":14,"con":13,"int":10,"wis":12,"cha":15},"bonuses":{"str":0,"dex":0,"con":0,"int":0,"wis":1,"cha":2},"saves":["dex","cha"],"skills":{"insight":"proficient","religion":"proficient","performance":"proficient","persuasion":"proficient","deception":"proficient"},"hitDie":8,"speed":30,"acOverride":null,"casterKind":"full","spellAbility":"cha","languages":"Common, Gnomish","proficiencies":"","appearance":"A lute missing one string.","notes":"Collects lantern songs.","features":[{"id":"species-darkvision","name":"Darkvision","source":"species","description":"","ref":"feature.species-gnome-darkvision"},{"id":"species-gnomishCunning","name":"Gnomish Cunning","source":"species","description":"","ref":"feature.species-gnome-gnomish-cunning"},{"id":"species-gnomishLineage","name":"Gnomish Lineage","source":"species","description":"","ref":"feature.species-gnome-gnomish-lineage"},{"id":"background-magicInitiateCleric","name":"Magic Initiate Cleric","source":"feat","description":"","ref":"feature.feat-magic-initiate"},{"id":"srd-bard-bardic-inspiration","name":"Bardic Inspiration","source":"class","description":"","ref":"feature.bard-bardic-inspiration","level":1},{"id":"srd-bard-spellcasting","name":"Spellcasting","source":"class","description":"","ref":"feature.bard-spellcasting","level":1},{"id":"srd-bard-expertise","name":"Expertise","source":"class","description":"","ref":"feature.bard-expertise","level":2},{"id":"srd-bard-jack-of-all-trades","name":"Jack of All Trades","source":"class","description":"","ref":"feature.bard-jack-of-all-trades","level":2}],"trackers":[{"id":"class-bard-bardic-inspiration","name":"bard-bardic-inspiration","max":3,"reset":"long","key":"bard-bardic-inspiration","display":"pips"},{"id":"origin-feat-magic-initiate","name":"feat-magic-initiate","max":1,"reset":"long","key":"feat-magic-initiate","display":"pips"}],"spells":[{"id":"spell.vicious-mockery","name":"Vicious Mockery","level":0,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.vicious-mockery"},{"id":"spell.healing-word","name":"Healing Word","level":1,"concentration":false,"ritual":false,"prepared":true,"notes":"","ref":"spell.healing-word"},{"id":"spell.faerie-fire","name":"Faerie Fire","level":1,"concentration":true,"ritual":false,"prepared":true,"notes":"","ref":"spell.faerie-fire"}],"subclassKey":"","origin":"quick"}';
  b_cleric constant jsonb := '{"classKey":"cleric","classLabel":"Cleric","subclass":"","speciesKey":"orc","speciesLabel":"Orc","backgroundKey":"acolyte","backgroundLabel":"Acolyte","alignment":"","abilityMethod":"standard","baseAbilities":{"str":13,"dex":12,"con":14,"int":8,"wis":15,"cha":10},"bonuses":{"str":0,"dex":0,"con":0,"int":0,"wis":2,"cha":1},"saves":["wis","cha"],"skills":{"insight":"proficient","religion":"proficient","medicine":"proficient","persuasion":"proficient"},"hitDie":8,"speed":30,"acOverride":null,"casterKind":"full","spellAbility":"wis","languages":"","proficiencies":"","appearance":"","notes":"Draft: still choosing a domain.","features":[{"id":"species-adrenalineRush","name":"Adrenaline Rush","source":"species","description":"","ref":"feature.species-orc-adrenaline-rush"},{"id":"species-darkvision","name":"Darkvision","source":"species","description":"","ref":"feature.species-orc-darkvision"},{"id":"species-relentlessEndurance","name":"Relentless Endurance","source":"species","description":"","ref":"feature.species-orc-relentless-endurance"},{"id":"background-magicInitiateCleric","name":"Magic Initiate Cleric","source":"feat","description":"","ref":"feature.feat-magic-initiate"},{"id":"srd-cleric-divine-order","name":"Divine Order","source":"class","description":"","ref":"feature.cleric-divine-order","level":1},{"id":"srd-cleric-spellcasting","name":"Spellcasting","source":"class","description":"","ref":"feature.cleric-spellcasting","level":1}],"trackers":[{"id":"origin-orc-adrenaline-rush","name":"orc-adrenaline-rush","max":2,"reset":"short","key":"orc-adrenaline-rush","display":"pips"},{"id":"origin-orc-relentless-endurance","name":"orc-relentless-endurance","max":1,"reset":"long","key":"orc-relentless-endurance","display":"pips"},{"id":"origin-feat-magic-initiate","name":"feat-magic-initiate","max":1,"reset":"long","key":"feat-magic-initiate","display":"pips"}],"spells":[],"subclassKey":"","origin":"quick"}';
  -- Generated ids.
  ch_oriel uuid; ch_bram uuid; ch_sefa uuid; ch_dagny uuid; ch_hollis uuid; ch_ysolde uuid;
  ch_wren uuid; ch_pell uuid; ch_juniper uuid;
  inv uuid; rev bigint; result jsonb; item jsonb; defs jsonb; d_lantern uuid; tpl_ghoul uuid;
  shop_gull uuid; shop_curios uuid; trade uuid; e_ambush uuid; e_cellar uuid;
  k_bandit1 uuid; k_bandit2 uuid; k_captain uuid; k_ghoul uuid; k_rat uuid; k_oriel uuid; k_sefa uuid;
  k_dagny uuid; k_bram uuid; scene_cellar uuid; scene_crossing uuid; scene_docks uuid; card uuid;
  potion_stack uuid; roll jsonb;
begin
  -- -------------------------------------------------------------------------------------------
  -- Guard: staging only.
  -- -------------------------------------------------------------------------------------------
  if to_regnamespace('pre') is not null or to_regnamespace('pre_private') is not null then
    raise exception 'Refused: schema pre exists, so this is not the staging project'; end if;
  if to_regclass('public.campaigns') is null or to_regclass('auth.users') is null then
    raise exception 'Refused: the application migrations are not applied here'; end if;
  if exists (select 1 from auth.users u where u.id <> all(seed_users)) then
    raise exception 'Refused: auth.users has accounts that are not staging seed accounts'; end if;
  if exists (select 1 from public.campaigns c where c.id <> all(seed_campaigns)) then
    raise exception 'Refused: public.campaigns has campaigns that are not staging seed campaigns'; end if;

  -- -------------------------------------------------------------------------------------------
  -- Removal of the seed rows (staging_unseed.sql runs exactly this block). The application's own
  -- path first: Mara leaves Hollowmere (as its only other active member she would block Teodor's
  -- deletion), then every seed account deletes itself with prepare_account_deletion and
  -- delete_my_account, in an order where nobody is the last DM of a campaign with members. A sweep
  -- then removes whatever is left, selected by the fixed seed ids only.
  -- -------------------------------------------------------------------------------------------
  delete from private.account_deletion_requests r where r.request_id = any(deletion_requests);
  if exists (select 1 from public.campaign_members m where m.campaign_id = c_mere and m.user_id = u_mara
      and m.active and m.role = 'player') then
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', u_mara::text, true),
      set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
    perform public.change_campaign_member(c_mere, u_mara, null);
    reset role;
  end if;
  for i in 1 .. array_length(leave_order, 1) loop
    who := leave_order[i];
    if exists (select 1 from auth.users u where u.id = who)
        and not exists (select 1 from private.account_blockers(who)) then
      set local role authenticated;
      perform set_config('request.jwt.claim.sub', who::text, true),
        set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
      perform public.prepare_account_deletion(deletion_requests[i]);
      perform public.delete_my_account('DELETE', deletion_requests[i]);
      reset role;
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  -- Sweep, in the order delete_my_account removes a campaign.
  delete from public.character_events where campaign_id = any(seed_campaigns);
  delete from public.inventory_events where campaign_id = any(seed_campaigns);
  delete from private.resource_requests r using public.characters ch
    where ch.id = r.character_id and ch.campaign_id = any(seed_campaigns);
  delete from public.campaign_invitations where campaign_id = any(seed_campaigns);
  delete from public.shop_orders where campaign_id = any(seed_campaigns);
  delete from public.item_proposals where campaign_id = any(seed_campaigns);
  delete from public.inventory_items where campaign_id = any(seed_campaigns);
  delete from public.shops where campaign_id = any(seed_campaigns);
  delete from public.campaigns where id = any(seed_campaigns);
  delete from private.character_requests where actor_id = any(seed_users);
  delete from private.combat_requests where actor_id = any(seed_users);
  delete from private.content_requests where actor_id = any(seed_users);
  delete from private.inventory_requests where actor_id = any(seed_users);
  delete from private.resource_requests where actor_id = any(seed_users);
  delete from private.sheet_requests where actor_id = any(seed_users);
  delete from private.tabletop_requests where actor_id = any(seed_users);
  delete from public.profiles where user_id = any(seed_users);
  delete from auth.users where id = any(seed_users);
  delete from private.account_deletion_requests r where r.request_id = any(deletion_requests);
  if exists (select 1 from auth.users u where u.id = any(seed_users))
      or exists (select 1 from public.campaigns c where c.id = any(seed_campaigns)) then
    raise exception 'Seed removal incomplete'; end if;


  -- -------------------------------------------------------------------------------------------
  -- Accounts (owner insert: Auth has no SQL path). No password, no identity, confirmed address.
  -- -------------------------------------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
      recovery_token, email_change_token_new, email_change)
    select '00000000-0000-0000-0000-000000000000'::uuid, x.id, 'authenticated', 'authenticated', x.email,
        null, now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('full_name', x.full_name, 'name', x.full_name, 'staging_seed', true),
        now(), now(), '', '', '', ''
      from (values (u_mara, 'mara.quill@example.test', 'Mara Quill'),
        (u_teo, 'teodor.venn@example.test', 'Teodor Venn'),
        (u_ilse, 'ilse.marrow@example.test', 'Ilse Marrow'),
        (u_corin, 'corin.ashby@example.test', 'Corin Ashby'),
        (u_nell, 'nell.pruett@example.test', 'Nell Pruett')) x(id, email, full_name);

  -- Usernames, each as its owner.
  set local role authenticated;
  foreach who in array seed_users loop
    perform set_config('request.jwt.claim.sub', who::text, true),
      set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    perform public.set_my_username(case who when u_mara then 'mara_quill' when u_teo then 'teodor_venn'
      when u_ilse then 'ilse_marrow' when u_corin then 'corin_ashby' else 'nell_pruett' end);
  end loop;

  -- -------------------------------------------------------------------------------------------
  -- Campaigns: exactly what create_campaign inserts, with fixed ids (owner insert, actor set).
  -- -------------------------------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  insert into public.campaigns (id, owner_id, name, description) values (c_salt, u_mara, 'The Salt Road',
    'A caravan road along the salt flats, a drowned bell under the Gull''s Rest inn, and the people who owe the ferryman.');
  insert into public.campaign_members (campaign_id, user_id, role) values (c_salt, u_mara, 'dm');
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  insert into public.campaigns (id, owner_id, name, description) values (c_mere, u_teo, 'Lanterns of Hollowmere',
    'A fen town where every lantern on the docks is lit for someone who has not come back yet.');
  insert into public.campaign_members (campaign_id, user_id, role) values (c_mere, u_teo, 'dm');
  set local role authenticated;

  -- The Salt Road: modules, dice in the app shown to the table, party level 3.
  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  perform public.set_campaign_modules(c_salt, array['party', 'inventory', 'shops', 'combat', 'glossary', 'tabletop']);
  perform public.set_dice_settings(c_salt, 'app', 'table', gen_random_uuid());
  perform public.set_party_level(c_salt, 3, gen_random_uuid());
  -- Invitations to the four Players, accepted by each.
  foreach who in array array[u_teo, u_ilse, u_corin, u_nell] loop
    perform set_config('request.jwt.claim.sub', u_mara::text, true),
      set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
    inv := public.invite_campaign_member(c_salt, (select case who when u_teo then 'teodor.venn@example.test'
      when u_ilse then 'ilse.marrow@example.test' when u_corin then 'corin.ashby@example.test'
      else 'nell.pruett@example.test' end));
    perform set_config('request.jwt.claim.sub', who::text, true),
      set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    perform public.respond_campaign_invitation(inv, true);
  end loop;

  -- Hollowmere: physical dice, rolls shown to the table; Ilse becomes the second DM.
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  perform public.set_campaign_modules(c_mere, array['party', 'inventory', 'tabletop']);
  perform public.set_dice_settings(c_mere, 'physical', 'table', gen_random_uuid());
  foreach who in array array[u_ilse, u_corin, u_nell, u_mara] loop
    perform set_config('request.jwt.claim.sub', u_teo::text, true),
      set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
    inv := public.invite_campaign_member(c_mere, (select case who when u_ilse then 'ilse.marrow@example.test'
      when u_corin then 'corin.ashby@example.test' when u_nell then 'nell.pruett@example.test'
      else 'mara.quill@example.test' end));
    perform set_config('request.jwt.claim.sub', who::text, true),
      set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    perform public.respond_campaign_invitation(inv, true);
  end loop;
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  perform public.change_campaign_member(c_mere, u_ilse, 'dm');

  -- -------------------------------------------------------------------------------------------
  -- Characters of The Salt Road: a full caster, a half caster, a pact caster and a martial.
  -- -------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  ch_oriel := public.create_own_character(c_salt, 'Oriel Thistlewood', gen_random_uuid());
  perform public.save_character_sheet(c_salt, ch_oriel, 0, 3, 20, 11, b_wizard, true, gen_random_uuid());
  -- One first-level slot spent; Heroic Inspiration from the last session.
  perform public.set_character_vitals(c_salt, ch_oriel, 1, 20, 0, 0, 0, 0, true, '{}',
    array[1, 0, 0, 0, 0, 0, 0, 0, 0], '{}', gen_random_uuid());

  perform set_config('request.jwt.claim.sub', u_ilse::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_ilse, 'role', 'authenticated')::text, true);
  ch_bram := public.create_own_character(c_salt, 'Bram Ashcombe', gen_random_uuid());
  perform public.save_character_sheet(c_salt, ch_bram, 0, 3, 28, 10, b_paladin, true, gen_random_uuid());
  -- Concentrating on Bless with one slot spent; part of Lay on Hands used.
  perform public.set_character_vitals(c_salt, ch_bram, 1, 28, 0, 0, 0, 0, false, '{}',
    array[1, 0, 0, 0, 0, 0, 0, 0, 0], '{"class-paladin-lay-on-hands": 5}', gen_random_uuid(), true, 'Bless');

  perform set_config('request.jwt.claim.sub', u_corin::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_corin, 'role', 'authenticated')::text, true);
  ch_sefa := public.create_own_character(c_salt, 'Sefa Nightbloom', gen_random_uuid());
  perform public.save_character_sheet(c_salt, ch_sefa, 0, 3, 24, 11, b_warlock, true, gen_random_uuid());
  -- One of the two second-level pact slots spent, concentrating on Hex.
  perform public.set_character_vitals(c_salt, ch_sefa, 1, 24, 0, 0, 0, 0, false, '{}',
    array[0, 1, 0, 0, 0, 0, 0, 0, 0], '{}', gen_random_uuid(), true, 'Hex');

  perform set_config('request.jwt.claim.sub', u_nell::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_nell, 'role', 'authenticated')::text, true);
  ch_dagny := public.create_own_character(c_salt, 'Dagny Stoutreed', gen_random_uuid());
  -- Level 2 now; the level-up to 3 below writes the audit entry.
  perform public.save_character_sheet(c_salt, ch_dagny, 0, 2, 20, 11, b_fighter2, true, gen_random_uuid());
  perform public.set_character_vitals(c_salt, ch_dagny, 1, 20, 0, 0, 0, 0, false, '{}',
    array[0, 0, 0, 0, 0, 0, 0, 0, 0], '{"class-fighter-second-wind": 1}', gen_random_uuid());
  -- A reserve character, completed and then archived.
  ch_hollis := public.create_own_character(c_salt, 'Hollis Reed', gen_random_uuid());
  perform public.save_character_sheet(c_salt, ch_hollis, 0, 2, 20, 13, b_ranger, true, gen_random_uuid());
  perform public.archive_character(c_salt, ch_hollis);

  -- A character the DM prepared and nobody has played yet (offered to Players to claim).
  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  ch_ysolde := public.create_character(c_salt, 'Ysolde Varr');
  perform public.save_character_sheet(c_salt, ch_ysolde, 0, 3, 24, 11, b_cleric3, true, gen_random_uuid());

  -- -------------------------------------------------------------------------------------------
  -- Characters of Hollowmere: a complete sheet, a draft and an absent character.
  -- -------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_corin::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_corin, 'role', 'authenticated')::text, true);
  ch_wren := public.create_own_character(c_mere, 'Wren Halloway', gen_random_uuid());
  perform public.save_character_sheet(c_mere, ch_wren, 0, 2, 17, 13, b_rogue, true, gen_random_uuid());
  perform public.set_character_vitals(c_mere, ch_wren, 1, 11, 0, 0, 0, 0, false, '{}',
    array[0, 0, 0, 0, 0, 0, 0, 0, 0], '{}', gen_random_uuid());

  perform set_config('request.jwt.claim.sub', u_nell::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_nell, 'role', 'authenticated')::text, true);
  ch_pell := public.create_own_character(c_mere, 'Pell Ambrose', gen_random_uuid());
  perform public.save_character_sheet(c_mere, ch_pell, 0, 1, 10, 11, b_cleric, false, gen_random_uuid());

  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  ch_juniper := public.create_own_character(c_mere, 'Juniper Fallow', gen_random_uuid());
  perform public.save_character_sheet(c_mere, ch_juniper, 0, 2, 15, 12, b_bard, true, gen_random_uuid());
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  perform public.set_character_absent(c_mere, ch_juniper, true);
  perform public.set_character_resources(c_mere, ch_wren, 0, 14.5, 2, 3, 0, gen_random_uuid());

  -- -------------------------------------------------------------------------------------------
  -- The Salt Road: purses, the basic catalogue, a homebrew item, equipment and a shop.
  -- -------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  perform public.set_character_resources(c_salt, ch_oriel, 0, 42.5, 4, 5, 0, gen_random_uuid());
  perform public.set_character_resources(c_salt, ch_bram, 0, 18, 4, 5, 0, gen_random_uuid());
  perform public.set_character_resources(c_salt, ch_sefa, 0, 25, 2, 3, 1, gen_random_uuid());
  perform public.set_character_resources(c_salt, ch_dagny, 0, 9.75, 4, 6, 0, gen_random_uuid());
  -- Basic items as the storeroom import sends them: name, both languages, mechanics, gp.
  result := public.import_basic_items(c_salt, jsonb_build_array(
    jsonb_build_object('key', 'longsword', 'name', 'Longsword', 'description', '', 'category', 'weapon',
      'icon', 'sword', 'slot_kind', 'one_hand', 'rarity', 'common', 'weight_lb', 3, 'value_gp', 15,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Longsword', 'description', ''),
        'es', jsonb_build_object('name', 'Espada larga', 'description', '')),
      'properties', '{"dice": "1d8", "damageType": "slashing", "versatileDice": "1d10", "mastery": "sap", "proficiency": "martial"}'::jsonb),
    jsonb_build_object('key', 'chainMail', 'name', 'Chain Mail', 'description', '', 'category', 'armor',
      'icon', 'shirt', 'slot_kind', 'body', 'rarity', 'common', 'weight_lb', 55, 'value_gp', 75,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Chain Mail', 'description', ''),
        'es', jsonb_build_object('name', 'Cota de malla', 'description', '')),
      'properties', '{"base": 16, "dexCap": 0, "strReq": 13, "stealthDisadvantage": true, "armorType": "heavy"}'::jsonb),
    jsonb_build_object('key', 'shield', 'name', 'Shield', 'description', '', 'category', 'shield',
      'icon', 'shield', 'slot_kind', 'shield', 'rarity', 'common', 'weight_lb', 6, 'value_gp', 10,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Shield', 'description', ''),
        'es', jsonb_build_object('name', 'Escudo', 'description', '')),
      'properties', '{"acBonus": 2}'::jsonb),
    jsonb_build_object('key', 'quarterstaff', 'name', 'Quarterstaff', 'description', '', 'category', 'weapon',
      'icon', 'wand-sparkles', 'slot_kind', 'one_hand', 'rarity', 'common', 'weight_lb', 4, 'value_gp', 0.2,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Quarterstaff', 'description', ''),
        'es', jsonb_build_object('name', 'Bast' || chr(243) || 'n', 'description', '')),
      'properties', '{"dice": "1d6", "damageType": "bludgeoning", "versatileDice": "1d8", "mastery": "topple", "proficiency": "simple"}'::jsonb),
    jsonb_build_object('key', 'dagger', 'name', 'Dagger', 'description', '', 'category', 'weapon',
      'icon', 'sword', 'slot_kind', 'one_hand', 'rarity', 'common', 'weight_lb', 1, 'value_gp', 2,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Dagger', 'description', ''),
        'es', jsonb_build_object('name', 'Daga', 'description', '')),
      'properties', '{"dice": "1d4", "damageType": "piercing", "finesse": true, "light": true, "thrown": true, "range": "20/60", "mastery": "nick", "proficiency": "simple"}'::jsonb),
    jsonb_build_object('key', 'potionOfHealing', 'name', 'Potion of Healing', 'description', '',
      'category', 'consumable', 'icon', 'flask-conical', 'slot_kind', 'none', 'rarity', 'common',
      'weight_lb', 0.5, 'value_gp', 50,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Potion of Healing', 'description', ''),
        'es', jsonb_build_object('name', 'Poci' || chr(243) || 'n de curaci' || chr(243) || 'n', 'description', '')),
      'properties', '{}'::jsonb),
    jsonb_build_object('key', 'rations', 'name', 'Rations', 'description', '', 'category', 'consumable',
      'icon', 'drumstick', 'slot_kind', 'none', 'rarity', 'common', 'weight_lb', 2, 'value_gp', 0.5,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Rations', 'description', ''),
        'es', jsonb_build_object('name', 'Raciones', 'description', '')),
      'properties', '{"rations": 1}'::jsonb),
    jsonb_build_object('key', 'waterskin', 'name', 'Waterskin', 'description', '', 'category', 'gear',
      'icon', 'droplets', 'slot_kind', 'none', 'rarity', 'common', 'weight_lb', 5, 'value_gp', 0.2,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Waterskin', 'description', ''),
        'es', jsonb_build_object('name', 'Cantimplora', 'description', '')),
      'properties', '{"water": 4}'::jsonb),
    jsonb_build_object('key', 'rope', 'name', 'Rope', 'description', '', 'category', 'gear',
      'icon', 'link', 'slot_kind', 'none', 'rarity', 'common', 'weight_lb', 5, 'value_gp', 1,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Rope', 'description', ''),
        'es', jsonb_build_object('name', 'Cuerda', 'description', '')),
      'properties', '{}'::jsonb),
    jsonb_build_object('key', 'torch', 'name', 'Torch', 'description', '', 'category', 'consumable',
      'icon', 'flame', 'slot_kind', 'none', 'rarity', 'common', 'weight_lb', 1, 'value_gp', 0.01,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Torch', 'description', ''),
        'es', jsonb_build_object('name', 'Antorcha', 'description', '')),
      'properties', '{}'::jsonb),
    jsonb_build_object('key', 'arrows', 'name', 'Arrow', 'description', '', 'category', 'ammo',
      'icon', 'feather', 'slot_kind', 'none', 'rarity', 'common', 'weight_lb', 0.05, 'value_gp', 0.05,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Arrow', 'description', ''),
        'es', jsonb_build_object('name', 'Flecha', 'description', '')),
      'properties', '{}'::jsonb),
    jsonb_build_object('key', 'shortbow', 'name', 'Shortbow', 'description', '', 'category', 'weapon',
      'icon', 'bow-arrow', 'slot_kind', 'two_hands', 'rarity', 'common', 'weight_lb', 2, 'value_gp', 25,
      'translations', jsonb_build_object('en', jsonb_build_object('name', 'Shortbow', 'description', ''),
        'es', jsonb_build_object('name', 'Arco corto', 'description', '')),
      'properties', '{"dice": "1d6", "damageType": "piercing", "ranged": true, "range": "80/320", "ammunition": "arrows", "mastery": "vex", "proficiency": "simple"}'::jsonb)
  ), gen_random_uuid(), false);
  -- key -> definition id
  select jsonb_object_agg(x ->> 'key', x ->> 'id') into defs from jsonb_array_elements(result -> 'created') x;
  result := public.save_item_definition(c_salt, null, null, jsonb_build_object('name', 'Drowned Bell Lantern',
    'description', 'A green-glass lantern that rings faintly when water is near. Found under the Gull''s Rest.',
    'category', 'gear', 'icon', 'lamp', 'rarity', 'rare', 'slot_kind', 'none', 'weight_lb', 2, 'value_gp', 150,
    'properties', '{}'::jsonb), gen_random_uuid());
  d_lantern := (result ->> 'id')::uuid;

  -- What the DM handed out, then equipped by the Players.
  perform public.grant_item(c_salt, ch_dagny, (defs ->> 'longsword')::uuid, 1, gen_random_uuid());
  perform public.grant_item(c_salt, ch_dagny, (defs ->> 'chainMail')::uuid, 1, gen_random_uuid());
  perform public.grant_item(c_salt, ch_dagny, (defs ->> 'shield')::uuid, 1, gen_random_uuid());
  perform public.grant_item(c_salt, ch_dagny, (defs ->> 'rations')::uuid, 5, gen_random_uuid());
  perform public.grant_item(c_salt, ch_bram, (defs ->> 'chainMail')::uuid, 1, gen_random_uuid());
  perform public.grant_item(c_salt, ch_bram, (defs ->> 'longsword')::uuid, 1, gen_random_uuid());
  perform public.grant_item(c_salt, ch_bram, (defs ->> 'waterskin')::uuid, 1, gen_random_uuid());
  perform public.grant_item(c_salt, ch_oriel, (defs ->> 'quarterstaff')::uuid, 1, gen_random_uuid());
  result := public.grant_item(c_salt, ch_oriel, (defs ->> 'potionOfHealing')::uuid, 2, gen_random_uuid());
  potion_stack := (result ->> 'item_id')::uuid;
  perform public.grant_item(c_salt, ch_oriel, (defs ->> 'rations')::uuid, 3, gen_random_uuid());
  perform public.grant_item(c_salt, ch_sefa, (defs ->> 'dagger')::uuid, 2, gen_random_uuid());
  perform public.grant_item(c_salt, ch_sefa, d_lantern, 1, gen_random_uuid());

  -- Each Player equips their own gear (the server recomputes the sheet's armor class).
  reset role;
  for result in select jsonb_build_object('who', c.user_id, 'item', i.id, 'rev', i.revision, 'slot',
        case d.slot_kind when 'one_hand' then 'main_hand' when 'shield' then 'off_hand' else d.slot_kind end)
      from public.inventory_items i
      join public.item_definitions d on d.campaign_id = i.campaign_id and d.id = i.definition_id
      join public.characters c on c.campaign_id = i.campaign_id and c.id = i.character_id
      where i.campaign_id = c_salt and d.slot_kind in ('one_hand', 'body', 'shield')
        and i.character_id in (ch_dagny, ch_bram, ch_oriel) and i.quantity = 1
      order by c.name, d.slot_kind loop
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', result ->> 'who', true),
      set_config('request.jwt.claims', json_build_object('sub', result ->> 'who', 'role', 'authenticated')::text, true);
    perform public.equip_item(c_salt, (result ->> 'item')::uuid, (result ->> 'rev')::bigint,
      result ->> 'slot', gen_random_uuid());
    reset role;
  end loop;
  set local role authenticated;

  -- The Brass Gull: open to the party, buys and sells on its own.
  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  shop_gull := public.save_shop(c_salt, null, null, jsonb_build_object('name', 'The Brass Gull',
    'description', 'Chandlery and general store on the quay. The owner weighs every coin twice.',
    'visibility', 'party', 'mode', 'auto', 'resale_percent', 50, 'is_open', true, 'kind', 'General store'),
    gen_random_uuid());
  perform public.add_listings(c_salt, shop_gull, jsonb_build_array(
    jsonb_build_object('definition_id', defs ->> 'potionOfHealing', 'stock', 3),
    jsonb_build_object('definition_id', defs ->> 'rope'),
    jsonb_build_object('definition_id', defs ->> 'torch', 'stock', 20),
    jsonb_build_object('definition_id', defs ->> 'arrows', 'stock', 60),
    jsonb_build_object('definition_id', defs ->> 'rations', 'stock', 30),
    jsonb_build_object('definition_id', defs ->> 'shortbow', 'stock', 1)), gen_random_uuid());
  perform public.save_listing(c_salt, shop_gull, null, null, jsonb_build_object('definition_id', d_lantern,
    'price', 150, 'stock', 1), gen_random_uuid());
  perform public.set_shop_modifier(c_salt, shop_gull, ch_sefa, -10);
  -- Saltglass Curios: hidden from everyone but Oriel, prices agreed with the DM.
  shop_curios := public.save_shop(c_salt, null, null, jsonb_build_object('name', 'Saltglass Curios',
    'description', 'A back room behind the net mender. Nothing on the shelves has a price tag.',
    'visibility', 'selected', 'mode', 'approval', 'resale_percent', 40, 'is_open', true, 'kind', 'Curiosities',
    'access', jsonb_build_array(ch_oriel)), gen_random_uuid());
  perform public.add_listings(c_salt, shop_curios, jsonb_build_array(
    jsonb_build_object('definition_id', defs ->> 'dagger', 'price', 3, 'stock', 2)), gen_random_uuid());

  -- Sefa buys two torches and a rope (with her 10% discount).
  reset role;
  select jsonb_object_agg(d.basic_key, l.id) into result from public.shop_listings l
    join public.item_definitions d on d.campaign_id = l.campaign_id and d.id = l.definition_id
    where l.shop_id = shop_gull and d.basic_key in ('torch', 'rope');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u_corin::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_corin, 'role', 'authenticated')::text, true);
  perform public.checkout(c_salt, shop_gull, ch_sefa, jsonb_build_array(
    jsonb_build_object('listing_id', result ->> 'torch', 'quantity', 2),
    jsonb_build_object('listing_id', result ->> 'rope', 'quantity', 1)), 'For the cellar.', gen_random_uuid());

  -- Bram asks the DM to add an heirloom to his sheet.
  perform set_config('request.jwt.claim.sub', u_ilse::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_ilse, 'role', 'authenticated')::text, true);
  perform public.propose_item(c_salt, ch_bram, jsonb_build_object('name', 'Grandmother''s prayer beads',
    'description', 'Twelve driftwood beads on a tarred cord.', 'category', 'treasure', 'icon', 'package',
    'rarity', 'common', 'slot_kind', 'none', 'weight_lb', 0), 1, gen_random_uuid());

  -- A finished trade: Oriel gives Dagny a potion for 5 gp.
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  result := public.invite_trade(c_salt, ch_oriel, ch_dagny, gen_random_uuid());
  trade := (result ->> 'trade_id')::uuid;
  perform set_config('request.jwt.claim.sub', u_nell::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_nell, 'role', 'authenticated')::text, true);
  result := public.respond_trade_invite(c_salt, trade, true, gen_random_uuid());
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  result := public.set_trade_offer(c_salt, trade, ch_oriel, (result ->> 'revision')::bigint,
    jsonb_build_array(jsonb_build_object('item_id', potion_stack, 'quantity', 1)), 0, gen_random_uuid());
  perform set_config('request.jwt.claim.sub', u_nell::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_nell, 'role', 'authenticated')::text, true);
  result := public.set_trade_offer(c_salt, trade, ch_dagny, (result ->> 'revision')::bigint, '[]'::jsonb, 5,
    gen_random_uuid());
  rev := (result ->> 'revision')::bigint;
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  result := public.confirm_trade(c_salt, trade, ch_oriel, rev, gen_random_uuid());
  perform set_config('request.jwt.claim.sub', u_nell::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_nell, 'role', 'authenticated')::text, true);
  result := public.confirm_trade(c_salt, trade, ch_dagny, (result ->> 'revision')::bigint, gen_random_uuid());
  if result ->> 'status' <> 'completed' then raise exception 'Seed: the trade did not complete (%)', result; end if;

  -- Dagny reaches level 3 (party level 3): the level-up audit entry.
  reset role;
  select s.revision into rev from public.character_sheets s where s.character_id = ch_dagny;
  set local role authenticated;
  perform public.apply_level_up(c_salt, ch_dagny, rev, 3, 28, b_fighter3, gen_random_uuid());

  -- -------------------------------------------------------------------------------------------
  -- Glossary and bestiary of The Salt Road.
  -- -------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  perform public.save_glossary_entry(c_salt, '00000000-5eed-4000-8005-000000000001', null, jsonb_build_object(
    'category', 'lore', 'name', 'The Gull''s Rest', 'aliases', jsonb_build_array('the inn'),
    'summary', 'Inn at Mile Nine of the Salt Road, built over a flooded chapel.',
    'body', 'The cellar floods at spring tide. Locals say a bell rings under the floor before a storm.',
    'facts', jsonb_build_array(jsonb_build_object('label', 'Keeper', 'value', 'Aldous Penhallow'))));
  perform public.save_glossary_entry(c_salt, '00000000-5eed-4000-8005-000000000002', null, jsonb_build_object(
    'category', 'rule', 'name', 'Salt fatigue', 'aliases', '[]'::jsonb,
    'summary', 'House rule: a day on the flats without water costs a level of exhaustion.',
    'body', 'Track water as rations. The DM marks exhaustion by hand.', 'facts', '[]'::jsonb));
  perform public.set_srd_bestiary(c_salt, 'download', null, gen_random_uuid());
  result := public.save_combatant_template(c_salt, null, null, jsonb_build_object('name', 'Brine-Touched Ghoul',
    'side', 'enemy', 'max_hp', 26, 'armor_class', 12, 'initiative_bonus', 2, 'hp_formula', '4d8+8',
    'challenge', '1', 'creature_type', 'undead',
    'notes', 'Rises from the flooded chapel when the bell rings. Paralysing claws.'), gen_random_uuid());
  tpl_ghoul := (result ->> 'id')::uuid;

  -- -------------------------------------------------------------------------------------------
  -- Rolls in The Salt Road with each visibility (the roll keeps the setting it was made under).
  -- -------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  perform public.log_roll(c_salt, ch_oriel, 'Arcana', '1d20+5', 'skill', 'app', null, null,
    '00000000-5eed-4000-8003-000000000001');
  perform set_config('request.jwt.claim.sub', u_nell::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_nell, 'role', 'authenticated')::text, true);
  perform public.log_roll(c_salt, ch_dagny, 'Longsword', '1d20+5', 'attack', 'app', null, null,
    '00000000-5eed-4000-8003-000000000002');
  perform public.log_roll(c_salt, ch_dagny, 'Longsword damage', '1d8+3', 'damage', 'app', null, null,
    '00000000-5eed-4000-8003-000000000003');
  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  perform public.set_dice_settings(c_salt, 'app', 'roller_dm', gen_random_uuid());
  perform public.log_roll(c_salt, null, 'Ambush perception', '1d20+2', 'custom', 'app', null, null,
    '00000000-5eed-4000-8003-000000000004');
  perform set_config('request.jwt.claim.sub', u_corin::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_corin, 'role', 'authenticated')::text, true);
  perform public.log_roll(c_salt, ch_sefa, 'Deception', '1d20+4', 'skill', 'app', null, null,
    '00000000-5eed-4000-8003-000000000005');
  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  perform public.set_dice_settings(c_salt, 'app', 'roller', gen_random_uuid());
  perform set_config('request.jwt.claim.sub', u_ilse::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_ilse, 'role', 'authenticated')::text, true);
  perform public.log_roll(c_salt, ch_bram, 'Wisdom save', '1d20+3', 'save', 'app', null, null,
    '00000000-5eed-4000-8003-000000000006');
  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  perform public.set_dice_settings(c_salt, 'app', 'roller_dm', gen_random_uuid());

  -- -------------------------------------------------------------------------------------------
  -- A closed encounter with its history: Ambush at Mile Nine.
  -- -------------------------------------------------------------------------------------------
  result := public.create_encounter(c_salt, 'Ambush at Mile Nine', gen_random_uuid());
  e_ambush := (result ->> 'encounter_id')::uuid;
  perform public.add_combatants(c_salt, e_ambush, jsonb_build_array(
    jsonb_build_object('kind', 'character', 'character_id', ch_oriel, 'initiative', 15),
    jsonb_build_object('kind', 'character', 'character_id', ch_bram, 'initiative', 8),
    jsonb_build_object('kind', 'character', 'character_id', ch_sefa, 'initiative', 12),
    jsonb_build_object('kind', 'character', 'character_id', ch_dagny, 'initiative', 18),
    jsonb_build_object('kind', 'npc', 'name', 'Bandit', 'srd_id', 'bandit', 'max_hp', 11, 'armor_class', 12,
      'initiative_bonus', 1, 'count', 2, 'share_initiative', true)), gen_random_uuid());
  reset role;
  select c.id into k_bandit1 from public.encounter_combatants c where c.encounter_id = e_ambush and c.name = 'Bandit 1';
  select c.id into k_bandit2 from public.encounter_combatants c where c.encounter_id = e_ambush and c.name = 'Bandit 2';
  select c.id into k_dagny from public.encounter_combatants c where c.encounter_id = e_ambush and c.character_id = ch_dagny;
  set local role authenticated;
  perform public.set_initiative(c_salt, k_bandit1, 13, 1, gen_random_uuid());
  perform public.set_encounter_status(c_salt, e_ambush, 'active', gen_random_uuid());
  perform public.apply_combat_hp(c_salt, e_ambush, 'damage', jsonb_build_array(
    jsonb_build_object('combatant_id', k_dagny, 'amount', 6)), gen_random_uuid());
  perform public.apply_combat_hp(c_salt, e_ambush, 'damage', jsonb_build_array(
    jsonb_build_object('combatant_id', k_bandit1, 'amount', 11),
    jsonb_build_object('combatant_id', k_bandit2, 'amount', 4)), gen_random_uuid());
  perform public.set_encounter_status(c_salt, e_ambush, 'ended', gen_random_uuid());

  -- -------------------------------------------------------------------------------------------
  -- The live encounter, collecting initiative: an aliased creature and a hidden one.
  -- -------------------------------------------------------------------------------------------
  result := public.create_encounter(c_salt, 'The Drowned Bell Cellar', gen_random_uuid());
  e_cellar := (result ->> 'encounter_id')::uuid;
  perform public.add_combatants(c_salt, e_cellar, jsonb_build_array(
    jsonb_build_object('kind', 'character', 'character_id', ch_oriel),
    jsonb_build_object('kind', 'character', 'character_id', ch_bram),
    jsonb_build_object('kind', 'character', 'character_id', ch_sefa),
    jsonb_build_object('kind', 'character', 'character_id', ch_dagny),
    jsonb_build_object('kind', 'npc', 'name', 'Bandit Captain', 'public_name', 'Hooded Stranger',
      'srd_id', 'bandit-captain', 'max_hp', 52, 'armor_class', 15, 'initiative_bonus', 3,
      'dm_notes', 'Works for the ferryman. Surrenders below 15 hit points.'),
    jsonb_build_object('kind', 'npc', 'template_id', tpl_ghoul, 'hidden', true),
    jsonb_build_object('kind', 'npc', 'name', 'Giant Rat', 'srd_id', 'giant-rat', 'max_hp', 7, 'armor_class', 13,
      'initiative_bonus', 3, 'count', 2, 'share_initiative', true)), gen_random_uuid());
  perform public.set_encounter_status(c_salt, e_cellar, 'initiative', gen_random_uuid());
  reset role;
  select c.id into k_captain from public.encounter_combatants c where c.encounter_id = e_cellar and c.name = 'Bandit Captain';
  select c.id into k_ghoul from public.encounter_combatants c where c.encounter_id = e_cellar and c.template_id = tpl_ghoul;
  select c.id into k_rat from public.encounter_combatants c where c.encounter_id = e_cellar and c.name = 'Giant Rat 1';
  select c.id into k_oriel from public.encounter_combatants c where c.encounter_id = e_cellar and c.character_id = ch_oriel;
  select c.id into k_sefa from public.encounter_combatants c where c.encounter_id = e_cellar and c.character_id = ch_sefa;
  select c.id into k_dagny from public.encounter_combatants c where c.encounter_id = e_cellar and c.character_id = ch_dagny;
  select c.id into k_bram from public.encounter_combatants c where c.encounter_id = e_cellar and c.character_id = ch_bram;
  set local role authenticated;
  perform public.set_initiative(c_salt, k_captain, 17, 3, gen_random_uuid());
  perform public.set_initiative(c_salt, k_ghoul, 9, 2, gen_random_uuid());
  perform public.set_initiative(c_salt, k_rat, 14, 3, gen_random_uuid());
  -- The DM enters Dagny's physical roll; Oriel and Sefa roll in the app and save the result;
  -- Bram has not rolled yet.
  perform public.set_initiative(c_salt, k_dagny, 12, 1, gen_random_uuid());
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  roll := public.log_roll(c_salt, ch_oriel, 'Initiative', '1d20+1', 'initiative', 'app', null, null,
    '00000000-5eed-4000-8003-000000000007');
  perform public.set_initiative(c_salt, k_oriel, (roll ->> 'total')::integer, 1, gen_random_uuid());
  perform set_config('request.jwt.claim.sub', u_corin::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_corin, 'role', 'authenticated')::text, true);
  roll := public.log_roll(c_salt, ch_sefa, 'Initiative', '1d20+1', 'initiative', 'app', null, null,
    '00000000-5eed-4000-8003-000000000008');
  perform public.set_initiative(c_salt, k_sefa, (roll ->> 'total')::integer, 1, gen_random_uuid());
  -- Sefa is not shared live with her teammates (the DM's choice).
  perform set_config('request.jwt.claim.sub', u_mara::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
  perform public.set_character_live_sharing(c_salt, ch_sefa, false);

  -- -------------------------------------------------------------------------------------------
  -- Tabletop of The Salt Road: a calibrated table screen, two scenes without uploaded images.
  -- -------------------------------------------------------------------------------------------
  perform public.set_tabletop_live(c_salt, jsonb_build_object('screen', jsonb_build_object('diagonal_in', 55,
    'px_w', 3840, 'px_h', 2160, 'base_mm', 25.4, 'fine', 1, 'flip', false)), gen_random_uuid());
  result := public.save_tabletop_scene(c_salt, null, jsonb_build_object('name', 'Drowned Bell Cellar',
    'ground', 'stone', 'cols', 24, 'rows', 18, 'grid_visible', true, 'fog_enabled', true,
    'rooms', jsonb_build_array(jsonb_build_object('id', 'cellar', 'rects', '[[2, 2, 11, 9]]'::jsonb),
      jsonb_build_object('id', 'chapel', 'rects', '[[14, 3, 8, 8]]'::jsonb))), null, gen_random_uuid());
  scene_cellar := (result ->> 'id')::uuid;
  perform public.put_tabletop_items(c_salt, scene_cellar, jsonb_build_array(
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000001', 'kind', 'token', 'x', 4, 'y', 8,
      'character_id', ch_oriel, 'label', 'Oriel', 'data', '{"color": "azure", "size": "medium"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000002', 'kind', 'token', 'x', 5, 'y', 8,
      'character_id', ch_bram, 'label', 'Bram', 'data', '{"color": "amber", "size": "medium"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000003', 'kind', 'token', 'x', 4, 'y', 9,
      'character_id', ch_sefa, 'label', 'Sefa', 'data', '{"color": "violet", "size": "medium"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000004', 'kind', 'token', 'x', 5, 'y', 9,
      'character_id', ch_dagny, 'label', 'Dagny', 'data', '{"color": "forest", "size": "medium"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000005', 'kind', 'token', 'x', 10, 'y', 4,
      'combatant_id', k_captain, 'label', 'Hooded Stranger', 'data', '{"color": "slate", "size": "medium"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000006', 'kind', 'token', 'x', 17, 'y', 6,
      'combatant_id', k_ghoul, 'label', 'Brine-Touched Ghoul', 'hidden', true,
      'data', '{"color": "crimson", "size": "medium"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000007', 'kind', 'token', 'x', 8, 'y', 3,
      'combatant_id', k_rat, 'label', 'Giant Rat', 'data', '{"color": "ochre", "size": "small"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000008', 'kind', 'door', 'x', 13, 'y', 6,
      'data', '{"state": "locked", "rooms": ["cellar", "chapel"]}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000009', 'kind', 'prop', 'x', 3, 'y', 3,
      'data', '{"prop": "barrel"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-00000000000a', 'kind', 'prop', 'x', 19, 'y', 4,
      'data', '{"prop": "altar"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-00000000000b', 'kind', 'note', 'x', 18, 'y', 8,
      'secret', '{"text": "The ghoul waits behind the altar until someone rings the bell."}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-00000000000c', 'kind', 'event', 'x', 13, 'y', 7,
      'secret', jsonb_build_object('text', 'Opening the door reveals the chapel.',
        'actions', '{"reveal_room": "chapel", "sound": "gong"}'::jsonb))), gen_random_uuid());
  result := public.save_tabletop_scene(c_salt, null, jsonb_build_object('name', 'Mile Nine Crossing',
    'ground', 'grass', 'cols', 30, 'rows', 20, 'grid_visible', false, 'fog_enabled', false), null, gen_random_uuid());
  scene_crossing := (result ->> 'id')::uuid;
  perform public.put_tabletop_items(c_salt, scene_crossing, jsonb_build_array(
    jsonb_build_object('id', '00000000-5eed-4000-8002-00000000000d', 'kind', 'prop', 'x', 12, 'y', 9,
      'data', '{"prop": "cart"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-00000000000e', 'kind', 'prop', 'x', 16, 'y', 11,
      'data', '{"prop": "campfire", "light_radius": 4, "light_on": true}'::jsonb)), gen_random_uuid());
  result := public.save_tabletop_card(c_salt, null, jsonb_build_object('title', 'A note nailed to the door',
    'body', 'Ring once for the keeper. Never ring twice.'), gen_random_uuid());
  card := (result ->> 'id')::uuid;
  perform public.set_tabletop_live(c_salt, jsonb_build_object('scene_id', scene_cellar, 'view_x', 8, 'view_y', 6),
    gen_random_uuid());

  -- -------------------------------------------------------------------------------------------
  -- Hollowmere: an uncalibrated tabletop, physical rolls and an open short rest.
  -- -------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  result := public.save_tabletop_scene(c_mere, null, jsonb_build_object('name', 'Hollowmere Docks',
    'ground', 'wood', 'cols', 20, 'rows', 14), null, gen_random_uuid());
  scene_docks := (result ->> 'id')::uuid;
  perform public.put_tabletop_items(c_mere, scene_docks, jsonb_build_array(
    jsonb_build_object('id', '00000000-5eed-4000-8002-00000000000f', 'kind', 'token', 'x', 6, 'y', 7,
      'character_id', ch_wren, 'label', 'Wren', 'data', '{"color": "forest", "size": "small"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000010', 'kind', 'prop', 'x', 9, 'y', 6,
      'data', '{"prop": "crate"}'::jsonb),
    jsonb_build_object('id', '00000000-5eed-4000-8002-000000000011', 'kind', 'prop', 'x', 11, 'y', 6,
      'data', '{"prop": "brazier", "light_radius": 3, "light_on": true}'::jsonb)), gen_random_uuid());
  perform public.set_tabletop_live(c_mere, jsonb_build_object('scene_id', scene_docks), gen_random_uuid());
  perform public.log_roll(c_mere, null, 'Lantern omen', '1d6', 'custom', 'recorded', array[4]::smallint[], 4,
    '00000000-5eed-4000-8003-000000000009');
  perform set_config('request.jwt.claim.sub', u_corin::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_corin, 'role', 'authenticated')::text, true);
  perform public.log_roll(c_mere, ch_wren, 'Stealth', '1d20+5', 'skill', 'recorded', array[14]::smallint[], 19,
    '00000000-5eed-4000-8003-00000000000a');
  -- The DM calls a short rest; Wren says yes spending one hit die, Pell has not answered.
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  perform public.request_rest(c_mere, 'short', '00000000-5eed-4000-8004-000000000001');
  perform set_config('request.jwt.claim.sub', u_corin::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_corin, 'role', 'authenticated')::text, true);
  perform public.log_roll(c_mere, ch_wren, 'Hit die', '1d8+1', 'hit_die', 'recorded', array[5]::smallint[], 6,
    '00000000-5eed-4000-8003-00000000000b');
  perform public.vote_rest(c_mere, '00000000-5eed-4000-8004-000000000001', ch_wren, 'yes', 1, 5);
  -- One pending invitation, to an address without an account.
  perform set_config('request.jwt.claim.sub', u_teo::text, true),
    set_config('request.jwt.claims', json_build_object('sub', u_teo, 'role', 'authenticated')::text, true);
  perform public.invite_campaign_member(c_mere, 'newcomer@example.test');

  -- Done: back to the owner, no actor.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  if (select status from public.rest_requests where id = '00000000-5eed-4000-8004-000000000001') <> 'open' then
    raise exception 'Seed: the short rest is not open'; end if;
end;
$seed$;
