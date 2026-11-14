import type { Attack, EquipmentSlot, Equipped } from '@/features/inventory'
import type { StatBreakdown } from '../../domain/rules'
import type { Build, SheetDraft, SheetRow, Vitals } from '../../domain/sheet'

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
  commit: (values: Vitals, notice?: PanelNotice) => void
  /** Build changes: into the edit draft while editing, otherwise saved at once. */
  change: (update: (draft: SheetDraft) => SheetDraft, notice?: PanelNotice) => void
  onStartEdit?: () => void
}
