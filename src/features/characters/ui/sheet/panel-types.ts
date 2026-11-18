import type { Attack, EquipmentSlot, Equipped } from '@/features/inventory'
import type { StatBreakdown } from '../../domain/rules'
import type { Build, SheetDraft, SheetRow, Spell, Vitals } from '../../domain/sheet'

export type PanelNotice =
  'sheet.saved' | 'sheet.restDone' | 'panel.added' | 'panel.removed' | 'panel.synced'

/** What every block of the RYT-073 table panel needs. Shown values come from the edit draft
 * while editing and from the saved sheet otherwise. */
export type PanelProps = {
  campaignId: string
  characterId: string
  name: string
  build: Build
  level: number
  maxHp: number
  armorClass: number
  ac: StatBreakdown
  speed: StatBreakdown
  init: StatBreakdown
  equipped: Map<EquipmentSlot, Equipped>
  carriedTenths: number
  attacks: Attack[]
  sheet: SheetRow
  vitals: Vitals
  canEdit: boolean
  editing: boolean
  pending: boolean
  /** RYT-070: a Player whose character fights a live encounter. */
  locked: boolean
  /** RYT-130: a Player's finished sheet changes level by leveling up, not by hand. */
  levelLocked: boolean
  /** Play-state write. `marker` is set when the write also sets (`value`) or ends (`null`) the
   * concentration marker; without it the server leaves the marker alone. */
  commit: (values: Vitals, notice?: PanelNotice, marker?: { value: string | null }) => void
  /** RYT-134: opens the cast dialog for a spell; `opener` gets focus back afterwards. */
  onCast: (spell: Spell, name: string, opener: HTMLElement) => void
  /** RYT-134: what the last cast did, as text (also announced). */
  castNote: string | null
  /** Build changes: into the edit draft while editing, otherwise saved at once. */
  change: (update: (draft: SheetDraft) => SheetDraft, notice?: PanelNotice) => void
  onStartEdit?: () => void
}
