# Combat module: design analysis

Tickets: RYT-007 (shared combat core), RYT-036 (encounter preparation and bestiary), RYT-037
(combat tools), RYT-038 (table display). Decision record: [ADR 024](decisions/024-combat.md).
This document is the design analysis behind the delivery. It separates observations (what the table needs) from
decisions (what Rytta builds) and lists deliberate non-goals.

## 1. Context and constraints

- In-person play: dice are physical, the battle map lives on a shared screen or a VTT
  ([research](research.md)), and every Player has a phone or tablet. Rytta must keep the table
  playing; it is not a VTT and does not resolve attacks.
- Character hit points, death saves and conditions already live in `character_vitals` and are
  edited from the sheet (RYT-024). Party live sharing (ADR 020) already defines what teammates
  may see. Combat must not fork that truth.
- PostgreSQL RLS is authoritative; the browser never performs read-modify-write on shared state
  (AGENTS.md). Realtime is a hint, not a source of truth (RYT-013).
- Touch first, 44px targets, keyboard and Escape, both themes, Spanish and English, no colour-only
  status (design system).

## 2. Jobs to be done

| Role   | Job                                                                          | Moment                |
| ------ | ---------------------------------------------------------------------------- | --------------------- |
| DM     | Prepare encounters before the session (who, how many, hidden reinforcements) | Prep                  |
| DM     | Start fast: the whole party in one tap, monsters in batches with numbering   | Start                 |
| DM     | Collect initiative without reading out every number                          | Start                 |
| DM     | Know at a glance whose turn it is and who is next; never lose the round      | Every turn            |
| DM     | Apply damage to one or many targets (area spells, half on a save)            | Every turn            |
| DM     | Remember timed effects, concentration and legendary actions                  | Every turn            |
| DM     | Fix mistakes without arithmetic (undo)                                       | Any time              |
| DM     | Keep secrets: hidden enemies, exact monster HP, notes                        | Always                |
| Player | Enter the own initiative on the own device                                   | Start                 |
| Player | Know "it is my turn" / "I am up in 2 turns" without asking                   | Every turn            |
| Player | Track own HP, temporary HP, conditions, concentration and death saves        | Own turn and when hit |
| Player | See how the party and the enemies are doing, without spoilers                | Always                |
| Table  | A large read-only view on the shared screen                                  | Always                |

## 3. Feature set

1. **Encounter lifecycle**: `draft → initiative → active → ended`, with `initiative → draft`
   (cancel) and `draft → active` (skip initiative, for surprise rounds). Several drafts per
   campaign, one live encounter. Drafts are invisible to Players.
2. **Combatants**: characters by reference (their vitals stay in the sheet), NPCs/monsters with
   their own HP/AC, an optional lair (initiative 20, loses ties). Sides: party, ally, enemy.
   Batch creation with numbering (Goblin 1..n), optional shared initiative for a group, added
   hidden for reveal later, and mid-fight reinforcements.
3. **Bestiary** (homebrew templates, DM only): name, side, HP, AC, initiative bonus, legendary
   actions, notes. Rytta bundles no monster stat blocks (licensing).
4. **Initiative**: each Player types the d20 total (the keypad shows the own bonus from the
   sheet); the DM sees who is missing, types any value, or lets the server roll d20 + bonus for
   creatures (one roll per group). Ties: higher bonus first, then a DM order adjusted with
   up/down buttons (no drag-only interaction).
5. **Turns**: next/previous, jump to a combatant, round counter. Hidden and defeated combatants
   are skipped; a character at 0 HP keeps its turn to roll death saves. Players may end their
   own turn. Double taps and two DMs are guarded by the expected active combatant.
   **Roster changes during the fight (RYT-041)**: the DM adds a party character with its
   initiative total and removes any combatant after a confirmation. Turns follow the order by
   position, so a newcomer above the active slot acts from the next round and one below still
   acts this round (the dialog previews its neighbours and says which). Removing the active
   combatant passes the turn forward (wrapping into the next round) exactly like "next turn";
   effects on the leaving combatant end and clear the conditions they granted on the sheet.
6. **Hit points**: server-side deltas (damage, heal, temporary). Temporary HP absorb first and do
   not stack. A character at 0 falls unconscious and loses concentration; damage at 0 adds a
   death save failure; healing wakes and resets saves. NPCs at 0 are defeated. Multi-target
   damage with a per-target "half (save)" toggle, applied in one transaction.
7. **Conditions**: the 14 SRD 5.2 conditions. Characters use `character_vitals.conditions`
   (same as the sheet); NPCs keep their own. Exhaustion stays a DM resource (RYT-003).
8. **Timed effects**: label, optional condition, rounds, counting at the start or end of a
   chosen combatant's turn. The server expires them during turn changes and removes the
   condition when no other effect grants it. DM effects can be secret.
9. **Concentration**: a note of the spell; on damage the screen shows the Constitution save DC
   (max(10, half the damage), up to 30 — SRD 5.2, CC-BY-4.0, attributed on screen).
10. **Death saves**: success, failure, natural 1 (two failures), natural 20 (regain 1 HP);
    three successes show "Stable", three failures mark the character dead.
11. **Legendary actions**: a counter per creature, reset at the start of its turn.
12. **Combat log**: typed events with round and attribution, private DM entries, and a
    compensating undo of HP, condition, concentration and death-save changes (refused when the
    target changed afterwards). Players undo their own changes on their own character.
13. **Summary**: rounds, damage dealt (attributed to whoever held the turn), taken, healing,
    downed and defeated, kept with the encounter.
14. **Table display**: a large read-only projection that never carries DM secrets, even when the
    DM opens it.

## 4. Visibility model

| Data                                                 | DM  | Own character | Shared teammate | Unshared teammate | Visible NPC   | Hidden NPC |
| ---------------------------------------------------- | --- | ------------- | --------------- | ----------------- | ------------- | ---------- |
| Name, side, initiative, turn                         | ✓   | ✓             | ✓               | ✓                 | ✓             | DM only    |
| Exact HP                                             | ✓   | ✓             | ✓               | —                 | when revealed | DM only    |
| Descriptive status (unhurt, wounded, bloodied, down) | ✓   | ✓             | ✓               | "not shared"      | ✓             | DM only    |
| AC                                                   | ✓   | ✓             | ✓               | —                 | —             | DM only    |
| Conditions, concentration                            | ✓   | ✓             | ✓               | —                 | ✓             | DM only    |
| Death saves, exhaustion                              | ✓   | ✓             | ✓               | —                 | n/a           | n/a        |
| DM notes, secret effects, private log entries        | ✓   | —             | —               | —                 | —             | —          |

The table view uses the Player projection without "own" data.

## 5. Information architecture and screens

```
/combat                      DM: encounters (live, prepared, finished) | bestiary
                             Player: the live encounter, or "no fight now" + past fights
/combat/:id                  DM console | Player view
/combat/:id/table            Table display (read-only; only the DM has a way back to the console)
```

**DM console — tablet/laptop (≥ 62em)**

```
┌ Back · Encounter name · [status] Round 3 · live/polling ─── [Table view] [⋯] ┐
│ flow strip: Ask for initiative / Roll for creatures / Start / End combat       │
├────────────── initiative order ─────────────┬──── Details | Log | Add ────────┤
│ 18 ▣ Arin   ACTING NOW  24/24 HP · unhurt   │ Goblin 1 · Enemy · AC 15        │
│ 14 ☠ Goblin 1 ▬▬▬▬ 1/7 HP · bloodied   ↑↓  │ ▬▬▬ 1/7 HP  [Damage][Heal][Temp]│
│ 14 ☠ Goblin 2 ▬▬▬▬ 7/7 HP · unhurt     ↑↓  │ Conditions · Concentration      │
│ 10 ▣ Bea ...                                │ Effects (rounds left)           │
│ [Select targets] → [Damage] [Heal] for N    │ DM controls: hidden, reveal HP, │
│                                             │ defeated, legendary, notes      │
└─────────────── [◀]  Now: Arin · Up next: Goblin 1  [Next turn ▶] ─────────────┘
```

**DM console — phone (390px)**: the same order list full width; tapping a row opens a bottom
sheet with the details; Log and Add are tabs under the list; the turn bar floats above the
bottom navigation, so "Next turn" is always under the thumb.

**Player view**: a hero card ("Your turn!" with "End my turn", or Now / Up next / "You act in
N turns"), the own character panel (HP and quick damage/heal, conditions behind a "Change"
toggle, concentration, effects, death saves when at 0), the shared order (tap for read-only
details) and the visible log. The initiative keypad opens automatically when the DM asks.

**Table display**: encounter name, round, a large "Now / Up next" banner and the order with
descriptive status, readable across the room. No full screen control (browsers and casting
devices already provide one); Players have no exit link (RYT-041, ahead of RYT-042).

## 6. Interaction and accessibility decisions

- The order is an ordered list; the acting combatant has `aria-current="step"` plus the visible
  text "Acting now". Turn changes are announced through a live region; the own turn also vibrates
  the device where supported. The pulse animation respects `prefers-reduced-motion`.
- The DM detail follows the turn (RYT-041): it shows the acting combatant when the fight starts
  and after every next/previous turn; a row picked between turns stays until the turn moves.
  It never swaps while the DM is using the detail (focus or a dialog inside it). Focus stays on
  the control the DM pressed; a polite live region says "Turn of X. Round N.". On phones the
  detail is a sheet opened from a row or from the "Now" name in the turn bar.
- DM row actions (RYT-041): each row has an options button (44px) with "give the turn",
  "change initiative" and "remove from combat"; holding the row or right-clicking opens the same
  menu. Removal confirms in a dialog that names who takes the turn; afterwards focus moves to the
  neighbouring row.
- HP is always text (numbers or a status word) next to the bar; unshared HP uses a hatched bar
  and the words "not shared". Side is an icon plus a hidden text label; never colour alone.
- Every control is at least 44px; the turn buttons are 52px. Dialogs trap focus, close with
  Escape and return focus; scrollable regions (log, summary) are focusable named regions.
- Keypads (from the sheet) avoid the phone keyboard for numbers; quick chips add 1/5/10.
- "Last known" state: when offline, failing, or older than 15 seconds, a banner says the screen
  may be out of date and offers a retry, and the Player cannot end a turn from stale data.

## 7. Data and synchronization

- Realtime publishes only `encounters` (no secrets). Every combat mutation, and every change of
  a fighting character's vitals, sheet or resources, increments its revision; clients refetch the
  role projection `get_combat_state`. Polling (4 s live, 15 s otherwise) covers lost sockets;
  focus and reconnect refetch.
- All writes are idempotent RPCs that lock the campaign row; HP changes are deltas, so the DM
  and a Player hitting the same character at once never overwrite each other.

## 8. Non-goals (this delivery)

Grid/positions, attack and damage roll resolution, monster stat block import, automatic
surprise, XP budgets and encounter difficulty, combat across several campaigns, offline queues.
Candidates for later tickets: per-field sharing, XP/loot hand-off to shops, reaction tracking,
and a VTT adapter (Owlbear) behind a feature boundary.
