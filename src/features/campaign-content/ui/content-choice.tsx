import { useId, useState } from 'react'
import { Button, Checkbox, Collapse, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { shortPackName } from '@/shared/api/pack-origins'
import { PackCover } from '@/shared/ui/pack-cover'
import {
  choiceKey,
  contentCategories,
  defaultChoice,
  startsFromSrd,
  type ContentChoice,
} from '../domain/content'
import './content.css'

/**
 * RYT-167 (owner choice P2 A), RYT-184 (finding 22): the packs a new campaign uses, per category.
 * Closed, it is one line naming what the campaign starts with; "Change" opens the checkboxes. The
 * SRD and the Rytta basics come ticked; the DM changes them later in Content.
 */
export function ContentChoiceFields({
  choices,
  value,
  onChange,
  userId,
}: {
  choices: readonly ContentChoice[]
  value: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  userId: string | undefined
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const summaryId = useId()
  const language = i18n.language.startsWith('en') ? 'en' : 'es'
  const title = (pack: ContentChoice) =>
    (language === 'en' ? pack.title_en : pack.title_es) || pack.title_en || pack.title_es
  // The same short name the panel and the row marks use; a long base title falls back to "SRD".
  const shortName = (pack: ContentChoice) =>
    shortPackName(title(pack), pack.srd, t('campaignContent.choice.srdShort'))
  const toggle = (key: string, on: boolean) => {
    const next = new Set(value)
    if (on) next.add(key)
    else next.delete(key)
    onChange(next)
  }
  if (choices.length === 0) return <Text size="sm">{t('campaignContent.choice.none')}</Text>

  const used = choices.filter((pack) =>
    pack.categories.some((item) => value.has(choiceKey(pack.id, item.category))),
  )
  const picked = contentCategories.filter((category) =>
    used.some((pack) => value.has(choiceKey(pack.id, category))),
  )
  const defaults = defaultChoice(choices)
  const isDefault = value.size === defaults.size && [...value].every((key) => defaults.has(key))
  const list = new Intl.ListFormat(language, { style: 'long', type: 'conjunction' })
  const summary =
    used.length === 0
      ? t('campaignContent.choice.summaryNone')
      : t('campaignContent.choice.summary', { packs: list.format(used.map(shortName)) })
  const detail =
    used.length === 0
      ? t('campaignContent.choice.nothingPicked')
      : isDefault
        ? t('campaignContent.choice.everything')
        : picked.length === contentCategories.length
          ? t('campaignContent.choice.allCategories')
          : t('campaignContent.choice.only', {
              list: list.format(
                picked.map((category) =>
                  t(`campaignContent.category.${category}`).toLocaleLowerCase(language),
                ),
              ),
            })
  const front = used[0] ?? choices[0]!

  return (
    <Stack gap="xs" className="content-choice">
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-1">
        <div className="tw:flex tw:min-w-[10rem] tw:flex-1 tw:items-center tw:gap-3">
          <PackCover path={front.cover} title={shortName(front)} userId={userId} size="sm" />
          <div className="tw:min-w-0 tw:flex-1">
            <Text id={summaryId} size="sm" fw={600} className="user-copy" role="status">
              {summary}
            </Text>
            <Text size="xs" c="dimmed">
              {detail}
            </Text>
          </div>
        </div>
        <Button
          variant="subtle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-describedby={summaryId}
          onClick={() => setOpen((now) => !now)}
        >
          {t('campaignContent.choice.change')}
        </Button>
      </div>
      <Collapse expanded={open} id={panelId}>
        <Stack gap="md" pt="xs">
          <Text size="xs" c="dimmed">
            {t('campaignContent.choice.hint')}
          </Text>
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
                  const entries = pack.categories.find(
                    (item) => item.category === category,
                  )!.entries
                  const count = t(`campaignContent.choice.kind.${category}`, { count: entries })
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
                        <span className="user-copy">{shortName(pack)}</span>
                        <span className="content-choice-meta">
                          {startsFromSrd(pack, title(pack)) &&
                            `${t('campaignContent.basedOnSrd')} · `}
                          {pack.private
                            ? t('campaignContent.choice.private', { label: count })
                            : count}
                        </span>
                      </span>
                    </Checkbox.Card>
                  )
                })}
              </fieldset>
            )
          })}
        </Stack>
      </Collapse>
    </Stack>
  )
}
