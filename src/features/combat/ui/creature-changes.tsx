import { Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'

export type CreatureChange = {
  field: string
  before: string | number
  after: string | number
}

export function CreatureChanges({
  changes,
  sections = [],
  reference,
  collapsible = false,
}: {
  changes: CreatureChange[]
  sections?: string[]
  reference: string
  collapsible?: boolean
}) {
  const { t } = useTranslation()
  const entries = changes.filter((entry) => entry.before !== entry.after)
  const count = entries.length + sections.length
  if (count === 0) return null

  const heading = t('bestiary.changes.title', { name: reference, count })
  const list = (
    <ul className="creature-change-list">
      {entries.map(({ field, before, after }) => (
        <li key={field}>{t('bestiary.changes.line', { field, before, after })}</li>
      ))}
      {sections.map((field) => (
        <li key={field}>{t('bestiary.changes.section', { field })}</li>
      ))}
    </ul>
  )
  return collapsible ? (
    <details className="creature-changes">
      <summary>{heading}</summary>
      {list}
    </details>
  ) : (
    <div className="creature-changes">
      <Text size="sm" fw={650}>
        {heading}
      </Text>
      {list}
    </div>
  )
}
