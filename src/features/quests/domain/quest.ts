import { z } from 'zod'

export const questStatuses = ['active', 'rumour', 'completed', 'failed'] as const
export type QuestStatus = (typeof questStatuses)[number]

const time = z.string().nullable()

/** One objective as the DM reads it; Players never receive `visible`. */
export const questObjectiveSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  visible: z.boolean().default(true),
  done: z.boolean(),
  changed_at: time,
})
export type QuestObjective = z.infer<typeof questObjectiveSchema>

export const questSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  status: z.enum(questStatuses),
  /** Only the DM receives drafts; Players' quests are always published. */
  published: z.boolean().default(true),
  revision: z.number().int().nullable().default(null),
  note: z.string().nullable().default(null),
  changed_at: time,
  updated_at: z.string().nullable().default(null),
  /** The Player's own last-opened time; null for the DM or a quest never opened. */
  seen_at: time.default(null),
  objectives: z.array(questObjectiveSchema),
})
export type Quest = z.infer<typeof questSchema>

export const questListSchema = z.object({ dm: z.boolean(), quests: z.array(questSchema) })
export type QuestList = z.infer<typeof questListSchema>

/** What the DM saves: the whole quest and its objective list. */
export type QuestDraft = {
  title: string
  summary: string
  status: QuestStatus
  published: boolean
  note: string
  objectives: { id: string; body: string; visible: boolean; done: boolean }[]
}

export const questLimits = { title: 120, summary: 4000, note: 4000, objective: 200, objectives: 20 }

export type QuestErrorCode = 'forbidden' | 'stale' | 'quota' | 'invalid' | 'gone' | 'unavailable'
export function questError(message: string): QuestErrorCode {
  if (/Forbidden|permission denied/i.test(message)) return 'forbidden'
  if (/Stale revision/i.test(message)) return 'stale'
  if (/Quota/i.test(message)) return 'quota'
  if (/Invalid/i.test(message)) return 'invalid'
  if (/unavailable|not found/i.test(message)) return 'gone'
  return 'unavailable'
}

/** The DM previewing as a Player sees what a Player would: published quests, visible objectives. */
export function playerView(list: QuestList): QuestList {
  if (!list.dm) return list
  return {
    dm: false,
    quests: list.quests
      .filter((quest) => quest.published)
      .map((quest) => ({
        ...quest,
        note: null,
        revision: null,
        seen_at: null,
        objectives: quest.objectives.filter((objective) => objective.visible),
      })),
  }
}

const after = (changed: string | null, seen: string | null) =>
  changed !== null && (seen === null || Date.parse(changed) > Date.parse(seen))

/** A Player has not opened this quest since its last visible change. */
export const questIsNew = (quest: Quest, dm: boolean) =>
  !dm && after(quest.changed_at, quest.seen_at)

/** An objective revealed or changed after the Player last opened the quest (never on a first read). */
export const objectiveIsNew = (objective: QuestObjective, seenAt: string | null) =>
  seenAt !== null && after(objective.changed_at, seenAt)

export function groupByStatus(quests: Quest[]) {
  const groups: Record<QuestStatus, Quest[]> = { active: [], rumour: [], completed: [], failed: [] }
  for (const quest of quests) groups[quest.status].push(quest)
  return groups
}

export const doneCount = (quest: Quest) =>
  quest.objectives.filter((objective) => objective.done).length

export function draftOf(quest: Quest): QuestDraft {
  return {
    title: quest.title,
    summary: quest.summary,
    status: quest.status,
    published: quest.published,
    note: quest.note ?? '',
    objectives: quest.objectives.map(({ id, body, visible, done }) => ({
      id,
      body,
      visible,
      done,
    })),
  }
}

export const emptyDraft = (): QuestDraft => ({
  title: '',
  summary: '',
  status: 'active',
  published: false,
  note: '',
  objectives: [],
})
