import { z } from 'zod'
export const safeAmount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const resourceSchema = z.object({
  gold: safeAmount,
  water_units: safeAmount.max(2147483647),
  rations: safeAmount.max(2147483647),
  exhaustion: safeAmount.max(2147483647),
  revision: safeAmount,
})
export const characterSchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  user_id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(100),
  // PostgREST exposes this composite-FK reverse relationship as an array
  // (generated isOneToOne=false). Require exactly one resource row, then normalize.
  character_resources: resourceSchema
    .array()
    .length(1)
    .transform((rows) => rows[0]!),
})
export type Character = z.infer<typeof characterSchema>
export type Resources = z.infer<typeof resourceSchema>
export type CharacterAction =
  | { kind: 'assign'; characterId: string; userId: string }
  | { kind: 'create'; name: string }
  | { kind: 'invite'; characterId: string; email: string }
  | { kind: 'unassign'; characterId: string; expectedUser: string }
  | { kind: 'resources'; characterId: string; values: Resources; requestId: string }
