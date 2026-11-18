import type { diceEn } from './dice-en'

/** RYT-133: los dados de la mesa (ajuste del DM), lo que dice la ficha, las tiradas en la app y
 * las últimas tiradas. */
export const diceEs = {
  'dm.panelDice': 'Dados',
  'diceSettings.title': 'Dados de la mesa',
  'diceSettings.hint':
    'Elige cómo tira la mesa y quién ve las tiradas hechas o anotadas en la app.',
  'diceSettings.current': 'En uso',
  'diceSettings.modeLegend': 'Cómo se tira',
  'diceSettings.visibilityLegend': 'Quién ve las tiradas',
  'diceSettings.mode.physical': 'Dados físicos',
  'diceSettings.mode.physicalHint':
    'Cada jugador tira los suyos. La ficha dice qué tirar y qué sumar; lo que se escribe consta como anotado.',
  'diceSettings.mode.app': 'Dados en la app',
  'diceSettings.mode.appHint':
    'Rytta tira y anota: el resultado lo decide el servidor y consta como tirada por Rytta. Lo que se escriba a mano consta como anotado. La iniciativa y los dados de golpe también.',
  'diceSettings.mode.player': 'Cada jugador elige',
  'diceSettings.mode.playerHint':
    'Cada uno escoge dados físicos o en la app en su dispositivo. Hasta que elija, dados físicos.',
  'diceSettings.visibility.roller_dm': 'Quien tira y el DM',
  'diceSettings.visibility.roller_dmHint': 'El resto de la mesa no ve la tirada.',
  'diceSettings.visibility.table': 'Toda la mesa',
  'diceSettings.visibility.tableHint': 'Todos los miembros activos ven cada tirada.',
  'diceSettings.visibility.roller': 'Solo quien tira',
  'diceSettings.visibility.rollerHint': 'Ni siquiera el DM ve la tirada.',
  'diceSettings.apply': 'Aplicar cambios',
  'diceSettings.saved': 'Ajustes de dados guardados.',
  'diceSettings.confirmTitle': '¿Cambiar los dados de la mesa?',
  'diceSettings.confirmMode.physical':
    'Los jugadores tiran sus dados. La ficha dice qué tirar, y la iniciativa y los dados de golpe se escriben a mano.',
  'diceSettings.confirmMode.app':
    'Los jugadores tirarán en la app: Rytta hace la tirada y la anota, también la de iniciativa y los dados de golpe. Ninguna ficha cambia.',
  'diceSettings.confirmMode.player':
    'Cada jugador elige en su dispositivo; hasta que elija, usa dados físicos.',
  'diceSettings.confirmVisibility.wider':
    'Las tiradas anteriores no se muestran a más gente: siguen visibles solo para quien las veía cuando se hicieron.',
  'diceSettings.confirmVisibility.narrower':
    'Quien deje de poder verlas pierde también las tiradas anteriores.',
  'diceSettings.errorTitle': 'No se guardaron los ajustes de dados',
  'diceSettings.error.unavailable':
    'No se pudo conectar con el servidor. Nada cambió; inténtalo de nuevo.',
  'diceSettings.error.forbidden': 'Solo un DM de esta campaña puede cambiar los dados.',
  'diceSettings.error.invalid': 'Esos ajustes no son válidos. Cierra esto y elige de nuevo.',
  'diceSettings.error.request-mismatch':
    'Esa petición ya se usó para otros ajustes. Cierra esto y aplica los cambios otra vez.',

  'diceChoice.label': 'Tus dados',
  'diceChoice.physical': 'Físicos',
  'diceChoice.app': 'En la app',
  'diceChoice.hint': 'El DM lo deja a tu elección. Se guarda en este dispositivo.',

  'roll.name.ability': 'Prueba de {{ability}}',
  'roll.name.save': 'Salvación de {{ability}}',
  'roll.name.initiative': 'Iniciativa',
  'roll.name.hitDie': 'Dados de golpe',
  'roll.name.deathSave': 'Salvación de muerte',
  'roll.name.attack': 'Ataque: {{weapon}}',
  'roll.name.damage': 'Daño: {{weapon}}',
  'roll.kind.ability': 'Prueba de característica',
  'roll.kind.skill': 'Habilidad',
  'roll.kind.save': 'Salvación',
  'roll.kind.attack': 'Ataque',
  'roll.kind.damage': 'Daño',
  'roll.kind.initiative': 'Iniciativa',
  'roll.kind.death_save': 'Salvación de muerte',
  'roll.kind.hit_die': 'Dado de golpe',
  'roll.kind.custom': 'Tirada',
  'roll.rollAction': 'Tirar {{name}}, {{formula}}',
  'roll.recordAction': 'Anotar la tirada de {{name}}, {{formula}}',
  'roll.hintApp': 'Toca un modificador subrayado para tirar los dados.',
  'roll.hintPhysical':
    'Tira lo que dice cada línea y toca la línea subrayada para anotar el resultado.',
  'roll.recordTitle': 'Anotar: {{name}}',
  'roll.recordFormula': 'Tira {{formula}}.',
  'roll.dieSingle': 'Resultado del d{{sides}}',
  'roll.dieN': 'Dado {{n}} (d{{sides}})',
  'roll.dieRange': 'De 1 a {{max}}',
  'roll.dieError': 'Escribe un número de 1 a {{max}}.',
  'roll.totalLabel': 'Total de la tirada',
  'roll.totalRange': 'Entre {{min}} y {{max}}',
  'roll.totalError': 'Escribe el total como número entero.',
  'roll.sum': '{{maths}} = {{total}}',
  'roll.sumTotal': 'Total {{total}}',
  'roll.record': 'Anotar',
  'roll.errorTitle': 'La tirada no llegó a la mesa',
  'roll.error.unavailable':
    'No se pudo conectar con el servidor. La tirada no se hizo ni se anotó; inténtalo de nuevo.',
  'roll.error.forbidden': 'Tu cuenta no puede anotar tiradas en esta campaña.',
  'roll.error.invalid': 'La tirada no es válida. Revisa los números.',
  'roll.error.request-mismatch':
    'Esa petición ya se usó para otra tirada. Cierra esto y vuelve a tirar.',
  'roll.error.character-unavailable': 'Este personaje no puede tirar ahora (ausente o archivado).',
  'roll.error.roll-limit': 'Demasiadas tiradas seguidas. Espera un momento y vuelve a intentarlo.',
  'roll.resultLabel': 'Última tirada',
  'roll.rollingShort': 'Tirando los dados…',
  'roll.dismiss': 'Cerrar la tirada',
  'roll.recent': 'Últimas tiradas',
  'roll.seeAll': 'Ver las {{count}}',
  'roll.loading': 'Cargando tiradas…',
  'roll.loadError': 'No se pudieron cargar las tiradas.',
  'roll.empty': 'Aún no hay tiradas. Toca un modificador para tirar.',
  'roll.dm': 'DM',
  'roll.you': '{{name}} (tú)',
  'roll.source.app': 'Tirada por Rytta',
  'roll.source.recorded': 'Anotada',
  'roll.seen.table': 'La ve toda la mesa.',
  'roll.seen.roller_dm': 'La ven quien tira y el DM.',
  'roll.seen.roller': 'Solo la ve quien tira.',
  'roll.notRolled': 'Sin tirar',
  'roll.error.dice-mode':
    'El DM ha cambiado los dados de la mesa. Esta ficha ya usa los nuevos: revisa y vuelve a tirar.',
  'roll.totalOutOfRange': 'Con esos dados el total va de {{min}} a {{max}}.',
  'roll.someone': 'Otro personaje',
  'combat.initiative.waitSheet': 'Cargando tu ficha: hace falta para tirar con tu bonificador.',
  'combat.initiative.noSheet':
    'No se pudo leer tu ficha, así que no se conoce tu bonificador. Reintenta para poder tirar.',
  'combat.initiative.rollFailed':
    'No se pudo tirar la iniciativa. No se ha guardado ninguna tirada; inténtalo de nuevo.',
  'rest.rollFailed':
    'No se pudieron tirar los dados de golpe. No se ha guardado ninguna tirada; inténtalo de nuevo.',
  'roll.totalWord': 'Total',
} satisfies Record<keyof typeof diceEn, string>
