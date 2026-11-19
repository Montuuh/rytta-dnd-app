import { z } from 'zod'
import { combatErrorCode } from '../domain/combat'
import {
  continuitySchema,
  planSchema,
  type EncounterPlanInput,
  type SessionContinuityInput,
} from '../domain/session'
import { combatClient } from './repository'

export async function loadEncounterPlan(
  campaignId: string,
  encounterId: string,
  signal: AbortSignal,
) {
  const db = await combatClient()
  const { data, error } = await db
    .rpc('get_encounter_plan', { target_campaign: campaignId, target_encounter: encounterId })
    .abortSignal(signal)
  if (error) throw new Error(combatErrorCode(error.message))
  return planSchema.parse(data)
}
export async function loadContinuity(campaignId: string, signal: AbortSignal) {
  const db = await combatClient()
  const { data, error } = await db
    .rpc('get_session_continuity', { target_campaign: campaignId })
    .abortSignal(signal)
  if (error) throw new Error(combatErrorCode(error.message))
  return continuitySchema.parse(data)
}
export async function loadSharedRecap(campaignId: string, signal: AbortSignal) {
  const db = await combatClient()
  const { data, error } = await db
    .rpc('get_shared_session_recap', { target_campaign: campaignId })
    .abortSignal(signal)
  if (error) throw new Error(combatErrorCode(error.message))
  return z.string().max(2000).parse(data)
}
export async function savePlan(campaignId: string, input: EncounterPlanInput, requestId: string) {
  const db = await combatClient()
  const { error } = await db.rpc('save_encounter_plan', {
    target_campaign: campaignId,
    target_encounter: input.encounterId,
    expected_revision: input.revision,
    target_scene: input.sceneId,
    planned_reward: input.reward,
    attendees: input.attendees,
    request_id: requestId,
  })
  if (error) throw new Error(combatErrorCode(error.message))
}
export type DuplicateInput = { encounterId: string; name: string }
export async function duplicatePlan(campaignId: string, input: DuplicateInput, requestId: string) {
  const db = await combatClient()
  const { data, error } = await db.rpc('duplicate_encounter_plan', {
    target_campaign: campaignId,
    target_encounter: input.encounterId,
    encounter_name: input.name,
    request_id: requestId,
  })
  if (error) throw new Error(combatErrorCode(error.message))
  return z.object({ encounter_id: z.uuid() }).parse(data).encounter_id
}
export async function saveContinuity(
  campaignId: string,
  input: SessionContinuityInput,
  requestId: string,
) {
  const db = await combatClient()
  const { error } = await db.rpc('save_session_continuity', {
    target_campaign: campaignId,
    expected_revision: input.revision,
    target_encounter: input.encounterId ?? null,
    use_latest: input.encounterId === undefined,
    private_note: input.privateNote,
    next_scene: input.nextScene,
    pending_reward: input.pendingReward,
    shared_recap: input.sharedRecap,
    request_id: requestId,
  })
  if (error) throw new Error(combatErrorCode(error.message))
}
