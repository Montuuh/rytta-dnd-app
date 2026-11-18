import { Button, Text } from '@mantine/core'
import { ArrowUp, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import './level-up.css'

/**
 * RYT-130: shown on the sheet of a Player whose finished character is below the party level the
 * DM set. One primary action opens the guided level-up; during a fight the action waits.
 */
export function LevelUpPrompt({
  name,
  level,
  party,
  locked,
  onStart,
}: {
  name: string
  level: number
  party: number
  locked: boolean
  onStart: () => void
}) {
  const { t } = useTranslation()
  const toLevel = level + 1
  const left = party - level
  return (
    <section className="levelup-prompt" aria-labelledby="levelup-prompt-title">
      <div
        className="levelup-prompt-seal"
        role="img"
        aria-label={t('levelUp.fromTo', { from: level, to: toLevel })}
      >
        <span aria-hidden="true">{level}</span>
        <ArrowUp size={14} aria-hidden="true" />
        <span aria-hidden="true">{toLevel}</span>
      </div>
      <div className="levelup-prompt-copy">
        <h2 id="levelup-prompt-title" className="levelup-prompt-title">
          {t('levelUp.promptTitle', { party })}
        </h2>
        <Text size="sm">
          <span className="user-copy">{t('levelUp.promptBody', { name, level })}</span>
          {left > 1 ? ` ${t('levelUp.stepsLeft', { count: left })}` : ''}
        </Text>
      </div>
      <div className="levelup-prompt-action">
        <Button
          data-levelup-prompt-cta
          leftSection={<ArrowUp size={18} aria-hidden="true" />}
          aria-disabled={locked || undefined}
          aria-describedby={locked ? 'levelup-prompt-locked' : undefined}
          onClick={() => !locked && onStart()}
        >
          {t('levelUp.promptCta', { level: toLevel })}
        </Button>
        {locked && (
          <Text size="sm" c="dimmed" id="levelup-prompt-locked" className="levelup-prompt-locked">
            <Swords size={16} aria-hidden="true" />
            {t('levelUp.promptLocked')}
          </Text>
        )}
      </div>
    </section>
  )
}
