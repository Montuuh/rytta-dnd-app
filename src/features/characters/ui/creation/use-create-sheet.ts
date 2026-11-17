import { useNavigate } from 'react-router'
import { useCampaign } from '@/features/campaigns'
import { useSheetAction } from '../../api'
import type { SheetDraft, SheetRow } from '../../domain/sheet'
import { useSubmitGuard } from '../use-submit-guard'

/**
 * Save the sheet (and the name when it changed) in one go; the server keeps both in order.
 * A double tap sends one request pair (in-flight guard) and a repeat after a failure reuses the
 * same request ids. The sheet replaces the creation URL, so Back never reopens the wizard.
 */
export function useCreateSheet(sheet: SheetRow, currentName: string, sheetPath: string) {
  const campaign = useCampaign()
  const action = useSheetAction(campaign.id)
  const navigate = useNavigate()
  const guard = useSubmitGuard()
  const create = async (draft: SheetDraft, name: string) => {
    const trimmed = name.trim()
    const saveKey = `save:${sheet.revision}:${JSON.stringify(draft)}`
    const renameKey = `rename:${trimmed}`
    const finished = await guard.run(async () => {
      if (trimmed && trimmed !== currentName) {
        await action.mutateAsync({
          kind: 'rename',
          characterId: sheet.character_id,
          name: trimmed,
          requestId: guard.idFor(renameKey),
        })
        guard.done(renameKey)
      }
      await action.mutateAsync({
        kind: 'save',
        characterId: sheet.character_id,
        expectedRevision: sheet.revision,
        draft,
        complete: true,
        requestId: guard.idFor(saveKey),
      })
      guard.done(saveKey)
      return true
    })
    if (finished) void navigate(sheetPath, { replace: true })
  }
  return { create, action }
}
