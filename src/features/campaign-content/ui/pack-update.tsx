import { useEffect, useRef } from 'react'
import { Button, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { Item } from '@/shared/ui/kit/item'
import { PackCover } from '@/shared/ui/pack-cover'
import { Skeleton } from '@/shared/ui/kit/skeleton'
import { packChangesQuery, useContentAction } from '../api'
import { categoryGender, nameOf, type ContentPack } from '../domain/content'
import { actionMessage } from './action-message'
import { ContentSheet } from './content-sheet'
import { useCounts, useDigestLine } from './digest'

/**
 * RYT-184: one notice per pack with a newer version: what changed in one line, "Actualizar" for the
 * whole pack and "Ver qué cambia". The only tinted surface of the panel; `primary` marks the
 * one filled button on the screen.
 */
export function UpdateNotice({
  campaignId,
  pack,
  name,
  primary,
  busy,
  onUpdate,
  onReview,
}: {
  campaignId: string
  pack: ContentPack
  name: string
  /** Only the first notice has the filled button. */
  primary: boolean
  busy: boolean
  onUpdate: (version: number) => void
  onReview: (opener: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user?.id
  const digest = useQuery(packChangesQuery(userId!, campaignId, pack.id))
  const line = useDigestLine()
  const headingId = `content-news-${pack.id}`
  return (
    <Item
      variant="outline"
      render={<section aria-labelledby={headingId} />}
      className="tw:flex-col tw:items-stretch tw:gap-2 tw:border-primary/40 tw:bg-primary/10 tw:p-3"
    >
      <div className="tw:flex tw:items-start tw:gap-3">
        <PackCover path={pack.cover} title={name} userId={userId} size="sm" />
        <div className="tw:min-w-0 tw:flex-1">
          <h3
            id={headingId}
            className="user-copy tw:m-0 tw:font-heading tw:text-base tw:leading-snug tw:font-semibold tw:wrap-anywhere"
          >
            {t('campaignContent.noticeTitle', { pack: name })}
          </h3>
          {digest.isPending ? (
            <Skeleton
              role="status"
              aria-label={t('common.loading')}
              className="tw:mt-1.5 tw:h-4 tw:w-4/5"
            />
          ) : digest.isError ? (
            <p className="tw:m-0 tw:mt-0.5 tw:text-sm tw:text-muted-foreground" role="alert">
              {t('campaignContent.digestErrorNotice')}
            </p>
          ) : (
            <p className="tw:m-0 tw:mt-0.5 tw:text-sm tw:leading-snug tw:text-muted-foreground">
              {line(digest.data)}
            </p>
          )}
        </div>
      </div>
      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        {digest.isError ? (
          // Update and review both need the digest: until it loads, the one way forward is to retry.
          <Button variant="default" style={{ minHeight: 44 }} onClick={() => void digest.refetch()}>
            {t('common.retry')}
          </Button>
        ) : (
          <>
            <Button
              variant={primary ? 'filled' : 'default'}
              style={{ minHeight: 44 }}
              disabled={!digest.data}
              aria-disabled={busy || undefined}
              aria-label={t('campaignContent.updateLabel', { pack: name })}
              onClick={() => {
                if (digest.data && !busy) onUpdate(digest.data.version)
              }}
            >
              {t('campaignContent.update')}
            </Button>
            <Button
              variant="subtle"
              style={{ minHeight: 44 }}
              aria-label={t('campaignContent.reviewLabel', { pack: name })}
              onClick={(event) => onReview(event.currentTarget)}
            >
              {t('campaignContent.review')}
            </Button>
          </>
        )}
      </div>
    </Item>
  )
}

/** What the update means for this campaign: what touches it first, the rest as counts. */
export function ReviewSheet({
  campaignId,
  pack,
  name,
  open,
  onClose,
  onClosed,
  onUpdated,
  finalFocus,
}: {
  campaignId: string
  pack: ContentPack
  name: string
  open: boolean
  onClose: () => void
  onClosed: () => void
  onUpdated: () => void
  finalFocus?: () => HTMLElement | null
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const digest = useQuery(packChangesQuery(state.user!.id, campaignId, pack.id))
  const action = useContentAction(campaignId)
  const counts = useCounts()
  // The reason is where the keyboard is: after a failed update (a stale version included) focus
  // moves to the message, so the reader hears it and the next stop is the button again.
  const alert = useRef<HTMLDivElement>(null)
  const failedAt = action.isError ? action.submittedAt : 0
  useEffect(() => {
    if (failedAt) alert.current?.focus()
  }, [failedAt])
  const data = digest.data
  const rest = data?.categories.filter((row) => row.new + row.changed + row.withdrawn > 0) ?? []
  return (
    <ContentSheet
      open={open}
      // A request in flight keeps the sheet: closing would hide its answer.
      onClose={() => !action.isPending && onClose()}
      onClosed={onClosed}
      title={t('campaignContent.reviewTitle', { pack: name })}
      description={t('campaignContent.reviewLead')}
      finalFocus={finalFocus}
      footer={
        <div className="tw:flex tw:flex-col tw:gap-2">
          {action.isError && (
            <div
              ref={alert}
              tabIndex={-1}
              role="alert"
              className="tw:rounded-md tw:border tw:border-destructive tw:p-2 tw:text-sm tw:text-destructive"
            >
              {t(actionMessage(action.error.message))}
            </div>
          )}
          <Button
            fullWidth
            style={{ minHeight: 44 }}
            loading={action.isPending}
            disabled={!data}
            onClick={() => {
              if (!data) return
              action.mutate(
                { kind: 'updatePack', packId: pack.id, version: data.version },
                { onSuccess: onUpdated },
              )
            }}
          >
            {t('campaignContent.update')}
          </Button>
        </div>
      }
    >
      {digest.isPending ? (
        <div
          role="status"
          aria-label={t('common.loading')}
          className="tw:flex tw:flex-col tw:gap-3 tw:pt-2"
        >
          <Skeleton className="tw:h-5 tw:w-1/3" />
          <Skeleton className="tw:h-10 tw:w-full" />
          <Skeleton className="tw:h-10 tw:w-full" />
        </div>
      ) : !data ? (
        <div role="alert" className="tw:flex tw:flex-col tw:items-start tw:gap-2 tw:pt-2">
          <Text size="sm">{t('campaignContent.digestError')}</Text>
          <Button variant="default" onClick={() => void digest.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <div className="tw:flex tw:flex-col tw:gap-5 tw:pt-2">
          <section aria-labelledby="content-affects" className="tw:flex tw:flex-col tw:gap-1">
            <h3
              id="content-affects"
              className="tw:m-0 tw:font-heading tw:text-base tw:font-semibold"
            >
              {t('campaignContent.affects')}
            </h3>
            {data.affected.length === 0 ? (
              <p className="tw:m-0 tw:text-sm tw:text-muted-foreground">
                {t('campaignContent.affectsNone')}
              </p>
            ) : (
              <ul className="tw:m-0 tw:list-none tw:p-0">
                {data.affected.map((row) => (
                  <li
                    key={`${row.kind}:${row.key}`}
                    className="tw:flex tw:flex-col tw:border-b tw:border-border tw:py-2"
                  >
                    <span className="user-copy tw:wrap-anywhere">{nameOf(row, i18n.language)}</span>
                    <span className="tw:text-sm tw:text-muted-foreground">
                      {[
                        t(`campaignContent.what.${row.change}.${categoryGender(row.category)}`),
                        row.campaign_version && row.change !== 'new'
                          ? t('campaignContent.what.mine')
                          : null,
                        row.hidden
                          ? t(
                              row.change === 'withdrawn'
                                ? `campaignContent.what.hiddenGone.${categoryGender(row.category)}`
                                : `campaignContent.what.hidden.${categoryGender(row.category)}`,
                            )
                          : null,
                      ]
                        .filter(Boolean)
                        .join('; ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.affected_more > 0 && (
              <p className="tw:m-0 tw:pt-1 tw:text-sm tw:text-muted-foreground">
                {t('campaignContent.moreAffected', { count: data.affected_more })}
              </p>
            )}
          </section>
          {rest.length > 0 && (
            <section aria-labelledby="content-rest" className="tw:flex tw:flex-col tw:gap-1">
              <h3
                id="content-rest"
                className="tw:m-0 tw:font-heading tw:text-base tw:font-semibold"
              >
                {t('campaignContent.rest')}
              </h3>
              <ul className="tw:m-0 tw:list-none tw:p-0">
                {rest.map((row) => (
                  <li
                    key={row.category}
                    className="tw:border-b tw:border-border tw:py-2 tw:text-sm"
                  >
                    {t('campaignContent.restLine', {
                      category: t(`campaignContent.category.${row.category}`),
                      digest: counts(row, row.category),
                    })}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </ContentSheet>
  )
}
