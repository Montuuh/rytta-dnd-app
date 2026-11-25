import { useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  ChevronRight,
  Gift,
  Hourglass,
  Link2,
  Map as TableMap,
  PackageCheck,
  Play,
  Shield,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { Link, Navigate } from 'react-router'
import { Button, UnstyledButton } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import {
  DmCenterShell,
  QueryFeedback,
  SoloRehearsal,
  dmPanelIcons,
  dmPanelLabels,
  dmPlaceHref,
  firstSessionSteps,
  implementedModuleKeys,
  membersQuery,
  partyBelow,
  sentInvitationsQuery,
  useCampaign,
  useCampaignView,
  type DmPanel,
} from '@/features/campaigns'
import { useAuth } from '@/features/auth'
import { characterRosterQuery, partyOverviewQuery } from '@/features/characters'
import { encountersQuery, isLive, sessionContinuityQuery } from '@/features/combat'
import { proposalsQuery, usePendingProposalCount } from '@/features/inventory'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { RefreshControl } from '@/shared/ui/refresh-control'
import './campaign-landing.css'

/** RYT-029: the campaign index. The DM gets the command centre home; Players land on Party. */
export function CampaignLanding() {
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const dm = campaign.role === 'dm' && !playerPreview
  if (!dm) return <Navigate to={`/campaign/${campaign.id}/party`} replace />
  return <DmHome />
}

/**
 * RYT-179: the DM's first screen, inside the command centre frame with Summary current. Four
 * blocks in order: the live encounter, the pending work, the session tools and the campaign
 * settings with their current value. A block with nothing to show is not rendered; a failed
 * query shows its feedback with a retry inside its own block only.
 */
function DmHome() {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const { state } = useAuth()
  const userId = state.user!.id
  const encounters = useQuery(encountersQuery(userId, campaign.id))
  const members = useQuery(membersQuery(userId, campaign.id))
  const invitations = useQuery(sentInvitationsQuery(userId, campaign.id))
  const roster = useQuery(characterRosterQuery(userId, campaign.id))
  const party = useQuery(partyOverviewQuery(userId, campaign.id))
  const session = useQuery(sessionContinuityQuery(userId, campaign.id))
  const proposals = usePendingProposalCount(campaign.id, true)
  // The same query as the count: shared by key, read here for its failure.
  const proposalList = useQuery(proposalsQuery(userId, campaign.id, null))
  const [rehearsing, setRehearsing] = useState(false)
  const rehearsalTile = useRef<HTMLElement | null>(null)
  const live = encounters.data?.find((encounter) => isLive(encounter.status))
  const below = partyBelow(party.data) ?? 0
  const visibleModules = (campaign.player_modules ?? ['party']).filter((key) =>
    implementedModuleKeys.has(key),
  ).length
  const steps =
    members.isSuccess && invitations.isSuccess && roster.isSuccess
      ? firstSessionSteps({
          members: members.data,
          pendingInvitations: invitations.data.length,
          roster: roster.data,
          modules: campaign.player_modules ?? ['party'],
          implemented: implementedModuleKeys,
        })
      : null
  const href = (panel: DmPanel, action?: string) => dmPlaceHref(campaign.id, panel, action)
  const queries = [encounters, members, invitations, roster, party, session]
  const refresh = (
    <RefreshControl
      onRefresh={() => queries.forEach((query) => void query.refetch())}
      fetching={queries.some((query) => query.isFetching)}
      updatedAt={Math.max(...queries.map((query) => query.dataUpdatedAt))}
    />
  )

  const pendingRows: ReactNode[] = []
  if (invitations.data?.length)
    pendingRows.push(
      <HomeRow
        key="invites"
        to={href('members', 'sent')}
        icon={Hourglass}
        label={t('dm.homeInvites')}
        count={invitations.data.length}
        description={t('dm.invitesToAccept', { count: invitations.data.length })}
      />,
    )
  if (proposals)
    pendingRows.push(
      <HomeRow
        key="proposals"
        to={href('items')}
        icon={PackageCheck}
        label={t('dm.homeProposals')}
        count={proposals}
        description={t('dm.proposalsToReview', { count: proposals })}
      />,
    )
  if (below)
    pendingRows.push(
      <HomeRow
        key="below"
        to={href('level')}
        icon={TrendingUp}
        label={t('dm.homeBelow')}
        count={below}
        description={t('dm.belowLevel', { count: below })}
      />,
    )
  // The first-session steps that are not done yet; a done step is not listed.
  if (steps && !steps.joined && !steps.pending)
    pendingRows.push(
      <HomeRow
        key="invite"
        to={href('members', 'invite')}
        icon={UserPlus}
        label={t('dm.homeInviteFirst')}
      />,
    )
  if (steps && !steps.modules)
    pendingRows.push(
      <HomeRow
        key="modules"
        to={href('modules')}
        icon={Shield}
        label={t('dm.homeChooseModules')}
      />,
    )
  if (steps?.unlinked.length)
    pendingRows.push(
      <HomeRow
        key="link"
        to={href('members')}
        icon={Link2}
        label={t('dm.homeLink')}
        count={steps.unlinked.length}
        description={t('dm.unlinkedPlayers', { count: steps.unlinked.length })}
      />,
    )
  // A query that failed says so with a retry, in this block: its row would otherwise just be
  // missing.
  const failedPending = [members, invitations, roster, party, proposalList].filter(
    (query) => query.isError,
  )
  const pendingFailed = failedPending.length > 0
  // The blocks above the tools arrive together: the board is drawn once they have answered, so
  // nothing moves under the thumb after the first paint.
  const settling = [encounters, members, invitations, roster].some((query) => query.isPending)

  const settingRows: { panel: DmPanel; value?: ReactNode; description?: string }[] = [
    {
      panel: 'members',
      value: members.data?.length,
      description: members.data && t('members.count', { count: members.data.length }),
    },
    { panel: 'level', value: campaign.party_level ?? t('partyLevel.unset') },
    { panel: 'modules', value: t('dm.modulesVisible', { count: visibleModules }) },
    { panel: 'dice', value: t(`diceSettings.mode.${campaign.dice_mode}`) },
    { panel: 'content' },
    { panel: 'audit' },
  ]

  return (
    <DmCenterShell current="home" pendingProposals={proposals} refresh={refresh}>
      <div className="dm-home">
        {settling ? (
          <QueryFeedback pending error={false} retry={() => {}} />
        ) : (
          <>
            {(live || encounters.isError) && (
              <section aria-labelledby="dm-home-now" className="dm-home-block">
                <h2 id="dm-home-now" className="dm-home-title">
                  {t('dm.homeNow')}
                </h2>
                {live ? (
                  <div className="dm-now">
                    <div className="dm-now-text">
                      <p className="dm-now-name user-copy" id="dm-home-encounter">
                        {live.name}
                      </p>
                      <p className="dm-now-meta tabular">
                        {live.status === 'active'
                          ? t('combat.round', { round: live.round })
                          : t('combat.status.initiative')}
                      </p>
                    </div>
                    <Button
                      component={Link}
                      variant="filled"
                      to={`/campaign/${campaign.id}/combat/${live.id}`}
                      aria-describedby="dm-home-encounter"
                      rightSection={<ChevronRight size={18} aria-hidden="true" />}
                      className="dm-now-action"
                    >
                      {t('dm.resumeEncounter')}
                    </Button>
                  </div>
                ) : (
                  <QueryFeedback
                    pending={false}
                    error
                    cause={encounters.error}
                    retry={() => void encounters.refetch()}
                  />
                )}
              </section>
            )}

            {(pendingRows.length > 0 || pendingFailed) && (
              <section aria-labelledby="dm-home-pending" className="dm-home-block">
                <h2 id="dm-home-pending" className="dm-home-title">
                  {t('dm.homePending')}
                </h2>
                {pendingFailed && (
                  <QueryFeedback
                    pending={false}
                    error
                    cause={failedPending[0]?.error}
                    retry={() => failedPending.forEach((query) => void query.refetch())}
                  />
                )}
                {pendingRows.length > 0 && <ul className="dm-rows">{pendingRows}</ul>}
              </section>
            )}

            <section aria-labelledby="dm-home-table" className="dm-home-block">
              <h2 id="dm-home-table" className="dm-home-title">
                {t('dm.groupTable')}
              </h2>
              {session.isError && (
                <QueryFeedback
                  pending={false}
                  error
                  cause={session.error}
                  retry={() => void session.refetch()}
                />
              )}
              <ul className="dm-tiles">
                <HomeTile to={href('bestiary')} icon={dmPanelIcons.bestiary}>
                  {t(dmPanelLabels.bestiary)}
                </HomeTile>
                <HomeTile
                  to={href('items')}
                  icon={dmPanelIcons.items}
                  detail={proposals ? t('dm.proposalsToReview', { count: proposals }) : undefined}
                >
                  {t(dmPanelLabels.items)}
                </HomeTile>
                <HomeTile to={href('items', 'loot')} icon={Gift}>
                  {t('loot.open')}
                </HomeTile>
                <HomeTile to={`/campaign/${campaign.id}/session`} icon={BookOpen}>
                  {t(session.data?.revision ? 'session.resume' : 'session.journal')}
                </HomeTile>
                <HomeTile to={`/campaign/${campaign.id}/tabletop`} icon={TableMap}>
                  {t('dm.stepTable')}
                </HomeTile>
                <HomeTile
                  icon={Play}
                  onClick={(event) => {
                    rehearsalTile.current = event.currentTarget
                    setRehearsing(true)
                  }}
                >
                  {t('dm.rehearse')}
                </HomeTile>
              </ul>
            </section>

            <section aria-labelledby="dm-home-campaign" className="dm-home-block">
              <h2 id="dm-home-campaign" className="dm-home-title">
                {t('dm.homeCampaign')}
              </h2>
              <ul className="dm-rows dm-rows-settings">
                {settingRows.map(({ panel, value, description }) => (
                  <HomeRow
                    key={panel}
                    to={href(panel)}
                    icon={dmPanelIcons[panel]}
                    label={t(dmPanelLabels[panel])}
                    value={value}
                    description={description}
                  />
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
      {rehearsing && (
        <SoloRehearsal
          close={() => {
            setRehearsing(false)
            focusWhenReady(() => rehearsalTile.current)
          }}
        />
      )}
    </DmCenterShell>
  )
}

/** A ruled row: what to do or where to go, and at the end its count (accent) or current value
 * (muted). A count is read as its sentence through `description`, never as a bare number. */
function HomeRow({
  to,
  icon: Icon,
  label,
  count,
  value,
  description,
}: {
  to: string
  icon: LucideIcon
  label: string
  count?: number
  value?: ReactNode
  description?: string
}) {
  const id = useId()
  const shown = count ?? value
  return (
    <li>
      <Link to={to} className="dm-row" aria-describedby={description ? id : undefined}>
        <Icon size={20} aria-hidden="true" className="dm-row-icon" />
        <span className="dm-row-label">{label}</span>
        {shown !== undefined && shown !== null && (
          <span
            className={`dm-row-value tabular${count !== undefined ? ' is-count' : ''}`}
            aria-hidden={description ? true : undefined}
          >
            {shown}
          </span>
        )}
        <ChevronRight size={18} aria-hidden="true" className="dm-row-chevron" />
      </Link>
      {description && (
        <span id={id} className="visually-hidden">
          {description}
        </span>
      )}
    </li>
  )
}

/** A session tool: a link, or a button for the one tool that opens a dialog. */
function HomeTile({
  to,
  onClick,
  icon: Icon,
  detail,
  children,
}: {
  to?: string
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  icon: LucideIcon
  detail?: string
  children: ReactNode
}) {
  const body = (
    <>
      <Icon size={22} aria-hidden="true" className="dm-tile-icon" />
      <span className="dm-tile-label">{children}</span>
      {detail && <span className="dm-tile-detail">{detail}</span>}
    </>
  )
  return (
    <li>
      {to ? (
        <Link to={to} className="dm-tile">
          {body}
        </Link>
      ) : (
        <UnstyledButton className="dm-tile" onClick={onClick}>
          {body}
        </UnstyledButton>
      )}
    </li>
  )
}
