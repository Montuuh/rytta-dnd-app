import { useRef, useState } from 'react'
import { Alert, Button, Text, Title, UnstyledButton } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { showsData } from '@/features/campaigns'
import { newRequestId } from '@/shared/lib/request-id'
import { localizedName } from '@/shared/lib/translations'
import { proposalsQuery, useCancelProposal } from '../api'
import { sortProposals, type ItemProposal } from '../domain/catalogue'
import { statusGlyphs } from './item-visuals'
import { ItemIcon } from './item-icon'
import './catalogue.css'

/** How many resolved proposals stay in view; older ones leave the shelf. */
const closedShown = 5

/**
 * RYT-105: the Player's proposals for this character, beside the satchel. Pending ones can be
 * withdrawn; resolved ones say what the DM decided and why.
 */
export function ProposalShelf({
  campaignId,
  characterId,
  canCancel,
}: {
  campaignId: string
  characterId: string
  canCancel: boolean
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const query = useQuery(proposalsQuery(state.user!.id, campaignId, characterId))
  const cancel = useCancelProposal(campaignId)
  const [failed, setFailed] = useState<string | null>(null)
  const requests = useRef(new Map<string, string>())
  const heading = useRef<HTMLHeadingElement>(null)
  if (query.isPending) return null
  // RYT-161: a failed refresh keeps the shelf; the inventory page's line says it.
  if (!showsData(query) || !query.data)
    return (
      <Alert color="red" role="alert">
        {t('items.proposals.loadError')}{' '}
        <Button variant="subtle" onClick={() => void query.refetch()}>
          {t('common.retry')}
        </Button>
      </Alert>
    )
  const sorted = sortProposals(query.data.filter((p) => p.status !== 'cancelled'))
  const pending = sorted.filter((p) => p.status === 'pending')
  const shown = [...pending, ...sorted.filter((p) => p.status !== 'pending').slice(0, closedShown)]
  if (shown.length === 0) return null
  const withdraw = (proposal: ItemProposal) => {
    if (cancel.isPending) return
    // One key per proposal revision: a retry replays, a newer revision is a new request.
    const key = `${proposal.id}:${proposal.revision}`
    if (!requests.current.has(key)) requests.current.set(key, newRequestId())
    setFailed(null)
    cancel.mutate(
      {
        proposalId: proposal.id,
        revision: proposal.revision,
        requestId: requests.current.get(key)!,
      },
      {
        onSuccess: () => requestAnimationFrame(() => heading.current?.focus()),
        onError: (error) => setFailed(error.message === 'closed' ? 'closed' : proposal.id),
      },
    )
  }
  return (
    <section className="proposal-shelf" aria-labelledby="proposal-shelf-title">
      <Title
        order={2}
        id="proposal-shelf-title"
        ref={heading}
        tabIndex={-1}
        className="shelf-title"
      >
        {t('items.proposals.mine')}
      </Title>
      {failed && (
        <Alert color="red" role="alert" my="xs">
          {t(failed === 'closed' ? 'items.proposals.alreadyClosed' : 'items.proposals.cancelError')}
        </Alert>
      )}
      <ul className="proposal-list">
        {shown.map((proposal) => {
          const Glyph = statusGlyphs[proposal.status]
          const name = localizedName(proposal.draft, i18n.language)
          return (
            <li key={proposal.id} className="proposal-row" data-status={proposal.status}>
              <span className={`store-glyph rarity-${proposal.draft.rarity}`} aria-hidden="true">
                <ItemIcon icon={proposal.draft.icon} size={22} />
              </span>
              <span className="proposal-body">
                <span className="proposal-name user-copy">
                  {name} <span className="proposal-qty">×{proposal.quantity}</span>
                </span>
                <span className="proposal-status">
                  <Glyph size={14} aria-hidden="true" />
                  {t(`items.proposals.status.${proposal.status}`)}
                </span>
                {proposal.dm_note && (
                  <Text size="sm" className="proposal-note user-copy">
                    {t('items.proposals.note', { note: proposal.dm_note })}
                  </Text>
                )}
              </span>
              {canCancel && proposal.status === 'pending' && proposal.proposed_by_you && (
                <UnstyledButton
                  className="quiet-link danger"
                  aria-disabled={cancel.isPending || undefined}
                  aria-label={t('items.proposals.cancelNamed', { name })}
                  onClick={() => withdraw(proposal)}
                >
                  {t('items.proposals.cancel')}
                </UnstyledButton>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
