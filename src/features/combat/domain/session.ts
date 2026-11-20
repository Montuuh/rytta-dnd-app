import { z } from 'zod'

const namedRecord = z.object({ id: z.uuid(), name: z.string().min(1).max(80) })
export const planSchema = z.object({
  sceneId: z.uuid().nullable(),
  reward: z.string().max(2000),
  attendanceSet: z.boolean(),
  scenes: z.array(namedRecord),
})
export type EncounterPlan = z.infer<typeof planSchema>
export const continuitySchema = z.object({
  lastEncounter: namedRecord.nullable(),
  privateNote: z.string().max(2000),
  nextScene: z.string().max(2000),
  pendingReward: z.string().max(2000),
  sharedRecap: z.string().max(2000),
  revision: z.number().int().nonnegative(),
})
export type SessionContinuity = z.infer<typeof continuitySchema>
export type SessionContinuityInput = Omit<SessionContinuity, 'lastEncounter'> & {
  encounterId?: string | null
}
export type EncounterPlanInput = {
  encounterId: string
  revision: number
  sceneId: string | null
  reward: string
  attendees: string[] | null
}
