# RYT-137 - frontend notes

Screenshots in this folder are captured by the dice specs with `RYT_EVIDENCE=1` at 390px and
820px, in Hearth (`default`) and Parchment, in Spanish and English.

## Deliberate change: `combat-menu-danger`

The "Remove from combat" item of the DM row menu and of the combatant's DM menu no longer uses
Mantine's `color="red"`. It uses the theme's own `--danger` colour (class `combat-menu-danger`),
because the default red failed AA contrast on Parchment (3.28:1) once the menu was audited. The
item reads the same in Hearth and Bard; it loses the reddish hover background Mantine gave it.

## Known residuals (security review)

- The initiative modifier is declared by the client (the server rolls the d20; it does not know
  the sheet's bonus). The DM can read the expression of a roll.
- A DM re-roll sent straight to `reset_initiative_roll` for a hidden combatant is stored with the
  campaign's roll visibility. The frontend never offers it for a hidden combatant.
