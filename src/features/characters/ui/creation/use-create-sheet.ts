import { useNavigate } from 'react-router'
import { useCampaign } from '@/features/campaigns'
import { newRequestId } from '@/shared/lib/request-id'
import { useSheetAction } from '../../api'
import type { SheetDraft, SheetRow } from '../../domain/sheet'

/** Save the sheet (and the name when it changed) in one go; the server keeps both in order. */
export function useCreateSheet(sheet: SheetRow, currentName: string, sheetPath: string) {
  const campaign = useCampaign()
  const action = useSheetAction(campaign.id)
  const navigate = useNavigate()
  const create = async (draft: SheetDraft, name: string) => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== currentName)
      await action.mutateAsync({
        kind: 'rename',
        characterId: sheet.character_id,
        name: trimmed,
        requestId: newRequestId(),
      })
    await action.mutateAsync({
      kind: 'save',
      characterId: sheet.character_id,
      expectedRevision: sheet.revision,
      draft,
      complete: true,
      requestId: newRequestId(),
    })
    void navigate(sheetPath)
  }
  return { create, action }
}
