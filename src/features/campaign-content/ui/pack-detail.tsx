import { useRef, useState } from 'react'
import { Button, Switch, Text } from '@mantine/core'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useContentAction } from '../api'
import {
  categoryGender,
  liveCategories,
  startsFromSrd,
  titleOf,
  type ContentCategory,
  type ContentPack,
} from '../domain/content'
import { actionMessage } from './action-message'
import { ContentSheet } from './content-sheet'
import { EntriesSheet } from './entries-sheet'

/**
 * RYT-184 "Personalizar": the pack's categories, each with its own switch, and for each one in use
 * a row that opens its entries.
 */
export function PackDetailSheet({
  campaignId,
  pack,
  name,
  open,
  onClose,
  onClosed,
  finalFocus,
}: {
  campaignId: string
  pack: ContentPack
  name: string
  open: boolean
  onClose: () => void
  onClosed: () => void
  finalFocus?: () => HTMLElement | null
}) {
  const { t, i18n } = useTranslation()
  const action = useContentAction(campaignId)
  const [entries, setEntries] = useState<{ category: ContentCategory; open: boolean } | null>(null)
  // The base pack's creatures ask first: turning them off forgets what the campaign did to them.
  const [asking, setAsking] = useState<ContentCategory | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const categories = [...pack.categories].sort(
    (a, b) => liveCategories.indexOf(a.category) - liveCategories.indexOf(b.category),
  )
  const enable = (category: ContentCategory, enabled: boolean) =>
    action.mutate({ kind: 'enable', packId: pack.id, category, enabled })
  const browsing = entries && pack.categories.find((entry) => entry.category === entries.category)
  return (
    <ContentSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      title={name}
      description={
        startsFromSrd(pack, titleOf(pack, i18n.language))
          ? `${t('campaignContent.basedOnSrd')}. ${t('campaignContent.detailLead')}`
          : t('campaignContent.detailLead')
      }
      finalFocus={finalFocus}
    >
      {action.isError && (
        <Text size="sm" c="red" role="alert" className="tw:pb-2">
          {t(actionMessage(action.error.message))}
        </Text>
      )}
      <ul className="tw:m-0 tw:list-none tw:p-0">
        {categories.map((entry) => {
          const label = t(`campaignContent.category.${entry.category}`)
          return (
            <li key={entry.category} className="tw:border-b tw:border-border tw:py-1">
              <div className="tw:flex tw:items-center tw:gap-3">
                <div className="tw:min-w-0 tw:flex-1">
                  <div className="tw:font-semibold">{label}</div>
                  <div className="tw:text-sm tw:text-muted-foreground">
                    {t('campaignContent.inPack', { count: entry.entries })}
                  </div>
                </div>
                <Switch
                  className="content-switch"
                  checked={entry.enabled}
                  aria-disabled={action.isPending || undefined}
                  aria-label={t('campaignContent.useCategory', {
                    category: label.toLowerCase(),
                    pack: name,
                  })}
                  onChange={(event) => {
                    if (action.isPending) return
                    const next = event.currentTarget.checked
                    if (!next && pack.srd && entry.category === 'creatures') setAsking('creatures')
                    else {
                      setAsking(null)
                      enable(entry.category, next)
                    }
                  }}
                />
              </div>
              {asking === entry.category && entry.enabled && (
                <div role="alert" className="tw:flex tw:flex-col tw:gap-2 tw:pb-2">
                  <Text size="sm">{t('campaignContent.offCreatures')}</Text>
                  <div className="tw:flex tw:gap-2">
                    <Button
                      variant="default"
                      style={{ minHeight: 44 }}
                      data-autofocus
                      onClick={() => setAsking(null)}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      color="red"
                      variant="light"
                      style={{ minHeight: 44 }}
                      onClick={() => {
                        setAsking(null)
                        enable(entry.category, false)
                      }}
                    >
                      {t('campaignContent.offConfirm')}
                    </Button>
                  </div>
                </div>
              )}
              {entry.enabled && (
                <Button
                  variant="subtle"
                  fullWidth
                  fw={400}
                  justify="space-between"
                  style={{ minHeight: 44 }}
                  rightSection={<ChevronRight size={18} aria-hidden="true" />}
                  onClick={(event) => {
                    opener.current = event.currentTarget
                    setEntries({ category: entry.category, open: true })
                  }}
                >
                  <span className="tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-2">
                    {t('campaignContent.pickEntries', { category: label.toLowerCase() })}
                    {entry.hidden > 0 && (
                      <span className="tw:text-sm tw:font-normal tw:whitespace-nowrap tw:text-muted-foreground">
                        {t(`campaignContent.hiddenCount.${categoryGender(entry.category)}`, {
                          count: entry.hidden,
                        })}
                      </span>
                    )}
                  </span>
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {entries && browsing && (
        <EntriesSheet
          key={entries.category}
          campaignId={campaignId}
          pack={pack}
          packName={name}
          category={browsing}
          open={entries.open}
          onClose={() => setEntries({ ...entries, open: false })}
          onClosed={() => setEntries(null)}
          finalFocus={() => (opener.current?.isConnected ? opener.current : null)}
        />
      )}
    </ContentSheet>
  )
}
