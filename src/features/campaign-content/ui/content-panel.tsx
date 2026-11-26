import { useEffect, useRef, useState } from 'react'
import { Button, Collapse, Group, Stack, Text, VisuallyHidden } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { shortPackName } from '@/shared/api/pack-origins'
import { cn } from '@/shared/lib/cn'
import { Empty, EmptyDescription, EmptyHeader } from '@/shared/ui/kit/empty'
import { Skeleton } from '@/shared/ui/kit/skeleton'
import { Modal } from '@/shared/ui/overlays'
import { useBasePackLabel } from '@/shared/ui/pack-origins-context'
import { campaignContentQuery, useContentAction } from '../api'
import { packHasUpdate, packInUse, titleOf, type ContentPack } from '../domain/content'
import { actionMessage } from './action-message'
import { PackCard } from './pack-card'
import { packSwitchId } from './pack-line'
import { PackDetailSheet } from './pack-detail'
import { ReviewSheet, UpdateNotice } from './pack-update'
import './content.css'

/** RYT-162, RYT-184: the DM chooses the packs this campaign uses, one card per pack. */
export function CampaignContentPanel({
  campaignId,
  title,
}: {
  campaignId: string
  /** The panel's name, the one the command centre's navigation shows. */
  title: string
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const content = useQuery(campaignContentQuery(state.user!.id, campaignId))
  return (
    <section aria-labelledby="campaign-content-title" className="content-panel">
      <h2 id="campaign-content-title" className="dm-subheading dm-panel-title">
        {title}
      </h2>
      {content.isPending ? (
        <PanelSkeleton />
      ) : content.isError ? (
        content.error.message === 'forbidden' ? (
          <Empty className="tw:border tw:border-border">
            <EmptyHeader>
              <EmptyDescription role="alert">
                {t('campaignContent.forbiddenPanel')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Empty className="tw:border tw:border-border">
            <EmptyHeader>
              <EmptyDescription role="alert">{t('campaignContent.error')}</EmptyDescription>
            </EmptyHeader>
            <Button
              variant="default"
              style={{ minHeight: 44 }}
              onClick={() => void content.refetch()}
            >
              {t('common.retry')}
            </Button>
          </Empty>
        )
      ) : (
        <Packs campaignId={campaignId} packs={content.data} />
      )}
    </section>
  )
}

/** Two cards of the shape of a pack: cover, two lines and a switch. */
function PanelSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-label={t('common.loading')} className="tw:flex tw:flex-col">
      {[0, 1].map((card) => (
        <div
          key={card}
          className="tw:flex tw:items-start tw:gap-3 tw:border-b tw:border-border tw:py-3"
        >
          <Skeleton className="tw:h-14 tw:w-11 tw:shrink-0 tw:rounded-sm" />
          <div className="tw:flex tw:flex-1 tw:flex-col tw:gap-2 tw:pt-0.5">
            <Skeleton className="tw:h-5 tw:w-1/3" />
            <Skeleton className="tw:h-4 tw:w-5/6" />
          </div>
          <Skeleton className="tw:h-6 tw:w-11 tw:rounded-full" />
        </div>
      ))}
    </div>
  )
}

type Sheet = { kind: 'detail' | 'review'; packId: string; open: boolean }

function Packs({ campaignId, packs }: { campaignId: string; packs: ContentPack[] }) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const userId = state.user?.id
  const action = useContentAction(campaignId)
  const baseLabel = useBasePackLabel(t('bestiary.source.srd'))
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [turningOff, setTurningOff] = useState<string | null>(null)
  const [updated, setUpdated] = useState<string | null>(null)
  // A pack not offered any more and not in use cannot be turned on: it is not listed at all.
  const listed = packs.filter((pack) => packInUse(pack) || pack.offered)
  // A card stays where it was found while the panel is open: a pack turned off does not jump into
  // the fold under the finger, nor one turned on out of it.
  const [placed] = useState(
    () => new Map(listed.map((pack) => [pack.id, packInUse(pack) ? 'top' : 'fold'] as const)),
  )
  const where = (pack: ContentPack) => placed.get(pack.id) ?? (packInUse(pack) ? 'top' : 'fold')
  const inUse = listed.filter((pack) => where(pack) === 'top')
  const unused = listed.filter((pack) => where(pack) === 'fold')
  const [expanded, setExpanded] = useState(inUse.length === 0)
  // The control that opened a sheet gets focus back; when it is gone (an update removes its
  // notice), the pack's switch takes it.
  const opener = useRef<HTMLElement | null>(null)
  const focusBack = (pack: ContentPack) => () =>
    opener.current?.isConnected ? opener.current : document.getElementById(packSwitchId(pack))
  // After a failed action the reason is where the keyboard is.
  const alert = useRef<HTMLDivElement>(null)
  const failedAt = action.isError ? action.submittedAt : 0
  useEffect(() => {
    if (failedAt) alert.current?.focus()
  }, [failedAt])

  const nameOf = (pack: ContentPack) => {
    return shortPackName(titleOf(pack, i18n.language), pack.srd, baseLabel)
  }
  const byId = (id: string | null) => packs.find((pack) => pack.id === id) ?? null
  const asking = byId(turningOff)
  const sheetPack = byId(sheet?.packId ?? null)

  const toggle = (pack: ContentPack, enabled: boolean) => {
    setUpdated(null)
    // The base pack and a pack that cannot come back ask first.
    if (!enabled && (pack.srd || !pack.offered)) setTurningOff(pack.id)
    else action.mutate({ kind: 'enablePack', packId: pack.id, enabled })
  }
  const update = (pack: ContentPack, version: number, after?: () => void) =>
    action.mutate(
      { kind: 'updatePack', packId: pack.id, version },
      {
        onSuccess: () => {
          setUpdated(t('campaignContent.updated', { pack: nameOf(pack) }))
          after?.()
        },
      },
    )
  const open = (kind: Sheet['kind'], pack: ContentPack, from: HTMLElement) => {
    opener.current = from
    setUpdated(null)
    setSheet({ kind, packId: pack.id, open: true })
  }
  const card = (pack: ContentPack) => (
    <PackCard
      key={pack.id}
      pack={pack}
      name={nameOf(pack)}
      userId={userId}
      busy={action.isPending}
      onToggle={(enabled) => toggle(pack, enabled)}
      onPersonalise={(from) => open('detail', pack, from)}
    />
  )
  const news = listed.filter((pack) => packInUse(pack) && packHasUpdate(pack))

  if (listed.length === 0)
    return (
      <Empty className="tw:border tw:border-border">
        <EmptyHeader>
          <EmptyDescription>{t('campaignContent.empty')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <>
      {/* The live region is always in the page and takes no room; the sentence people see is
          drawn only when there is one, so an idle panel keeps no empty line. */}
      <VisuallyHidden role="status">{updated}</VisuallyHidden>
      {updated !== null && (
        <Text size="sm" aria-hidden="true" className="content-notice">
          {updated}
        </Text>
      )}
      {action.isError && !sheet && (
        <div
          ref={alert}
          tabIndex={-1}
          role="alert"
          className="tw:rounded-md tw:border tw:border-destructive tw:p-3 tw:text-sm tw:text-destructive"
        >
          {t(actionMessage(action.error.message))}
        </div>
      )}
      {news.length > 0 && (
        <div
          className="tw:flex tw:flex-col tw:gap-3"
          role="group"
          aria-label={t('campaignContent.news')}
        >
          {news.map((pack, index) => (
            <UpdateNotice
              key={pack.id}
              campaignId={campaignId}
              pack={pack}
              name={nameOf(pack)}
              // One filled button in the panel: the first notice's.
              primary={index === 0}
              busy={action.isPending}
              onUpdate={(version) =>
                update(pack, version, () => document.getElementById(packSwitchId(pack))?.focus())
              }
              onReview={(from) => open('review', pack, from)}
            />
          ))}
        </div>
      )}
      {inUse.length > 0 && <ul className="content-packs">{inUse.map(card)}</ul>}
      {unused.length > 0 && (
        <div>
          <Button
            variant="subtle"
            fullWidth
            justify="space-between"
            // The label starts at the cards' cover edge and the chevron sits over the switch column
            // (a 44px switch whose track centre is 19px from the edge): the button's padding is
            // moved outside the column, so its hover tint still has room around the text.
            style={{
              minHeight: 44,
              marginInline: -10,
              width: 'calc(100% + 20px)',
              paddingInlineStart: 10,
              paddingInlineEnd: 20,
            }}
            aria-expanded={expanded}
            aria-controls="content-more-packs"
            rightSection={
              <ChevronDown
                size={18}
                aria-hidden="true"
                className={cn('content-chevron', expanded && 'content-chevron-open')}
              />
            }
            onClick={() => setExpanded((value) => !value)}
          >
            {t('campaignContent.morePacks', { count: unused.length })}
          </Button>
          <Collapse expanded={expanded} id="content-more-packs">
            <ul className="content-packs">{unused.map(card)}</ul>
          </Collapse>
        </div>
      )}
      {sheet && sheetPack && sheet.kind === 'detail' && (
        <PackDetailSheet
          key={`detail:${sheet.packId}`}
          campaignId={campaignId}
          pack={sheetPack}
          name={nameOf(sheetPack)}
          open={sheet.open}
          onClose={() => setSheet({ ...sheet, open: false })}
          onClosed={() => setSheet(null)}
          finalFocus={focusBack(sheetPack)}
        />
      )}
      {sheet && sheetPack && sheet.kind === 'review' && (
        <ReviewSheet
          key={`review:${sheet.packId}`}
          campaignId={campaignId}
          pack={sheetPack}
          name={nameOf(sheetPack)}
          open={sheet.open}
          onClose={() => setSheet({ ...sheet, open: false })}
          onClosed={() => setSheet(null)}
          onUpdated={() => {
            setUpdated(t('campaignContent.updated', { pack: nameOf(sheetPack) }))
            setSheet({ ...sheet, open: false })
          }}
          finalFocus={focusBack(sheetPack)}
        />
      )}
      <Modal
        opened={asking !== null}
        onClose={() => setTurningOff(null)}
        title={asking && t('campaignContent.offTitle', { pack: nameOf(asking) })}
        closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      >
        <Stack gap="md">
          <Text>
            {asking?.offered === false
              ? t('campaignContent.offBodyGone')
              : t('campaignContent.offBody')}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setTurningOff(null)} data-autofocus>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              variant="light"
              onClick={() => {
                const pack = asking!
                setTurningOff(null)
                action.mutate(
                  { kind: 'enablePack', packId: pack.id, enabled: false },
                  {
                    onSuccess: () => {
                      // A pack that is not offered any more leaves the panel for good: say so, and
                      // keep the keyboard on the panel.
                      if (pack.offered) return
                      setUpdated(t('campaignContent.removed', { pack: nameOf(pack) }))
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLElement>('.content-panel .content-switch input')
                          ?.focus(),
                      )
                    },
                  },
                )
              }}
            >
              {t('campaignContent.offConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
