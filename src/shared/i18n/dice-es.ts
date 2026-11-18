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
    'Cada jugador tira sus dados. La ficha dice qué tirar y qué sumar, y el resultado se puede anotar: queda marcado como anotado.',
  'diceSettings.mode.app': 'Dados en la app',
  'diceSettings.mode.appHint':
    'Rytta tira los dados de las pruebas, salvaciones, ataques, daño, iniciativa y dados de golpe, y anota cada tirada. Queda marcada como tirada por Rytta y nadie puede cambiarla.',
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
    'Los jugadores tiran sus dados. Las fichas dicen qué tirar, y la iniciativa y los dados de golpe se escriben a mano. Ningún dato de personaje cambia.',
  'diceSettings.confirmMode.app':
    'Los jugadores tirarán en la app: Rytta tira y anota cada tirada, la iniciativa y los dados de golpe incluidas. En las fichas, los números dejan de decir qué tirar y tiran al tocarlos. Ningún dato de personaje cambia.',
  'diceSettings.confirmMode.player':
    'Cada jugador elige en su dispositivo; hasta que elija, usa dados físicos.',
  'diceSettings.confirmVisibility.wider':
    'Las tiradas anteriores no se muestran a más gente: siguen visibles solo para quien las veía cuando se hicieron.',
  'diceSettings.confirmVisibility.narrower':
    'Los jugadores dejan de ver las tiradas de los demás, también las anteriores.',
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
  'diceChoice.hint': 'Cada jugador elige en su dispositivo; tu elección se guarda aquí.',

  'roll.name.ability': 'Prueba de {{ability}}',
  'roll.name.save': 'Salvación de {{ability}}',
  'roll.name.initiative': 'Iniciativa',
  'roll.name.hitDie': 'Dados de golpe',
  'roll.name.deathSave': 'Salvación de muerte',
  'roll.name.attack': 'Ataque con {{weapon}}',
  'roll.name.damage': 'Daño de {{weapon}}',
  'roll.kind.ability': 'Prueba de característica',
  'roll.kind.skill': 'Habilidad',
  'roll.kind.save': 'Salvación',
  'roll.kind.attack': 'Ataque',
  'roll.kind.damage': 'Daño',
  'roll.kind.initiative': 'Iniciativa',
  'roll.kind.death_save': 'Salvación de muerte',
  'roll.kind.hit_die': 'Dados de golpe',
  'roll.kind.custom': 'Tirada',
  'roll.rollAction': 'Tirar {{name}}, {{formula}}',
  'roll.recordAction': 'Anotar la tirada de {{name}}, {{formula}}',
  'roll.hintApp': 'Toca un número subrayado para tirar los dados.',
  'roll.hintPhysical':
    'Tira lo que dice cada línea y toca el número subrayado para anotar el resultado.',
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
  'roll.empty': 'Aún no hay tiradas.',
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
  'combat.initiative.fixed':
    'Tu iniciativa ya está fijada en {{total}}. Solo el DM puede cambiarla.',
  'combat.initiative.rolledUnsaved': 'Ya tiraste: {{total}}. Guarda esa tirada para fijarla.',
  'combat.initiative.logFailed':
    'No se pudieron comprobar tus tiradas anteriores. Puedes reintentar o tirar igualmente.',
  'combat.initiative.checking': 'Comprobando tus tiradas…',
  'rest.logFailed':
    'No se pudieron comprobar tus tiradas anteriores. Puedes reintentar o tirar igualmente.',
  'rest.checking': 'Comprobando tus tiradas…',
  'roll.totalWord': 'Total',
  'diceSettings.confirmVisibility.narrowerRoller':
    'Con «Solo quien tira», cada jugador solo ve las suyas y tú dejas de ver las de los jugadores, las anteriores incluidas.',
  'combat.initiative.rollApp': 'Rytta tira d20 {{bonus}} por ti.',
  'combat.initiative.alreadyRolled': 'Ya tiraste: {{total}}. Solo el DM puede cambiarla.',
  'rest.alreadyRolled':
    'Ya tiraste los dados de golpe: {{roll}}. Con la tirada hecha no se puede cambiar cuántos gastas. El DM puede restablecerla.',
  'rest.notRolled': 'Sin tirar',
  'rest.rollResult': 'Tu tirada',
  // RYT-137: the server allows one roll per fight (initiative) and per rest (hit dice).
  'roll.error.already-rolled':
    'Ya hay una tirada tuya para esto. No se ha hecho otra ni se ha guardado ningún número. El DM puede restablecerla.',
  'roll.error.roll-required':
    'Esto necesita una tirada hecha en Rytta. No se ha guardado nada: tira primero.',
  'combat.initiative.refusedAlready':
    'Rytta ya tiene tu tirada de iniciativa de este combate. No se ha hecho otra. Si debe cambiar, el DM puede restablecerla.',
  'combat.initiative.refusedInvalid':
    'El servidor no aceptó la tirada: tu bonificador de iniciativa tiene que estar entre −20 y +30. No se ha tirado nada.',
  'combat.initiative.rolledHidden':
    'Ya hay una tirada tuya en este combate. Si debe cambiar, el DM puede restablecerla.',
  'rest.rolledHidden':
    'Ya hay una tirada tuya de dados de golpe. Si debe cambiar, el DM puede restablecerla.',
  'rest.refusedAlready': 'Rytta ya tiene tus dados de golpe. No se ha hecho otra tirada.',
  'rest.refusedInvalid':
    'El servidor no aceptó la tirada: revisa cuántos dados gastas (no más de los que te quedan). No se ha tirado nada.',
  'combat.error.rollRequired':
    'Tu iniciativa tiene que salir de tu tirada en Rytta. Tira y guarda ese resultado.',
  'combat.error.invalidRoll': 'El servidor no aceptó esa tirada. No se ha cambiado nada.',
  'combat.error.rollLimit': 'Demasiadas tiradas seguidas. Espera un momento y vuelve a intentarlo.',
  'rest.error.rollRequired':
    'Los dados de golpe tienen que salir de tu tirada en Rytta. Tira primero.',
  'rest.error.rollLimit': 'Demasiadas tiradas seguidas. Espera un momento y vuelve a intentarlo.',
  'combat.row.clearRoll': 'Borrar su tirada de iniciativa',
  'combat.row.rerollInitiative': 'Tirar su iniciativa de nuevo',
  'combat.reset.cleared': '{{name}} puede volver a tirar su iniciativa.',
  'combat.reset.rerolled': 'La iniciativa de {{name}} se ha tirado de nuevo.',
  'rest.dm.resetRoll': 'Restablecer los dados de golpe de {{name}}',
  'rest.dm.resetNote':
    '{{name}} ya tiró los dados de golpe. Restablécelos para que pueda tirar otra vez.',
  'rest.dm.resetDone': 'Tirada restablecida: {{name}} puede volver a tirar.',
  'rest.dm.resetDoneVote':
    'Tirada restablecida: se quitó el voto de {{name}} y tiene que votar de nuevo.',
} satisfies Record<keyof typeof diceEn, string>
