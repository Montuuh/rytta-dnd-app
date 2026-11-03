"""Hand-curated glossary data (RYT-008).

Abilities, skills and damage types are transcribed from the SRD 5.2.1 tables ("Ability
Descriptions", "Ability Check Examples", "Saving Throw Examples", "Skills", "Damage Types").
Quick facts ("facts") are Rytta's own summaries of SRD 5.2.1 rules: an adaptation under
CC-BY-4.0, recorded in docs/decisions/023-glossary.md. Each fact is (key, English, Spanish).
Fact keys are rendered with localized labels and icons by src/features/glossary.
"""

ABILITIES = [
    # id, EN name, ES name, EN measures, ES measures, EN check, ES check, EN save, ES save, page EN, page ES
    ("strength", "Strength", "Fuerza", "Physical might", "Poderío físico",
     "Lift, push, pull, or break something.", "Levantar, empujar, tirar o romper algo.",
     "Physically resist direct force.", "Resistir físicamente una fuerza directa."),
    ("dexterity", "Dexterity", "Destreza", "Agility, reflexes, and balance", "Agilidad, reflejos y equilibrio",
     "Move nimbly, quickly, or quietly.", "Moverte de forma ágil, rápida o silenciosa.",
     "Dodge out of harm’s way.", "Esquivar una amenaza."),
    ("constitution", "Constitution", "Constitución", "Health and stamina", "Salud y aguante",
     "Push your body beyond normal limits.", "Rebasar tus capacidades físicas normales.",
     "Endure a toxic hazard.", "Resistir un peligro tóxico."),
    ("intelligence", "Intelligence", "Inteligencia", "Reasoning and memory", "Raciocinio y memoria",
     "Reason or remember.", "Razonar o recordar algo.",
     "Recognize an illusion as fake.", "Identificar una ilusión como falsa."),
    ("wisdom", "Wisdom", "Sabiduría", "Perceptiveness and mental fortitude", "Perspicacia y fortaleza mental",
     "Notice things in the environment or in creatures’ behavior.",
     "Percatarte de algo en tu entorno o en la conducta de las criaturas.",
     "Resist a mental assault.", "Resistir una agresión mental."),
    ("charisma", "Charisma", "Carisma", "Confidence, poise, and charm", "Confianza, aplomo y encanto",
     "Influence, entertain, or deceive.", "Influir, entretener o engañar.",
     "Assert your identity.", "Reafirmar tu identidad."),
]

ABILITY_ATTACK = {
    "strength": ("Melee attacks with a weapon or an Unarmed Strike use Strength.",
                 "Los ataques cuerpo a cuerpo con un arma o un ataque sin armas usan la Fuerza."),
    "dexterity": ("Ranged attacks with a weapon use Dexterity.",
                  "Los ataques a distancia con un arma usan la Destreza."),
}

ABILITY_SHORT = {
    "strength": ("STR", "FUE"), "dexterity": ("DEX", "DES"), "constitution": ("CON", "CON"),
    "intelligence": ("INT", "INT"), "wisdom": ("WIS", "SAB"), "charisma": ("CHA", "CAR"),
}

SKILLS = [
    # id, EN, ES, ability id, EN example, ES example
    ("acrobatics", "Acrobatics", "Acrobacias", "dexterity",
     "Stay on your feet in a tricky situation, or perform an acrobatic stunt.",
     "Conservar el equilibrio en situaciones difíciles o realizar una proeza acrobática."),
    ("animal-handling", "Animal Handling", "Trato con animales", "wisdom",
     "Calm or train an animal, or get an animal to behave in a certain way.",
     "Tranquilizar o adiestrar a un animal, o conseguir que se comporte de una determinada forma."),
    ("arcana", "Arcana", "Conocimiento arcano", "intelligence",
     "Recall lore about spells, magic items, and the planes of existence.",
     "Recordar información acerca de conjuros, objetos mágicos y los planos de existencia."),
    ("athletics", "Athletics", "Atletismo", "strength",
     "Jump farther than normal, stay afloat in rough water, or break something.",
     "Saltar más lejos de lo normal, mantenerse a flote en aguas revueltas o romper algo."),
    ("deception", "Deception", "Engaño", "charisma",
     "Tell a convincing lie, or wear a disguise convincingly.",
     "Contar una mentira convincente o llevar un disfraz de manera creíble."),
    ("history", "History", "Historia", "intelligence",
     "Recall lore about historical events, people, nations, and cultures.",
     "Recordar información sobre acontecimientos, personas, naciones y culturas de carácter histórico."),
    ("insight", "Insight", "Perspicacia", "wisdom",
     "Discern a person’s mood and intentions.",
     "Discernir el estado de ánimo y las intenciones de una persona."),
    ("intimidation", "Intimidation", "Intimidación", "charisma",
     "Awe or threaten someone into doing what you want.",
     "Asustar o amenazar a alguien para que haga lo que tú quieres."),
    ("investigation", "Investigation", "Investigación", "intelligence",
     "Find obscure information in books, or deduce how something works.",
     "Encontrar información oculta en libros o deducir cómo funciona algo."),
    ("medicine", "Medicine", "Medicina", "wisdom",
     "Diagnose an illness, or determine what killed the recently slain.",
     "Diagnosticar una enfermedad o determinar de qué ha muerto un fallecido reciente."),
    ("nature", "Nature", "Naturaleza", "intelligence",
     "Recall lore about terrain, plants, animals, and weather.",
     "Recordar información acerca del terreno, la flora, la fauna y el clima."),
    ("perception", "Perception", "Percepción", "wisdom",
     "Using a combination of senses, notice something that’s easy to miss.",
     "Mediante una combinación de sentidos, darse cuenta de algo que es fácil pasar por alto."),
    ("performance", "Performance", "Interpretación", "charisma",
     "Act, tell a story, perform music, or dance.",
     "Actuar, contar una historia, tocar un instrumento o bailar."),
    ("persuasion", "Persuasion", "Persuasión", "charisma",
     "Honestly and graciously convince someone of something.",
     "Convencer a alguien de algo de una manera sincera y amable."),
    ("religion", "Religion", "Religión", "intelligence",
     "Recall lore about gods, religious rituals, and holy symbols.",
     "Recordar información sobre dioses, rituales religiosos y símbolos sagrados."),
    ("sleight-of-hand", "Sleight of Hand", "Juego de manos", "dexterity",
     "Pick a pocket, conceal a handheld object, or perform legerdemain.",
     "Vaciar los bolsillos a alguien, ocultar un objeto que llevas en la mano o hacer trucos de prestidigitación."),
    ("stealth", "Stealth", "Sigilo", "dexterity",
     "Escape notice by moving quietly and hiding behind things.",
     "Pasar desapercibido al caminar en silencio y ocultarse detrás de las cosas."),
    ("survival", "Survival", "Supervivencia", "wisdom",
     "Follow tracks, forage, find a trail, or avoid natural hazards.",
     "Seguir huellas, forrajear, encontrar un camino o evitar peligros naturales."),
]

DAMAGE_TYPES = [
    ("acid", "Acid", "Ácido", "Corrosive liquids, digestive enzymes", "Enzimas digestivas, líquidos corrosivos"),
    ("bludgeoning", "Bludgeoning", "Contundente", "Blunt objects, constriction, falling", "Aplastamientos, caídas, objetos romos"),
    ("cold", "Cold", "Frío", "Freezing water, icy blasts", "Agua gélida, ráfagas heladas"),
    ("fire", "Fire", "Fuego", "Flames, unbearable heat", "Calor insoportable, llamas"),
    ("force", "Force", "Fuerza", "Pure magical energy", "Energía mágica pura"),
    ("lightning", "Lightning", "Relámpago", "Electricity", "Electricidad"),
    ("necrotic", "Necrotic", "Necrótico", "Life-draining energy", "Energía que absorbe la vida"),
    ("piercing", "Piercing", "Perforante", "Fangs, puncturing objects", "Colmillos, objetos punzantes"),
    ("poison", "Poison", "Veneno", "Toxic gas, venom", "Gas tóxico, veneno"),
    ("psychic", "Psychic", "Psíquico", "Mind-rending energy", "Energía que desgarra la mente"),
    ("radiant", "Radiant", "Radiante", "Holy energy, searing radiation", "Energía sagrada, radiación abrasadora"),
    ("slashing", "Slashing", "Cortante", "Claws, cutting objects", "Garras, objetos cortantes"),
    ("thunder", "Thunder", "Trueno", "Concussive sound", "Sonido conmocionador"),
]

WEAPON_PROPERTIES_EN_ES = {
    "Ammunition": "Munición", "Finesse": "Sutil", "Heavy": "Pesada", "Light": "Ligera",
    "Loading": "Recarga", "Range": "Alcance", "Reach": "Gran alcance", "Thrown": "Arrojadiza",
    "Two-Handed": "A dos manos", "Versatile": "Versátil",
}
MASTERIES_EN_ES = {
    "Cleave": "Hender", "Graze": "Rozar", "Nick": "Mellar", "Push": "Empujar", "Sap": "Debilitar",
    "Slow": "Ralentizar", "Topple": "Derribar", "Vex": "Molestar",
}

# Extra search aliases. Spanish aliases include the names already used by Rytta's interface
# (e.g. "Agotamiento", "Arcanos") and gendered/plural forms of conditions for auto-linking.
ALIASES = {
    "condition.exhaustion": (["Exhausted"], ["Agotamiento", "Agotado", "Agotada", "Cansado", "Cansada"]),
    "condition.blinded": ([], ["Cegada", "Cegados", "Cegadas"]),
    "condition.charmed": ([], ["Hechizada", "Hechizados", "Hechizadas"]),
    "condition.deafened": ([], ["Ensordecida", "Ensordecidos", "Ensordecidas"]),
    "condition.frightened": ([], ["Asustada", "Asustados", "Asustadas"]),
    "condition.grappled": ([], ["Agarrada", "Agarrados", "Agarradas"]),
    "condition.incapacitated": ([], ["Incapacitada", "Incapacitados", "Incapacitadas"]),
    "condition.paralyzed": (["Paralysed"], ["Paralizada", "Paralizados", "Paralizadas"]),
    "condition.petrified": ([], ["Petrificada", "Petrificados", "Petrificadas"]),
    "condition.poisoned": ([], ["Envenenada", "Envenenados", "Envenenadas"]),
    "condition.prone": ([], ["Derribada", "Derribados", "Derribadas", "Tumbado"]),
    "condition.restrained": ([], ["Apresada", "Apresados", "Apresadas", "Neutralizado"]),
    "condition.stunned": ([], ["Aturdida", "Aturdidos", "Aturdidas"]),
    "condition.unconscious": ([], ["Inconscientes"]),
    "action.dash": ([], ["Carrera"]),
    "action.utilize": (["Use an Object"], ["Usar un objeto"]),
    "action.magic": (["Cast a Spell"], ["Lanzar un conjuro"]),
    "action.ready": ([], ["Preparar"]),
    "skill.arcana": ([], ["Arcanos", "Arcanas"]),
    "skill.animal-handling": ([], ["Trato con Animales"]),
    "skill.sleight-of-hand": ([], ["Juego de Manos"]),
    "rule.armor-class": (["AC"], ["CA"]),
    "rule.hit-points": (["HP"], ["PG"]),
    "rule.temporary-hit-points": (["Temp HP"], ["PG temporales"]),
    "rule.hit-point-dice": (["Hit Dice", "Hit Die"], ["Dados de golpe", "Dado de golpe"]),
    "rule.difficulty-class": (["DC"], ["CD"]),
    "rule.death-saving-throw": (["Death Save", "Death Saves", "Death Saving Throws"],
                                ["Salvación contra muerte", "Salvaciones contra muerte"]),
    "rule.saving-throw": (["Saving Throws"], ["Tiradas de salvación"]),
    "rule.proficiency": (["Proficiency Bonus"], ["Bonificador por competencia"]),
    "rule.critical-hit": (["Critical Hits"], ["Golpe crítico", "Críticos"]),
    "rule.opportunity-attacks": (["Opportunity Attack"], ["Ataque de oportunidad"]),
    "rule.heroic-inspiration": (["Inspiration"], ["Inspiración"]),
    "rule.bonus-action": (["Bonus Actions"], ["Acciones adicionales"]),
    "rule.spellcasting-focus": ([], ["Foco de lanzamiento de conjuros"]),
    "hazard.burning": ([], ["En llamas", "Ardiendo"]),
    "rule.long-rest": ([], ["Descansos largos"]),
    "rule.short-rest": ([], ["Descansos cortos"]),
    "rule.attack-roll": (["Attack Rolls"], ["Tiradas de ataque"]),
    "rule.ability-check": (["Ability Checks"], ["Pruebas de característica"]),
    "rule.damage-roll": (["Damage Rolls"], ["Tiradas de daño"]),
    "rule.d20-test": (["D20 Tests"], ["Pruebas con d20"]),
    "rule.unarmed-strike": (["Unarmed Strikes"], ["Ataques sin armas"]),
    "rule.difficult-terrain": ([], ["Terrenos difíciles"]),
    "rule.cantrip": (["Cantrips"], ["Trucos"]),
    "property.two-handed": (["Two Hands"], ["Dos manos"]),
}

# Entries whose names are too generic to auto-link inside prose. They stay searchable and can
# still be linked explicitly by id.
NO_AUTOLINK = {
    "rule.action", "rule.adventure", "rule.ally", "rule.campaign", "rule.creature", "rule.damage",
    "rule.enemy", "rule.encounter", "rule.monster", "rule.object", "rule.size", "rule.target",
    "rule.weapon", "rule.spell", "rule.condition", "rule.hazard", "rule.possession", "rule.dead",
    "rule.stable", "rule.reach", "rule.save", "rule.round-down", "rule.per-day", "rule.healing",
    "rule.player-character", "rule.character-sheet", "rule.resistance", "rule.immunity",
    "rule.speed", "rule.skill", "rule.attitude", "rule.creature-type", "rule.illusions",
    "rule.curses", "rule.surprise", "rule.ritual", "rule.alignment", "rule.flying", "rule.swimming",
    "rule.climbing", "rule.jumping", "rule.hover", "rule.telepathy", "rule.teleportation",
    "area.line", "area.cube", "area.sphere", "area.cone", "area.cylinder", "area.emanation",
    "hazard.burning", "action.attack", "action.magic", "action.search", "action.help", "action.study",
    "action.ready", "action.influence", "action.utilize", "action.hide",
    "attitude.friendly", "attitude.hostile", "attitude.indifferent",
    "property.range", "property.light", "property.heavy", "property.reach", "property.ammunition",
    "property.loading", "mastery.push", "mastery.slow", "mastery.topple", "mastery.nick",
    "mastery.sap", "mastery.vex", "mastery.cleave", "mastery.graze",
    "damage.fire", "damage.force", "damage.poison", "damage.cold", "damage.lightning", "damage.thunder",
    "ability.strength",
}

SUMMARIES = {
    "condition.blinded": ("You can’t see; attacks against you have Advantage and yours have Disadvantage.",
                          "No ves; los ataques contra ti tienen ventaja y los tuyos, desventaja."),
    "condition.charmed": ("You can’t harm the charmer, who has Advantage on social checks against you.",
                          "No puedes dañar a quien te hechizó, que tiene ventaja en pruebas sociales contra ti."),
    "condition.deafened": ("You can’t hear and automatically fail checks that require hearing.",
                           "No oyes y fallas automáticamente las pruebas que requieran oído."),
    "condition.exhaustion": ("Cumulative levels: −2 per level on every D20 Test and slower Speed; level 6 is death.",
                             "Niveles acumulativos: −2 por nivel a cada prueba con d20 y menos velocidad; el nivel 6 es la muerte."),
    "condition.frightened": ("Disadvantage while you can see the source of fear, and you can’t approach it.",
                             "Desventaja mientras veas la fuente del miedo, y no puedes acercarte a ella."),
    "condition.grappled": ("Speed 0, Disadvantage against anyone but the grappler, and you can be dragged.",
                           "Velocidad 0, desventaja contra cualquiera salvo quien te agarra, y pueden arrastrarte."),
    "condition.incapacitated": ("No actions, Bonus Actions or Reactions; you can’t speak and lose Concentration.",
                                "Sin acciones, acciones adicionales ni reacciones; no puedes hablar y pierdes la concentración."),
    "condition.invisible": ("Can’t be seen: attacks against you have Disadvantage and yours have Advantage.",
                            "No se te puede ver: los ataques contra ti tienen desventaja y los tuyos, ventaja."),
    "condition.paralyzed": ("Incapacitated with Speed 0; you fail Str/Dex saves and nearby hits are critical.",
                            "Incapacitado con velocidad 0; fallas las salvaciones de FUE/DES y los impactos cercanos son críticos."),
    "condition.petrified": ("Turned to stone: Incapacitated, Speed 0, resistant to all damage.",
                            "Convertido en piedra: incapacitado, velocidad 0 y resistente a todo el daño."),
    "condition.poisoned": ("Disadvantage on attack rolls and ability checks.",
                           "Desventaja en tiradas de ataque y pruebas de característica."),
    "condition.prone": ("You crawl or spend half your Speed to stand; close attacks against you have Advantage.",
                        "Te arrastras o gastas la mitad de tu velocidad en levantarte; los ataques cercanos contra ti tienen ventaja."),
    "condition.restrained": ("Speed 0; attacks against you have Advantage, yours and Dex saves have Disadvantage.",
                             "Velocidad 0; los ataques contra ti tienen ventaja, y los tuyos y tus salvaciones de DES, desventaja."),
    "condition.stunned": ("Incapacitated; you fail Str/Dex saves and attacks against you have Advantage.",
                          "Incapacitado; fallas las salvaciones de FUE/DES y los ataques contra ti tienen ventaja."),
    "condition.unconscious": ("Incapacitated and Prone, unaware; nearby hits against you are critical.",
                              "Incapacitado y derribado, sin consciencia; los impactos cercanos contra ti son críticos."),
}

F = "facts"
FACTS = {
    "condition.blinded": [
        ("effect", "Can’t see; automatically fail any ability check that requires sight.",
         "No ves; fallas automáticamente las pruebas de característica que requieran la vista."),
        ("attack", "Attacks against you have Advantage; your attacks have Disadvantage.",
         "Los ataques contra ti tienen ventaja; los tuyos, desventaja."),
    ],
    "condition.charmed": [
        ("effect", "You can’t attack the charmer or target it with damaging abilities or magical effects.",
         "No puedes atacar a quien te hechizó ni elegirlo como objetivo de capacidades dañinas o efectos mágicos."),
        ("check", "The charmer has Advantage on ability checks to interact with you socially.",
         "Quien te hechizó tiene ventaja en las pruebas para interactuar socialmente contigo."),
    ],
    "condition.deafened": [
        ("effect", "Can’t hear; automatically fail any ability check that requires hearing.",
         "No oyes; fallas automáticamente las pruebas de característica que requieran el oído."),
    ],
    "condition.exhaustion": [
        ("effect", "Cumulative: each time you gain it, +1 Exhaustion level. Level 6 = death.",
         "Acumulativo: cada vez que lo recibes, +1 nivel de cansancio. Nivel 6 = muerte."),
        ("check", "Every D20 Test is reduced by 2 × your Exhaustion level.",
         "Cada prueba con d20 se reduce en 2 × tu nivel de cansancio."),
        ("speed", "Speed reduced by 5 feet × your Exhaustion level.",
         "Velocidad reducida en 1,5 m × tu nivel de cansancio."),
        ("ends", "Each Long Rest removes 1 level; the condition ends at level 0.",
         "Cada descanso largo elimina 1 nivel; el estado termina en el nivel 0."),
    ],
    "condition.frightened": [
        ("check", "Disadvantage on ability checks and attack rolls while the source of fear is in line of sight.",
         "Desventaja en pruebas de característica y tiradas de ataque mientras la fuente del miedo esté a la vista."),
        ("effect", "You can’t willingly move closer to the source of fear.",
         "No puedes acercarte voluntariamente a la fuente del miedo."),
    ],
    "condition.grappled": [
        ("cause", "Usually an Unarmed Strike (Grapple): the target makes a Str or Dex save (its choice) against DC 8 + the grappler’s Str modifier + Proficiency Bonus.",
         "Normalmente un ataque sin armas (agarre): el objetivo hace una salvación de FUE o DES (a su elección) contra CD 8 + modificador por Fuerza + bonificador por competencia de quien agarra."),
        ("speed", "Speed 0 and can’t increase. The grappler can drag or carry you (each foot costs it 1 extra foot).",
         "Velocidad 0 y no puede aumentar. Quien te agarra puede arrastrarte o llevarte (cada metro le cuesta 1 m adicional)."),
        ("attack", "Disadvantage on attack rolls against any target other than the grappler.",
         "Desventaja en las tiradas de ataque contra cualquier objetivo que no sea quien te agarra."),
        ("escape", "Action: Str (Athletics) or Dex (Acrobatics) check against the escape DC.",
         "Acción: prueba de FUE (Atletismo) o DES (Acrobacias) contra la CD para escapar."),
        ("ends", "Also ends if the grappler is Incapacitated, you end up out of its range, or it lets you go (no action).",
         "También termina si quien agarra queda incapacitado, quedas fuera de su alcance o te suelta (sin acción)."),
    ],
    "condition.incapacitated": [
        ("effect", "You can’t take any action, Bonus Action or Reaction, and you can’t speak.",
         "No puedes llevar a cabo acciones, acciones adicionales ni reacciones, y no puedes hablar."),
        ("ends", "Your Concentration is broken.", "Tu concentración se rompe."),
        ("check", "Disadvantage on Initiative if you are Incapacitated when you roll it.",
         "Desventaja en la iniciativa si estás incapacitado al tirarla."),
    ],
    "condition.invisible": [
        ("effect", "You aren’t affected by effects that require seeing the target; your gear is concealed too.",
         "No te afectan los efectos que requieren ver al objetivo; tu equipo también queda oculto."),
        ("attack", "Attacks against you have Disadvantage; yours have Advantage (not against creatures that can see you).",
         "Los ataques contra ti tienen desventaja; los tuyos, ventaja (no frente a quien pueda verte)."),
        ("check", "Advantage on Initiative if you are Invisible when you roll it.",
         "Ventaja en la iniciativa si estás invisible al tirarla."),
    ],
    "condition.paralyzed": [
        ("effect", "Incapacitated; Speed 0 and can’t increase.", "Incapacitado; velocidad 0 y no puede aumentar."),
        ("save", "Automatically fail Strength and Dexterity saving throws.",
         "Fallas automáticamente las tiradas de salvación de Fuerza y Destreza."),
        ("attack", "Attacks against you have Advantage; a hit from within 5 feet is a Critical Hit.",
         "Los ataques contra ti tienen ventaja; un impacto a 1,5 m o menos es crítico."),
    ],
    "condition.petrified": [
        ("effect", "Turned into inanimate substance with your nonmagical gear; weight ×10, you stop aging. Incapacitated, Speed 0.",
         "Te conviertes en sustancia inanimada junto con tu equipo no mágico; peso ×10 y dejas de envejecer. Incapacitado, velocidad 0."),
        ("save", "Automatically fail Strength and Dexterity saving throws.",
         "Fallas automáticamente las tiradas de salvación de Fuerza y Destreza."),
        ("attack", "Attacks against you have Advantage.", "Los ataques contra ti tienen ventaja."),
        ("damage", "Resistance to all damage; Immunity to the Poisoned condition.",
         "Resistencia a todo el daño; inmunidad al estado de envenenado."),
    ],
    "condition.poisoned": [
        ("check", "Disadvantage on attack rolls and ability checks.",
         "Desventaja en las tiradas de ataque y las pruebas de característica."),
    ],
    "condition.prone": [
        ("speed", "You can only crawl, or spend half your Speed to stand up and end the condition (not with Speed 0).",
         "Solo puedes arrastrarte, o gastar la mitad de tu velocidad para levantarte y terminar el estado (no con velocidad 0)."),
        ("attack", "Your attacks have Disadvantage. Attacks against you have Advantage within 5 feet, Disadvantage from farther away.",
         "Tus ataques tienen desventaja. Los ataques contra ti tienen ventaja a 1,5 m o menos, y desventaja desde más lejos."),
    ],
    "condition.restrained": [
        ("speed", "Speed 0 and can’t increase.", "Velocidad 0 y no puede aumentar."),
        ("attack", "Attacks against you have Advantage; your attacks have Disadvantage.",
         "Los ataques contra ti tienen ventaja; los tuyos, desventaja."),
        ("save", "Disadvantage on Dexterity saving throws.", "Desventaja en las tiradas de salvación de Destreza."),
    ],
    "condition.stunned": [
        ("effect", "Incapacitated.", "Incapacitado."),
        ("save", "Automatically fail Strength and Dexterity saving throws.",
         "Fallas automáticamente las tiradas de salvación de Fuerza y Destreza."),
        ("attack", "Attacks against you have Advantage.", "Los ataques contra ti tienen ventaja."),
    ],
    "condition.unconscious": [
        ("effect", "Incapacitated and Prone, Speed 0; you drop what you hold and are unaware of your surroundings.",
         "Incapacitado y derribado, velocidad 0; sueltas lo que sostienes y no eres consciente de tu entorno."),
        ("save", "Automatically fail Strength and Dexterity saving throws.",
         "Fallas automáticamente las tiradas de salvación de Fuerza y Destreza."),
        ("attack", "Attacks against you have Advantage; a hit from within 5 feet is a Critical Hit.",
         "Los ataques contra ti tienen ventaja; un impacto a 1,5 m o menos es crítico."),
        ("ends", "You remain Prone when the condition ends.", "Sigues derribado cuando el estado termina."),
    ],
    "action.attack": [
        ("action", "Action", "Acción"),
        ("effect", "Make one attack roll with a weapon or an Unarmed Strike; equip or unequip one weapon as part of it.",
         "Haz una tirada de ataque con un arma o un ataque sin armas; puedes equipar o desequipar un arma como parte de ella."),
        ("speed", "With Extra Attack you can move between your attacks.",
         "Con Ataque adicional puedes moverte entre tus ataques."),
    ],
    "action.dash": [
        ("action", "Action", "Acción"),
        ("speed", "Extra movement equal to your Speed (after modifiers) for the rest of the turn.",
         "Movimiento adicional igual a tu velocidad (tras modificadores) durante el resto del turno."),
    ],
    "action.disengage": [
        ("action", "Action", "Acción"),
        ("effect", "Your movement doesn’t provoke Opportunity Attacks for the rest of the turn.",
         "Tu movimiento no provoca ataques de oportunidad durante el resto del turno."),
    ],
    "action.dodge": [
        ("action", "Action", "Acción"),
        ("attack", "Until the start of your next turn, attacks against you have Disadvantage (if you see the attacker).",
         "Hasta el principio de tu siguiente turno, los ataques contra ti tienen desventaja (si ves al atacante)."),
        ("save", "Dexterity saving throws with Advantage.", "Tiradas de salvación de Destreza con ventaja."),
        ("ends", "Lost if you have the Incapacitated condition or your Speed is 0.",
         "Lo pierdes si tienes el estado de incapacitado o tu velocidad es 0."),
    ],
    "action.help": [
        ("action", "Action", "Acción"),
        ("check", "Assist an ally’s ability check with one of your skill or tool proficiencies: Advantage on their next check.",
         "Ayuda a un aliado en una prueba con una de tus competencias en habilidades o herramientas: ventaja en su siguiente prueba."),
        ("attack", "Distract an enemy within 5 feet: the next attack roll by an ally against it has Advantage.",
         "Distrae a un enemigo a 1,5 m o menos: la siguiente tirada de ataque de un aliado contra él tiene ventaja."),
        ("duration", "The benefit expires at the start of your next turn.",
         "El beneficio expira al principio de tu siguiente turno."),
    ],
    "action.hide": [
        ("action", "Action", "Acción"),
        ("check", "DC 15 Dexterity (Stealth) while Heavily Obscured or behind Three-Quarters or Total Cover, out of enemies’ sight.",
         "Prueba de Destreza (Sigilo) CD 15 en una zona muy oscura o tras cobertura tres cuartos o completa, fuera de la vista de los enemigos."),
        ("effect", "On a success you have the Invisible condition; your total is the DC to find you with Wisdom (Perception).",
         "Si la superas, tienes el estado de invisible; tu resultado es la CD para encontrarte con Sabiduría (Percepción)."),
        ("ends", "You make a sound louder than a whisper, are found, make an attack roll or cast a spell with a Verbal component.",
         "Haces un ruido más alto que un susurro, te encuentran, haces una tirada de ataque o lanzas un conjuro con componente verbal."),
    ],
    "action.influence": [
        ("action", "Action", "Acción"),
        ("check", "Charisma (Deception, Intimidation, Performance or Persuasion) or Wisdom (Animal Handling), chosen by the GM.",
         "Carisma (Engaño, Intimidación, Interpretación o Persuasión) o Sabiduría (Trato con animales), a elección del GM."),
        ("effect", "DC 15 or the monster’s Intelligence, whichever is higher. On a failure, wait 24 hours to try the same urging again.",
         "CD 15 o la Inteligencia del monstruo, lo que sea mayor. Si fallas, espera 24 horas para volver a pedir lo mismo."),
    ],
    "action.magic": [
        ("action", "Action", "Acción"),
        ("effect", "Cast a spell with a casting time of an action, or use a feature or magic item that requires the Magic action.",
         "Lanza un conjuro con tiempo de lanzamiento de una acción, o usa un rasgo u objeto mágico que requiera la acción de magia."),
        ("duration", "Spells of 1 minute or longer need the Magic action each turn and Concentration.",
         "Los conjuros de 1 minuto o más exigen la acción de magia cada turno y concentración."),
    ],
    "action.ready": [
        ("action", "Action now, then your Reaction when the trigger happens", "Acción ahora y tu reacción cuando ocurra el desencadenante"),
        ("trigger", "Choose a perceivable circumstance and the action (or movement) you take in response.",
         "Elige una circunstancia perceptible y la acción (o movimiento) con la que responderás."),
        ("duration", "Until the start of your next turn. A readied spell requires Concentration.",
         "Hasta el principio de tu siguiente turno. Un conjuro preparado requiere concentración."),
    ],
    "action.search": [
        ("action", "Action", "Acción"),
        ("check", "Wisdom (Insight, Medicine, Perception or Survival).",
         "Sabiduría (Medicina, Percepción, Perspicacia o Supervivencia)."),
    ],
    "action.study": [
        ("action", "Action", "Acción"),
        ("check", "Intelligence (Arcana, History, Investigation, Nature or Religion).",
         "Inteligencia (Conocimiento arcano, Historia, Investigación, Naturaleza o Religión)."),
    ],
    "action.utilize": [
        ("action", "Action", "Acción"),
        ("effect", "Use a nonmagical object, such as opening a door or pulling a lever.",
         "Usa un objeto no mágico, como abrir una puerta o tirar de una palanca."),
    ],
    "rule.grappling": [
        ("cause", "Unarmed Strike (Grapple): Str or Dex save (target’s choice) against DC 8 + Str modifier + Proficiency Bonus.",
         "Ataque sin armas (agarre): salvación de FUE o DES (a elección del objetivo) contra CD 8 + modificador por Fuerza + bonificador por competencia."),
        ("effect", "Needs a free hand; one creature per hand or body part.",
         "Requiere una mano libre; una criatura por mano o parte del cuerpo."),
        ("escape", "Action: Str (Athletics) or Dex (Acrobatics) check against the escape DC.",
         "Acción: prueba de FUE (Atletismo) o DES (Acrobacias) contra la CD para escapar."),
    ],
    "rule.unarmed-strike": [
        ("attack", "Damage: attack roll with Str modifier + Proficiency Bonus; 1 + Str modifier Bludgeoning damage.",
         "Daño: tirada de ataque con modificador por Fuerza + bonificador por competencia; 1 + modificador por Fuerza de daño contundente."),
        ("save", "Grapple or Shove: Str or Dex save (target’s choice) against DC 8 + Str modifier + Proficiency Bonus.",
         "Agarre o empujón: salvación de FUE o DES (a elección del objetivo) contra CD 8 + modificador por Fuerza + bonificador por competencia."),
        ("effect", "Shove: push the target 5 feet away or knock it Prone. The target can be at most one size larger.",
         "Empujón: aleja al objetivo 1,5 m o déjalo derribado. El objetivo puede ser como mucho una categoría de tamaño mayor."),
    ],
    "rule.opportunity-attacks": [
        ("trigger", "A creature you can see leaves your reach using its action, Bonus Action, Reaction or a speed.",
         "Una criatura que puedes ver sale de tu alcance usando su acción, acción adicional, reacción o una velocidad."),
        ("action", "Reaction", "Reacción"),
        ("attack", "One melee attack with a weapon or an Unarmed Strike, right before it leaves your reach.",
         "Un ataque cuerpo a cuerpo con un arma o sin armas, justo antes de que salga de tu alcance."),
    ],
    "rule.concentration": [
        ("save", "When you take damage: Constitution save, DC 10 or half the damage (round down), whichever is higher, max 30.",
         "Al sufrir daño: salvación de Constitución, CD 10 o la mitad del daño (redondeando hacia abajo), lo que sea mayor, máximo 30."),
        ("ends", "Casting another Concentration spell, being Incapacitated or dying.",
         "Lanzar otro conjuro de concentración, quedar incapacitado o morir."),
    ],
    "rule.death-saving-throw": [
        ("trigger", "Start your turn with 0 Hit Points.", "Empiezas tu turno con 0 puntos de golpe."),
        ("check", "Roll a d20: 10 or higher succeeds. Three successes: Stable. Three failures: dead.",
         "Tira 1d20: 10 o más es un éxito. Tres éxitos: estable. Tres fallos: muerto."),
        ("effect", "A 1 counts as two failures; a 20 means you regain 1 Hit Point.",
         "Un 1 cuenta como dos fallos; un 20 te hace recuperar 1 punto de golpe."),
    ],
    "rule.short-rest": [
        ("duration", "1 hour of light activity; you need at least 1 Hit Point.",
         "1 hora de actividad ligera; necesitas al menos 1 punto de golpe."),
        ("effect", "Spend Hit Point Dice: roll each + Constitution modifier to regain Hit Points.",
         "Gasta dados de puntos de golpe: tira cada uno + modificador por Constitución para recuperar puntos de golpe."),
        ("ends", "Interrupted by rolling Initiative, casting a non-cantrip spell or taking damage.",
         "Se interrumpe al tirar iniciativa, lanzar un conjuro que no sea un truco o sufrir daño."),
    ],
    "rule.long-rest": [
        ("duration", "At least 8 hours (6 asleep); wait 16 hours before the next one.",
         "Al menos 8 horas (6 durmiendo); espera 16 horas antes del siguiente."),
        ("effect", "Regain all Hit Points and spent Hit Point Dice; ability scores restored; Exhaustion −1.",
         "Recuperas todos los puntos de golpe y los dados de puntos de golpe gastados; puntuaciones restablecidas; cansancio −1."),
        ("ends", "Interrupted by Initiative, a non-cantrip spell, damage or 1 hour of exertion.",
         "Se interrumpe por iniciativa, un conjuro que no sea truco, daño o 1 hora de esfuerzo físico."),
    ],
    "rule.cover": [
        ("effect", "Half Cover: +2 to AC and Dex saves. Three-Quarters: +5. Total: can’t be targeted directly.",
         "Media: +2 a la CA y salvaciones de DES. Tres cuartos: +5. Completa: no te pueden elegir directamente como objetivo."),
    ],
    "rule.heroic-inspiration": [
        ("effect", "Expend it to reroll any die immediately after rolling it; you must use the new roll.",
         "Gástala para volver a tirar cualquier dado justo después de tirarlo; debes usar el nuevo resultado."),
        ("ends", "You can only have one; an extra one can be given to a player character who lacks it.",
         "Solo puedes tener una; la sobrante puede cederse a un personaje jugador que no la tenga."),
    ],
    "rule.difficult-terrain": [
        ("speed", "Every foot of movement costs 1 extra foot (5 feet cost 10).",
         "Cada metro de movimiento cuesta 1 m adicional (1,5 m cuestan 3 m)."),
    ],
    "rule.knocking-out-a-creature": [
        ("trigger", "You would reduce a creature to 0 Hit Points with a melee attack.",
         "Reducirías a una criatura a 0 puntos de golpe con un ataque cuerpo a cuerpo."),
        ("effect", "It drops to 1 Hit Point, is Unconscious and starts a Short Rest.",
         "Queda con 1 punto de golpe, inconsciente, y comienza un descanso corto."),
        ("ends", "It regains Hit Points, or someone administers first aid: DC 10 Wisdom (Medicine).",
         "Recupera puntos de golpe, o alguien le presta primeros auxilios: Sabiduría (Medicina) CD 10."),
    ],
    "rule.surprise": [
        ("check", "Disadvantage on your Initiative roll.", "Desventaja en tu tirada de iniciativa."),
    ],
    "hazard.burning": [
        ("damage", "1d4 Fire damage at the start of each of your turns.",
         "1d4 de daño de fuego al principio de cada uno de tus turnos."),
        ("ends", "Action: go Prone and roll on the ground; or be doused, submerged or smothered.",
         "Acción: déjate derribado y rueda por el suelo; o empápate, sumérgete o sofoca el fuego."),
    ],
    "hazard.falling": [
        ("damage", "1d6 Bludgeoning per 10 feet fallen, up to 20d6; you land Prone unless you take no damage.",
         "1d6 de daño contundente por cada 3 m de caída, hasta 20d6; caes derribado salvo que no sufras daño."),
        ("check", "Into water: Reaction, DC 15 Str (Athletics) or Dex (Acrobatics) to halve the damage.",
         "Al agua: reacción, prueba de FUE (Atletismo) o DES (Acrobacias) CD 15 para reducir el daño a la mitad."),
    ],
    "hazard.suffocation": [
        ("duration", "Hold your breath for 1 + Con modifier minutes (minimum 30 seconds).",
         "Aguantas la respiración 1 + modificador por Constitución minutos (mínimo 30 segundos)."),
        ("effect", "Out of breath: +1 Exhaustion level at the end of each of your turns.",
         "Sin aire: +1 nivel de cansancio al final de cada uno de tus turnos."),
        ("ends", "Breathing again removes the Exhaustion gained this way.",
         "Al volver a respirar pierdes el cansancio ganado así."),
    ],
    "hazard.dehydration": [
        ("effect", "Drinking less than half the water you need: +1 Exhaustion level at the end of the day.",
         "Si bebes menos de la mitad del agua que necesitas: +1 nivel de cansancio al final del día."),
        ("ends", "Can’t be removed until you drink a full day’s water.",
         "No se elimina hasta que bebas el agua de un día completo."),
    ],
    "hazard.malnutrition": [
        ("save", "Eating less than half your food: DC 10 Constitution save or +1 Exhaustion level at the end of the day.",
         "Si comes menos de la mitad: salvación de Constitución CD 10 o +1 nivel de cansancio al final del día."),
        ("effect", "Five days without food: +1 Exhaustion level, then +1 for each further day.",
         "Cinco días sin comer: +1 nivel de cansancio y +1 por cada día más."),
    ],
}

# SRD 5.1 (2014) headings → glossary ids, for the collapsible "2014 rule" block.
LEGACY = {
    # id: (EN heading, ES heading, kind)
    "condition.blinded": ("Blinded", "Cegado", "cond"),
    "condition.charmed": ("Charmed", "Hechizado", "cond"),
    "condition.deafened": ("Deafened", "Ensordecido", "cond"),
    "condition.exhaustion": ("Exhaustion", "Cansancio", "cond"),
    "condition.frightened": ("Frightened", "Asustado", "cond"),
    "condition.grappled": ("Grappled", "Agarrado", "cond"),
    "condition.incapacitated": ("Incapacitated", "Incapacitado", "cond"),
    "condition.invisible": ("Invisible", "Invisible", "cond"),
    "condition.paralyzed": ("Paralyzed", "Paralizado", "cond"),
    "condition.petrified": ("Petrified", "Petrificado", "cond"),
    "condition.poisoned": ("Poisoned", "Envenenado", "cond"),
    "condition.prone": ("Prone", "Derribado", "cond"),
    "condition.restrained": ("Restrained", "Apresado", "cond"),
    "condition.stunned": ("Stunned", "Aturdido", "cond"),
    "condition.unconscious": ("Unconscious", "Inconsciente", "cond"),
    "action.attack": ("Attack", "Atacar", "act"),
    "action.magic": ("Cast a Spell", "Lanzar un conjuro", "act"),
    "action.dash": ("Dash", "Correr", "act"),
    "action.disengage": ("Disengage", "Destrabarse", "act"),
    "action.dodge": ("Dodge", "Esquivar", "act"),
    "action.help": ("Help", "Ayudar", "act"),
    "action.hide": ("Hide", "Esconderse", "act"),
    "action.ready": ("Ready", "Preparar una acción", "act"),
    "action.search": ("Search", "Buscar", "act"),
    "action.utilize": ("Use an Object", "Usar un objeto", "act"),
    "rule.opportunity-attacks": ("Opportunity Attacks", "Ataques de oportunidad", "act"),
    "rule.grappling": ("Grappling", "Agarrar", "act"),
    "rule.unarmed-strike": ("Shoving a Creature", "Empujar a una criatura", "act"),
    "rule.two-weapon-fighting": ("Two-Weapon Fighting", "Combate con dos armas", "act"),
}

LEGACY_ONLY = {
    # Terms that exist only in the 2014 rules (shown as their own entries, edition 2014).
    "rule.two-weapon-fighting": ("Two-Weapon Fighting", "Combate con dos armas"),
}

LEGACY_STOPS = {
    "en": ["Actions in Combat", "Making an Attack", "Attack Rolls", "Modifiers to the Roll",
           "Unseen Attackers and Targets", "Range", "Ranged Attacks in Close Combat", "Melee Attacks",
           "Contests in Combat", "Cover", "Damage and Healing", "Hit Points", "Damage Rolls",
           "Critical Hits", "Conditions", "Appendix PH-A:"],
    "es": ["Acciones en combate", "Tiradas de ataque", "Modificadores de la tirada", "Sacar 1 o 20",
           "Atacantes y objetivos ocultos", "Ataques a distancia", "Alcance",
           "Ataques a distancia en combate cerrado", "Ataques cuerpo a cuerpo",
           "Tiradas enfrentadas en combate", "Cobertura", "Daño y curación",
           "Apretarse en un espacio más pequeño", "Estados", "Apéndice MJ-A:"],
}

EXHAUSTION_2014 = {
    "en": {"head": ["Level", "Effect"], "rows": [
        ["1", "Disadvantage on ability checks"], ["2", "Speed halved"],
        ["3", "Disadvantage on attack rolls and saving throws"], ["4", "Hit point maximum halved"],
        ["5", "Speed reduced to 0"], ["6", "Death"]]},
    "es": {"head": ["Nivel", "Efecto"], "rows": [
        ["1", "Desventaja en pruebas de característica."], ["2", "Velocidad reducida a la mitad."],
        ["3", "Desventaja en tiradas de ataque y de salvación."],
        ["4", "Puntos de golpe máximos reducidos a la mitad."], ["5", "Velocidad reducida a 0."],
        ["6", "Muerte."]]},
}

# Tables whose PDF layout cannot be recovered automatically: (id, lang) → (block index, blocks).
_ACTIONS_EN = ["Attack", "Dash", "Disengage", "Dodge", "Help", "Hide", "Influence", "Magic", "Ready",
               "Search", "Study", "Utilize"]
_ACTIONS_ES = ["Atacar", "Ayudar", "Buscar", "Correr", "Destrabarse", "Esconderse", "Esquivar", "Estudiar",
               "Influir", "Magia", "Preparar una acción", "Utilizar"]
TABLE_OVERRIDES = {
    ("rule.action", "en"): (1, [{"t": "ul", "items": _ACTIONS_EN}]),
    ("rule.action", "es"): (1, [{"t": "ul", "items": _ACTIONS_ES}]),
    ("action.study", "es"): (1, [{"t": "table", "caption": "Áreas de conocimiento", "head": ["Habilidad", "Áreas"], "rows": [
        ["Conocimiento arcano", "Conjuros, objetos mágicos, símbolos sobrenaturales, tradiciones mágicas, planos de existencia y determinadas criaturas (aberraciones, autómatas, elementales, feéricos y monstruosidades)"],
        ["Historia", "Acontecimientos y personajes históricos, civilizaciones antiguas, guerras y determinadas criaturas (gigantes y humanoides)"],
        ["Investigación", "Trampas, códigos, enigmas y artilugios"],
        ["Naturaleza", "Terreno, flora, clima y determinadas criaturas (bestias, cienos, dragones y plantas)"],
        ["Religión", "Deidades, jerarquías religiosas y ritos, símbolos sagrados, sectas y determinadas criaturas (celestiales, infernales y muertos vivientes)"]]}]),
    ("rule.carrying-capacity", "es"): (1, [{"t": "table", "caption": "Capacidad de carga",
        "head": ["Tamaño de la criatura", "Máximo", "Arrastrar, levantar o empujar"], "rows": [
        ["Diminuto", "Fue × 3,75 kg", "Fue × 7,5 kg"], ["Pequeño/Mediano", "Fue × 7,5 kg", "Fue × 15 kg"],
        ["Grande", "Fue × 15 kg", "Fue × 30 kg"], ["Enorme", "Fue × 30 kg", "Fue × 60 kg"],
        ["Gargantuesco", "Fue × 60 kg", "Fue × 120 kg"]]}]),
    ("spell.control-weather", "en"): (3, [
        {"t": "table", "caption": "Precipitation", "head": ["Stage", "Condition"], "rows": [
            ["1", "Clear"], ["2", "Light clouds"], ["3", "Overcast or ground fog"], ["4", "Rain, hail, or snow"],
            ["5", "Torrential rain, driving hail, or blizzard"]]},
        {"t": "table", "caption": "Temperature", "head": ["Stage", "Condition"], "rows": [
            ["1", "Heat wave"], ["2", "Hot"], ["3", "Warm"], ["4", "Cool"], ["5", "Cold"], ["6", "Freezing"]]},
        {"t": "table", "caption": "Wind", "head": ["Stage", "Condition"], "rows": [
            ["1", "Calm"], ["2", "Moderate wind"], ["3", "Strong wind"], ["4", "Gale"], ["5", "Storm"]]}]),
    ("spell.control-weather", "es"): (1, [
        {"t": "table", "caption": "Precipitaciones", "head": ["Nivel", "Estado"], "rows": [
            ["1", "Despejado"], ["2", "Nubes escasas"], ["3", "Cielo cubierto o niebla de superficie"],
            ["4", "Lluvia, granizo o nieve"], ["5", "Lluvia torrencial, tormenta de granizo o ventisca"]]},
        {"t": "table", "caption": "Temperatura", "head": ["Nivel", "Estado"], "rows": [
            ["1", "Ola de calor"], ["2", "Caliente"], ["3", "Templado"], ["4", "Fresco"], ["5", "Frío"],
            ["6", "Frío extremo"]]},
        {"t": "table", "caption": "Viento", "head": ["Nivel", "Estado"], "rows": [
            ["1", "Calmo"], ["2", "Viento moderado"], ["3", "Viento fuerte"], ["4", "Galerna"], ["5", "Tempestad"]]}]),
    ("spell.teleport", "en"): (2, [{"t": "table", "caption": "Teleportation Outcome",
        "head": ["Familiarity", "Mishap", "Similar Area", "Off Target", "On Target"], "rows": [
        ["Permanent circle", "—", "—", "—", "01–00"], ["Linked object", "—", "—", "—", "01–00"],
        ["Very familiar", "01–05", "06–13", "14–24", "25–00"], ["Seen casually", "01–33", "34–43", "44–53", "54–00"],
        ["Viewed once or described", "01–43", "44–53", "54–73", "74–00"],
        ["False destination", "01–50", "51–00", "—", "—"]]}]),
    ("spell.teleport", "es"): (1, [{"t": "table", "caption": "Resultado del teletransporte",
        "head": ["Familiaridad", "Percance", "Área similar", "Lejos del objetivo", "En el objetivo"], "rows": [
        ["Círculo permanente", "—", "—", "—", "01–00"], ["Objeto vinculado", "—", "—", "—", "01–00"],
        ["Muy familiar", "01–05", "06–13", "14–24", "25–00"], ["Visto esporádicamente", "01–33", "34–43", "44–53", "54–00"],
        ["Visto una vez o descrito", "01–43", "44–53", "54–73", "74–00"],
        ["Destino falso", "01–50", "51–00", "—", "—"]]}]),
    ("spell.scrying", "en"): (1, [
        {"t": "table", "head": ["Your Knowledge of the Target Is …", "Save Modifier"], "rows": [
            ["Secondhand (heard of the target)", "+5"], ["Firsthand (met the target)", "+0"],
            ["Extensive (know the target well)", "−5"]]},
        {"t": "table", "head": ["You Have the Target’s …", "Save Modifier"], "rows": [
            ["Picture or other likeness", "−2"], ["Garment or other possession", "−4"],
            ["Body part, lock of hair, or bit of nail", "−10"]]}]),
    ("spell.scrying", "es"): (1, [
        {"t": "table", "head": ["Conocimiento sobre el objetivo", "Modificador de la tirada de salvación"], "rows": [
            ["De segundas (has oído hablar del objetivo)", "+5"], ["De primera mano (has conocido al objetivo)", "+0"],
            ["Familiar (conoces bien al objetivo)", "−5"]]},
        {"t": "table", "head": ["¿Qué tienes del objetivo?", "Modificador de la tirada de salvación"], "rows": [
            ["Dibujo u otro retrato", "−2"], ["Prenda u otra posesión", "−4"],
            ["Parte del cuerpo, mechón de pelo o trozo de uña", "−10"]]}]),
    ("spell.divine-word", "es"): (1, [{"t": "table", "caption": "Efectos de palabra divina",
        "head": ["Puntos de golpe", "Efecto"], "rows": [
        ["0–20", "El objetivo muere."],
        ["21–30", "El objetivo tiene los estados de aturdido, cegado y ensordecido durante 1 hora."],
        ["31–40", "El objetivo tiene los estados de cegado y ensordecido durante 10 minutos."],
        ["41–50", "El objetivo tiene el estado de ensordecido durante 1 minuto."]]}]),
}
