import { Checkbox, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { choiceKey, contentCategories, type ContentChoice } from '../domain/content'
import './content.css'

/**
 * RYT-167 (owner choice P2 A): the packs a new campaign uses, per category. The SRD and the Rytta
 * basics come ticked; the DM changes them later in Content.
 */
export function ContentChoiceFields({
  choices,
  value,
  onChange,
}: {
  choices: readonly ContentChoice[]
  value: ReadonlySet<string>
  onChange: (next: Set<string>) => void
}) {
  const { t, i18n } = useTranslation()
  const title = (pack: ContentChoice) =>
    (i18n.language.startsWith('en') ? pack.title_en : pack.title_es) ||
    pack.title_en ||
    pack.title_es
  const toggle = (key: string, on: boolean) => {
    const next = new Set(value)
    if (on) next.add(key)
    else next.delete(key)
    onChange(next)
  }
  if (choices.length === 0) return <Text size="sm">{t('campaignContent.choice.none')}</Text>
  return (
    <Stack gap="md" className="content-choice">
      {contentCategories.map((category) => {
        const packs = choices.filter((pack) =>
          pack.categories.some((item) => item.category === category),
        )
        if (packs.length === 0) return null
        return (
          <fieldset key={category} className="plain-fieldset content-choice-group">
            <legend className="content-choice-legend">
              {t(`campaignContent.category.${category}`)}
            </legend>
            {packs.map((pack) => {
              const key = choiceKey(pack.id, category)
              const entries = pack.categories.find((item) => item.category === category)!.entries
              return (
                <Checkbox.Card
                  key={key}
                  className="content-choice-pack"
                  withBorder={false}
                  checked={value.has(key)}
                  onChange={(checked) => toggle(key, checked)}
                >
                  <Checkbox.Indicator aria-hidden="true" />
                  <span className="content-choice-text">
                    <span className="user-copy">{title(pack)}</span>
                    <span className="content-choice-meta">
                      {t(
                        pack.private
                          ? 'campaignContent.choice.private'
                          : 'campaignContent.choice.entries',
                        { count: entries },
                      )}
                    </span>
                  </span>
                </Checkbox.Card>
              )
            })}
          </fieldset>
        )
      })}
    </Stack>
  )
}
