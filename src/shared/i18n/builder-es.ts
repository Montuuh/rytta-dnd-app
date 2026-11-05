import type { builderEn } from './builder-en'

// RYT-054 constructor de encuentros: SRD 5.2.1, encuentros de combate (CC-BY-4.0). Las cifras y
// su unidad van unidas por un espacio duro para que «1500 PX» no se parta entre líneas.
export const builderEs = {
  'builder.region': 'Dificultad del encuentro',
  'builder.title.none': 'Aún no hay enemigos',
  'builder.title.low': 'Dificultad baja',
  'builder.title.moderate': 'Dificultad moderada',
  'builder.title.high': 'Dificultad alta',
  'builder.title.aboveHigh': 'Por encima de la dificultad alta',
  'builder.title.unrated': 'Enemigos sin valor de desafío',
  'builder.level.low': 'Baja',
  'builder.level.moderate': 'Moderada',
  'builder.level.high': 'Alta',
  'builder.listLocale': 'es',
  'builder.upTo': 'hasta {{xp}}',
  'builder.reading.none':
    'Presupuesto de este grupo: baja {{low}}, moderada {{moderate}}, alta {{high}} PX.',
  'builder.reading.spent': '{{xp}} de {{budget}} PX; quedan {{room}}.',
  'builder.reading.full': '{{xp}} de {{budget}} PX: presupuesto completo.',
  'builder.reading.over':
    '{{xp}} PX, {{over}} por encima del presupuesto alto de {{budget}}: este combate podría ser letal.',
  'builder.party_one': 'Medido para {{count}} personaje, nivel {{level}}.',
  'builder.party_other': 'Medido para {{count}} personajes, nivel medio {{level}}.',
  'builder.partyAll': 'Cuentan todos los personajes en juego hasta que añadas alguno al encuentro.',
  'builder.announce': '{{title}}: {{xp}} PX.',
  'builder.suggest.open': 'Sugerir criaturas',
  'builder.details': 'Grupo y criaturas',
  'builder.party.title': 'Grupo',
  'builder.party.level': 'Nivel {{level}}',
  'builder.party.classLevel': '{{class}}, nivel {{level}}',
  'builder.party.noSheet': 'Sin hoja todavía: cuenta como nivel 1',
  'builder.party.budget': 'Presupuesto del grupo',
  'builder.creatures.title': 'Criaturas',
  'builder.creatures.empty':
    'Añade enemigos desde el bestiario o la pestaña Añadir para medir el combate.',
  'builder.creatures.count': '{{count}} × {{name}}',
  'builder.creatures.hidden_one': '{{count}} oculta',
  'builder.creatures.hidden_other': '{{count}} ocultas',
  'builder.creatures.each_one': '{{cr}}, {{xp}} PX',
  'builder.creatures.each_other': '{{cr}}, {{xp}} PX cada una',
  'builder.creatures.ally': 'Aliada: lucha con el grupo y no gasta presupuesto',
  'builder.creatures.unrated': 'Sin valor de desafío: sus PX no cuentan',
  'builder.creatures.lair': 'Con guarida en este combate, las criaturas cuentan sus PX de guarida.',
  'builder.xp': '{{xp}} PX',
  'builder.note.many':
    'Más de dos criaturas por personaje ({{creatures}} para {{party}}): una racha de suerte puede hacer más daño del que esperas. Incluye criaturas frágiles que caigan rápido.',
  'builder.note.manyLow': 'Importa sobre todo en los niveles 1 y 2.',
  'builder.note.statBlocks':
    '{{count}} bloques de estadísticas distintos que llevar. Más de dos o tres pueden abrumar, sobre todo con criaturas complejas.',
  'builder.note.powerful_one':
    '{{names}} tiene un valor de desafío superior al nivel del grupo ({{level}}): una sola acción podría tumbar a un personaje.',
  'builder.note.powerful_other':
    '{{names}} tienen un valor de desafío superior al nivel del grupo ({{level}}): una sola acción podría tumbar a un personaje.',
  'builder.note.cr0': 'Muchas criaturas de VD 0 ({{names}}): un enjambre es más fácil de llevar.',
  'builder.note.assumed_one':
    '{{names}} aún no tiene hoja y cuenta como nivel 1: el presupuesto puede quedarse corto.',
  'builder.note.assumed_other':
    '{{names}} aún no tienen hoja y cuentan como nivel 1: el presupuesto puede quedarse corto.',
  'builder.notes': 'Notas sobre este encuentro',
  'builder.source': 'Presupuestos de PX y notas: SRD 5.2.1, encuentros de combate (CC-BY-4.0).',
  'builder.noParty':
    'Asigna personajes a la campaña para medir la dificultad: el presupuesto depende de sus niveles.',
  'builder.noPartyLink': 'Abrir el grupo',
  'builder.loading': 'Midiendo el encuentro…',
  'builder.error': 'No se pudo cargar el grupo o el bestiario.',
  'builder.suggest.title': 'Sugerir criaturas para {{name}}',
  'builder.suggest.target': 'Dificultad a alcanzar',
  'builder.suggest.left': 'Quedan {{xp}} PX',
  'builder.suggest.reached': 'Ya alcanzada',
  'builder.suggest.kinds': 'Bloques de estadísticas',
  'builder.suggest.oneKind': 'Todas iguales',
  'builder.suggest.twoKinds': 'Un líder y su banda',
  'builder.suggest.oneKindHelp': 'Varias de la misma criatura',
  'builder.suggest.twoKindsHelp': 'Una criatura fuerte con dos o más menores de su tipo',
  'builder.suggest.type': 'Tipo de criatura',
  'builder.suggest.anyType': 'Cualquier tipo',
  'builder.suggest.ideas': 'Ideas',
  'builder.suggest.groupMeta_one': '{{name}}: {{cr}}, {{xp}} PX',
  'builder.suggest.groupMeta_other': '{{name}}: {{cr}}, {{xp}} PX cada una',
  'builder.suggest.result': 'Resultado: {{level}}',
  'builder.suggest.add': 'Añadir',
  'builder.suggest.addNamed': 'Añadir {{what}} a {{name}}',
  'builder.suggest.more': 'Otras ideas',
  'builder.suggest.newIdeas_one': '{{count}} idea nueva.',
  'builder.suggest.newIdeas_other': '{{count}} ideas nuevas.',
  'builder.suggest.noNew': 'No hay más ideas nuevas con estas opciones.',
  'builder.suggest.none':
    'Ninguna criatura cabe en los PX que quedan con estas opciones. Prueba otro tipo o «Todas iguales».',
  'builder.suggest.noRoom':
    'Este encuentro ya alcanza el presupuesto alto. Quita criaturas para bajarlo.',
  'builder.suggest.highSpent': 'El presupuesto alto está completo: no caben más criaturas.',
  'builder.suggest.crowded':
    'Este encuentro ya tiene dos criaturas por personaje para esa opción. Quita alguna o prueba «Todas iguales».',
  'builder.suggest.rules':
    'Las ideas no pasan del presupuesto, con dos criaturas por personaje como mucho y ninguna por encima del nivel del grupo.',
  'builder.suggest.added': 'Añadido a {{name}}: {{what}}.',
  'builder.suggest.loading': 'Cargando el bestiario…',
  'builder.suggest.close': 'Cerrar sugerencias',
} satisfies Record<keyof typeof builderEn, string>
