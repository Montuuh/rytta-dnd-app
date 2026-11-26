/** RYT-133: the table's dice (the DM's setting), what the sheet says to roll, rolls in the app and
 * the recent rolls. */
export const diceEn = {
  'dm.panelDice': 'Dice',
  'diceSettings.modeLegend': 'How the table rolls',
  'diceSettings.visibilityLegend': 'Who sees the rolls',
  'diceSettings.mode.physical': 'Physical dice',
  'diceSettings.mode.physicalHint': 'Each Player rolls their own dice and can record the result.',
  'diceSettings.mode.app': 'Dice in the app',
  'diceSettings.mode.appHint': 'Rytta rolls and records every roll; nobody can change it.',
  'diceSettings.mode.player': 'Each Player chooses',
  'diceSettings.mode.playerHint': 'Each one chooses on their own device; physical dice until then.',
  'diceSettings.visibility.roller_dm': 'The roller and the DM',
  'diceSettings.visibility.roller_dmHint': 'The rest of the table does not see the roll.',
  'diceSettings.visibility.table': 'The whole table',
  'diceSettings.visibility.tableHint': 'Every active member sees each roll.',
  'diceSettings.visibility.roller': 'Only the roller',
  'diceSettings.visibility.rollerHint': 'Not even the DM sees the roll.',
  'diceSettings.saved': 'Dice settings saved.',
  'diceSettings.confirmTitle': 'Change the table dice?',
  'diceSettings.confirmMode.physical':
    'The sheets say what to roll; initiative and hit dice are typed in. No character data changes.',
  'diceSettings.confirmMode.app':
    'On the sheets, the numbers stop saying what to roll and roll when tapped; initiative and hit dice too. No character data changes.',
  'diceSettings.confirmMode.player':
    'Until each Player chooses, their sheets work as with physical dice.',
  'diceSettings.confirmVisibility.wider':
    'Earlier rolls are not shown to more people: they stay visible only to those who could see them when they were made.',
  'diceSettings.confirmVisibility.narrower':
    'Players stop seeing each other\u0027s rolls, earlier ones included.',
  'diceSettings.errorTitle': 'The dice settings were not saved',
  'diceSettings.error.unavailable': 'Could not reach the server. Nothing changed; try again.',
  'diceSettings.error.forbidden': 'Only a DM of this campaign can change the dice.',
  'diceSettings.error.invalid': 'Those settings are not valid. Close this and choose again.',
  'diceSettings.error.request-mismatch':
    'That request was already used for other settings. Close this and apply the changes again.',

  'diceChoice.label': 'Your dice',
  'diceChoice.physical': 'Physical',
  'diceChoice.app': 'In the app',
  'diceChoice.hint': 'Each Player chooses on their device; your choice is saved here.',

  'roll.name.ability': '{{ability}} check',
  'roll.name.save': '{{ability}} save',
  'roll.name.initiative': 'Initiative',
  'roll.name.hitDie': 'Hit dice',
  'roll.name.deathSave': 'Death save',
  'roll.name.attack': 'Attack with {{weapon}}',
  'roll.name.damage': 'Damage with {{weapon}}',
  'roll.kind.ability': 'Ability check',
  'roll.kind.skill': 'Skill',
  'roll.kind.save': 'Save',
  'roll.kind.attack': 'Attack',
  'roll.kind.damage': 'Damage',
  'roll.kind.initiative': 'Initiative',
  'roll.kind.death_save': 'Death save',
  'roll.kind.hit_die': 'Hit dice',
  'roll.kind.custom': 'Roll',
  'roll.rollAction': 'Roll {{name}}, {{formula}}',
  'roll.recordAction': 'Record the roll for {{name}}, {{formula}}',
  'roll.hintApp': 'Tap an underlined number to roll the dice.',
  'roll.hintPhysical':
    'Roll what each line says and tap the underlined number to record the result.',
  'roll.recordTitle': 'Record: {{name}}',
  'roll.recordFormula': 'Roll {{formula}}.',
  'roll.dieSingle': 'd{{sides}} result',
  'roll.dieN': 'Die {{n}} (d{{sides}})',
  'roll.dieRange': '1 to {{max}}',
  'roll.dieError': 'Enter a number from 1 to {{max}}.',
  'roll.totalLabel': 'Roll total',
  'roll.totalRange': 'Between {{min}} and {{max}}',
  'roll.totalError': 'Enter the total as a whole number.',
  'roll.sum': '{{maths}} = {{total}}',
  'roll.sumTotal': 'Total {{total}}',
  'roll.record': 'Record',
  'roll.errorTitle': 'The roll did not reach the table',
  'roll.error.unavailable':
    'Could not reach the server. The roll was not made or recorded; try again.',
  'roll.error.forbidden': 'Your account cannot record rolls in this campaign.',
  'roll.error.invalid': 'The roll is not valid. Check the numbers.',
  'roll.error.request-mismatch':
    'That request was already used for another roll. Close this and roll again.',
  'roll.error.character-unavailable': 'This character cannot roll now (absent or archived).',
  'roll.error.roll-limit': 'Too many rolls in a row. Wait a moment and try again.',
  'roll.resultLabel': 'Latest roll',
  'roll.rollingShort': 'Rolling the dice…',
  'roll.dismiss': 'Close the roll',
  'roll.recent': 'Recent rolls',
  'roll.seeAll': 'See all {{count}}',
  'roll.loading': 'Loading rolls…',
  'roll.loadError': 'Could not load the rolls.',
  'roll.empty': 'No rolls yet.',
  'roll.dm': 'DM',
  'roll.you': '{{name}} (you)',
  'roll.source.app': 'Rolled by Rytta',
  'roll.source.recorded': 'Recorded',
  'roll.seen.table': 'The whole table sees it.',
  'roll.seen.roller_dm': 'The roller and the DM see it.',
  'roll.seen.roller': 'Only the roller sees it.',
  'roll.notRolled': 'Not rolled',
  'roll.error.dice-mode':
    'The DM changed the table dice. This sheet now uses the new ones: check and roll again.',
  'roll.totalOutOfRange': 'With those dice the total runs from {{min}} to {{max}}.',
  'roll.someone': 'Another character',
  'combat.initiative.waitSheet': 'Loading your sheet: it is needed to roll with your bonus.',
  'combat.initiative.noSheet':
    'Your sheet could not be read, so your bonus is unknown. Retry to be able to roll.',
  'combat.initiative.rollFailed':
    'The initiative could not be rolled. No roll was saved; try again.',
  'rest.rollFailed': 'The hit dice could not be rolled. No roll was saved; try again.',
  'combat.initiative.fixed':
    'Your initiative is already set to {{total}}. Only the DM can change it.',
  'combat.initiative.rolledUnsaved': 'You already rolled: {{total}}. Save that roll to set it.',
  'combat.initiative.logFailed':
    'Your earlier rolls could not be checked. You can retry or roll anyway.',
  'combat.initiative.checking': 'Checking your rolls…',
  'rest.logFailed': 'Your earlier rolls could not be checked. You can retry or roll anyway.',
  'rest.checking': 'Checking your rolls…',
  'roll.totalWord': 'Total',
  'diceSettings.confirmVisibility.narrowerRoller':
    'With "Only the roller", each Player sees only their own and you stop seeing the Players’ rolls, earlier ones included.',
  'combat.initiative.rollApp': 'Rytta rolls d20 {{bonus}} for you.',
  'combat.initiative.alreadyRolled': 'You already rolled: {{total}}. Only the DM can change it.',
  'rest.alreadyRolled':
    'You already rolled the hit dice: {{roll}}. With the roll made, how many you spend cannot change.',
  'rest.notRolled': 'Not rolled',
  'rest.rollResult': 'Your roll',
  // RYT-137: the server allows one roll per fight (initiative) and per rest (hit dice).
  'roll.error.already-rolled':
    'You already have a roll for this. No other roll was made and no number was saved. The DM can reset it.',
  'roll.error.roll-required': 'This needs a roll made in Rytta. Nothing was saved: roll first.',
  'combat.initiative.refusedAlready': 'Rytta already has your initiative roll for this fight.',
  'combat.initiative.bonusUpdated': 'Your sheet was updated and no roll was saved. Roll again.',
  'combat.initiative.refusedBonus':
    "Rytta does not accept your sheet's bonus and saved no roll. Ask the DM to set your total.",
  'combat.initiative.refusedInvalid':
    'The server did not accept this initiative roll. Nothing was rolled.',
  'combat.initiative.rolledHidden':
    'You already have a roll in this fight. If it has to change, the DM can reset it.',
  'rest.rolledHidden':
    'There is a hit-dice roll of yours that you cannot see (the DM made it). Resting now means no hit dice; ask the DM to discard it first to spend them.',
  'rest.refusedAlready': 'Rytta already has your hit-dice roll.',
  'rest.refusedInvalid':
    'The server did not accept the roll: check how many dice you spend (no more than you have left). Nothing was rolled.',
  'combat.error.rollRequired':
    'Your initiative has to come from your roll in Rytta. Roll and save that result.',
  'combat.error.invalidRoll': 'The server did not accept that roll. Nothing was changed.',
  'combat.error.rollLimit': 'Too many rolls in a row. Wait a moment and try again.',
  'rest.error.rollRequired': 'The hit dice have to come from your roll in Rytta. Roll first.',
  'rest.error.rollLimit': 'Too many rolls in a row. Wait a moment and try again.',
  'combat.row.clearRoll': 'Clear their initiative roll',
  'combat.row.rerollInitiative': 'Roll their initiative again',
  'combat.reset.cleared': '{{name}} can roll their initiative again.',
  'combat.reset.rerolled': 'The initiative of {{name}} was rolled again.',
  'rest.dm.resetRoll': 'Discard the hit-dice roll of {{name}}',
  'rest.dm.resetNote':
    '{{name}} already rolled the hit dice. Discarding their roll also removes their vote if they voted with those dice.',
  'rest.dm.resetDone': 'Roll discarded: {{name}} can roll again.',
  'rest.dm.resetDoneVote': 'Roll discarded: the vote of {{name}} was removed and they vote again.',
  'combat.initiative.bonusRange':
    'Your initiative bonus ({{bonus}}) is outside what Rytta can roll: −20 to +30. Fix it on your sheet.',
} as const
