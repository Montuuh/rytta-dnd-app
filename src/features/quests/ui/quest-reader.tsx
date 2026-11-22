import { useEffect, useState } from 'react'
import { Stack, Text, Title, VisuallyHidden } from '@mantine/core'
import { Check, Circle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCampaign, useIsRealDm } from '@/features/campaigns'
import { useMarkQuestSeen } from '../api'
import { doneCount, objectiveIsNew, questIsNew, type Quest } from '../domain/quest'

/** A Player reads a quest. Opening it clears its marks; what was new stays marked while it is open. */
export function QuestReader({ quest }: { quest: Quest }) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const realDm = useIsRealDm()
  const mark = useMarkQuestSeen(campaign.id)
  // The marks compare with the time the Player last opened it, before this visit.
  const [seenAt] = useState(quest.seen_at)
  const fresh = questIsNew(quest, false)
  useEffect(() => {
    if (fresh && !realDm) mark.mutate(quest.id)
    // Only when a quest is opened (or changes while open).
  }, [quest.id, quest.changed_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = quest.objectives.length
  return (
    <article className="quest-panel quest-reader" aria-labelledby={`quest-${quest.id}`}>
      <Stack gap="md">
        <div>
          <Title order={2} id={`quest-${quest.id}`} className="quest-title user-copy">
            {quest.title}
          </Title>
          <Text size="sm" c="dimmed">
            {t(`quests.statusOne.${quest.status}`)}
            {total > 0 && ` · ${t('quests.progress', { done: doneCount(quest), total })}`}
          </Text>
        </div>
        {quest.summary && <Text className="quest-summary user-copy">{quest.summary}</Text>}
        {total > 0 && (
          <section aria-labelledby={`quest-${quest.id}-objectives`}>
            <Title order={3} id={`quest-${quest.id}-objectives`} className="quest-subhead">
              {t('quests.objectives')}
            </Title>
            <ul className="quest-objectives">
              {quest.objectives.map((objective) => (
                <li key={objective.id} data-done={objective.done || undefined}>
                  <span className="quest-mark" aria-hidden="true">
                    {objective.done ? <Check size={18} strokeWidth={3} /> : <Circle size={10} />}
                  </span>
                  <span className="quest-objective-body user-copy">
                    {objective.done && (
                      <VisuallyHidden>{`${t('quests.statusOne.completed')}: `}</VisuallyHidden>
                    )}
                    {objective.body}
                  </span>
                  {objectiveIsNew(objective, seenAt) && (
                    <span className="quest-new">{t('quests.objectiveNew')}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </Stack>
    </article>
  )
}
