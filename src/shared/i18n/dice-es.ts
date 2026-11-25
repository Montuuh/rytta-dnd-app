import type { diceEn } from './dice-en'

/** RYT-133: los dados de la mesa (ajuste del DM), lo que dice la ficha, las tiradas en la app y
 * las últimas tiradas. */
export const diceEs = {
  'dm.panelDice': 'Dados',
  'diceSettings.modeLegend': 'Cómo se tira',
  'diceSettings.visibilityLegend': 'Quién ve las tiradas',
  'diceSettings.mode.physical': 'Dados físicos',
  'diceSettings.mode.physicalHint': 'Cada jugador tira sus dados y puede anotar el resultado.',
  'diceSettings.mode.app': 'Dados en la app',
  'diceSettings.mode.appHint': 'Rytta tira y anota cada tirada; nadie puede cambiarla.',
  'diceSettings.mode.player': 'Cada jugador elige',
  'diceSettings.mode.playerHint':
    'Cada uno elige en su dispositivo; hasta entonces, dados físicos.',
  'diceSettings.visibility.roller_dm': 'Quien tira y el DM',
  'diceSettings.visibility.roller_dmHint': 'El resto de la mesa no ve la tirada.',
  'diceSettings.visibility.table': 'Toda la mesa',
  'diceSettings.visibility.tableHint': 'Todos los miembros activos ven cada tirada.',
  'diceSettings.visibility.roller': 'Solo quien tira',
  'diceSettings.visibility.rollerHint': 'Ni siquiera el DM ve la tirada.',
  'diceSettings.saved': 'Ajustes de dados guardados.',
  'diceSettings.confirmTitle': '¿Cambiar los dados de la mesa?',
  'diceSettings.confirmMode.physical':
    'Las fichas dicen qué tirar; la iniciativa y los dados de golpe se escriben a mano. Ningún dato de personaje cambia.',
  'diceSettings.confirmMode.app':
    'En las fichas, los números dejan de decir qué tirar y tiran al tocarlos; la iniciativa y los dados de golpe también. Ningún dato de personaje cambia.',
  'diceSettings.confirmMode.player':
    'Hasta que cada jugador elija, sus fichas funcionan como con dados físicos.',
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
    'Ya tiraste los dados de golpe: {{roll}}. Con la tirada hecha no se puede cambiar cuántos gastas.',
  'rest.notRolled': 'Sin tirar',
  'rest.rollResult': 'Tu tirada',
  // RYT-137: the server allows one roll per fight (initiative) and per rest (hit dice).
  'roll.error.already-rolled':
    'Ya hay una tirada tuya para esto. No se ha hecho otra ni se ha guardado ningún número. El DM puede restablecerla.',
  'roll.error.roll-required':
    'Esto necesita una tirada hecha en Rytta. No se ha guardado nada: tira primero.',
  'combat.initiative.refusedAlready': 'Rytta ya tiene tu tirada de iniciativa de este combate.',
  'combat.initiative.bonusUpdated':
    'Tu ficha se ha actualizado y no se guardó ninguna tirada. Vuelve a tirar.',
  'combat.initiative.refusedBonus':
    'Rytta no acepta el bonificador de tu ficha y no guardó ninguna tirada. Pide al DM que fije tu total.',
  'combat.initiative.refusedInvalid':
    'El servidor no aceptó esta tirada de iniciativa. No se ha tirado nada.',
  'combat.initiative.rolledHidden':
    'Ya hay una tirada tuya en este combate. Si debe cambiar, el DM puede restablecerla.',
  'rest.rolledHidden':
    'Hay una tirada de dados de golpe tuya que no puedes ver (la hizo el DM). Si descansas ahora será sin dados; pide al DM que la descarte antes si quieres gastarlos.',
  'rest.refusedAlready': 'Rytta ya tiene tu tirada de dados de golpe.',
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
  'rest.dm.resetRoll': 'Descartar la tirada de dados de golpe de {{name}}',
  'rest.dm.resetNote':
    '{{name}} ya tiró los dados de golpe. Descartar su tirada quita también su voto si votó con esos dados.',
  'rest.dm.resetDone': 'Tirada descartada: {{name}} puede volver a tirar.',
  'rest.dm.resetDoneVote':
    'Tirada descartada: se quitó el voto de {{name}}, que tiene que votar de nuevo.',
  'combat.initiative.bonusRange':
    'Tu bonificador de iniciativa ({{bonus}}) queda fuera de lo que Rytta puede tirar: de −20 a +30. Corrígelo en tu ficha.',
} satisfies Record<keyof typeof diceEn, string>
