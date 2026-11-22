import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { DoorOpen, LogIn, LogOut, Search, Star } from 'lucide-react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useAuth } from '@/features/auth'
import { PageHead } from '@/shared/ui/page-head'
import {
  adminAuditQuery,
  adminCampaignsQuery,
  adminSummaryQuery,
  adminUsageQuery,
  useAccountLookup,
  useAdminAccess,
  useAdminFavourite,
  useAdminStatus,
} from '../api'
import { share, type AdminCampaign, type AuditEntry } from '../domain/admin'
import './admin.css'

const tabs = ['campaigns', 'library', 'usage', 'audit', 'accounts'] as const
type Tab = (typeof tabs)[number]

/** A failed read says so and offers to try again. */
function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <Alert color="red" role="alert">
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{t('superAdmin.error')}</Text>
        <Button size="sm" variant="default" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </Stack>
    </Alert>
  )
}

function usePercent() {
  const { i18n } = useTranslation()
  const format = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    maximumFractionDigits: 1,
  })
  return (part: number, whole: number) => {
    const value = share(part, whole)
    return value === null ? '—' : format.format(value / 100)
  }
}

const providerLabel = (t: TFunction, provider: string) =>
  provider === 'google'
    ? 'Google'
    : provider === 'email'
      ? t('superAdmin.accounts.providerEmail')
      : provider

function useDate() {
  const { i18n } = useTranslation()
  return (value: string | null, withTime = false) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          ...(withTime ? { timeStyle: 'short' } : {}),
        }).format(new Date(value))
      : '—'
}

/** RYT-153: the super admin panel. The server refuses every call to anyone else. */
export function AdminPage() {
  const { t } = useTranslation()
  const status = useAdminStatus()
  const [params, setParams] = useSearchParams()
  const tab: Tab = tabs.includes(params.get('tab') as Tab)
    ? (params.get('tab') as Tab)
    : 'campaigns'
  if (status.isPending) return <Loader aria-label={t('common.loading')} />
  if (!status.data?.super_admin) return <Navigate to="/" replace />
  return (
    <Stack gap="lg">
      <PageHead title={t('superAdmin.title')} />
      <Tabs
        value={tab}
        onChange={(value) => {
          const next = new URLSearchParams(params)
          next.set('tab', value ?? 'campaigns')
          next.delete('campaign')
          setParams(next, { replace: true })
        }}
        keepMounted={false}
      >
        <Tabs.List aria-label={t('superAdmin.title')} className="admin-tabs">
          {tabs.map((value) => (
            <Tabs.Tab key={value} value={value}>
              {t(`superAdmin.tab.${value}`)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="campaigns" pt="lg">
          <CampaignsTab />
        </Tabs.Panel>
        <Tabs.Panel value="library" pt="lg">
          <Paper p="lg" className="admin-card">
            <Stack gap="sm" align="flex-start">
              <Text>{t('superAdmin.library.lead')}</Text>
              <Button component={Link} to="/library" variant="default">
                {t('superAdmin.library.open')}
              </Button>
            </Stack>
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="usage" pt="lg">
          <UsageTab />
        </Tabs.Panel>
        <Tabs.Panel value="audit" pt="lg">
          <AuditTab />
        </Tabs.Panel>
        <Tabs.Panel value="accounts" pt="lg">
          <AccountsTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

function CampaignsTab() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(draft.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [draft])
  const list = useQuery(adminCampaignsQuery(userId, search))
  const selected = params.get('campaign')
  const date = useDate()
  // A campaign picked from the list brings its summary into view; one opened from a link does not move.
  const [picked, setPicked] = useState(false)
  const select = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('campaign', id)
    setParams(next, { replace: true })
    setPicked(true)
  }
  return (
    <div className="admin-campaigns">
      <Stack gap="sm" className="admin-directory">
        <TextInput
          label={t('superAdmin.campaigns.search')}
          placeholder={t('superAdmin.campaigns.searchHint')}
          leftSection={<Search size={16} aria-hidden="true" />}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          maxLength={100}
        />
        {list.isPending ? (
          <Loader size="sm" aria-label={t('common.loading')} />
        ) : list.isError ? (
          <LoadError onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <Text c="dimmed">{t('superAdmin.campaigns.none')}</Text>
        ) : (
          <ul className="admin-list" aria-label={t('superAdmin.tab.campaigns')}>
            {list.data.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                selected={campaign.id === selected}
                onSelect={() => select(campaign.id)}
                date={date}
              />
            ))}
          </ul>
        )}
      </Stack>
      {selected && <CampaignSummary campaignId={selected} reveal={picked} />}
    </div>
  )
}

function CampaignRow({
  campaign,
  selected,
  onSelect,
  date,
}: {
  campaign: AdminCampaign
  selected: boolean
  onSelect: () => void
  date: ReturnType<typeof useDate>
}) {
  const { t } = useTranslation()
  const favourite = useAdminFavourite()
  const dms = campaign.dms.filter(Boolean).join(', ') || '—'
  return (
    <li className="admin-row" data-selected={selected || undefined}>
      <button
        type="button"
        className="admin-row-main"
        aria-current={selected || undefined}
        onClick={onSelect}
      >
        <span className="admin-row-name user-copy">{campaign.name}</span>
        <span className="admin-row-meta user-copy">
          {t('superAdmin.campaigns.meta', {
            dms,
            members: t('superAdmin.supervised.members', { count: campaign.members }),
            last: date(campaign.last_activity),
          })}
        </span>
        {campaign.access_expires_at && (
          <span className="admin-row-access">{t('superAdmin.campaigns.inside')}</span>
        )}
      </button>
      <ActionIcon
        variant="subtle"
        size={44}
        className="admin-star"
        aria-pressed={campaign.favourite}
        aria-label={t(
          campaign.favourite
            ? 'superAdmin.campaigns.unfavourite'
            : 'superAdmin.campaigns.favourite',
          { name: campaign.name },
        )}
        loading={favourite.isPending}
        onClick={() =>
          favourite.mutate({ campaignId: campaign.id, favourite: !campaign.favourite })
        }
      >
        <Star size={20} aria-hidden="true" fill={campaign.favourite ? 'currentColor' : 'none'} />
      </ActionIcon>
    </li>
  )
}

function CampaignSummary({ campaignId, reveal }: { campaignId: string; reveal: boolean }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const summary = useQuery(adminSummaryQuery(userId, campaignId))
  const { enter, exit } = useAdminAccess()
  const navigate = useNavigate()
  const date = useDate()
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const loaded = summary.isSuccess
  useEffect(() => {
    if (!reveal || !loaded || !heading.current) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    heading.current.scrollIntoView({ behavior: motion, block: 'start' })
    heading.current.focus({ preventScroll: true })
  }, [reveal, loaded, campaignId])
  if (summary.isPending) return <Loader size="sm" aria-label={t('common.loading')} />
  if (summary.isError)
    return summary.error.message === 'notFound' ? (
      <Alert color="red" role="alert">
        {t('superAdmin.campaigns.gone')}
      </Alert>
    ) : (
      <LoadError onRetry={() => void summary.refetch()} />
    )
  const c = summary.data
  const inside = Boolean(c.access_expires_at)
  return (
    <Paper p="lg" className="admin-card admin-summary" aria-labelledby={headingId}>
      <Stack gap="md">
        <Title
          order={2}
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="user-copy admin-summary-title"
        >
          {c.name}
        </Title>
        {c.description && (
          <Text c="dimmed" className="user-copy">
            {c.description}
          </Text>
        )}
        <dl className="admin-facts">
          <dt>{t('superAdmin.summary.dm')}</dt>
          <dd className="user-copy">{c.dm_emails.filter(Boolean).join(', ') || '—'}</dd>
          <dt>{t('superAdmin.summary.players')}</dt>
          <dd>{c.players}</dd>
          <dt>{t('superAdmin.summary.characters')}</dt>
          <dd>{c.characters}</dd>
          <dt>{t('superAdmin.summary.encounters')}</dt>
          <dd>{c.encounters}</dd>
          <dt>{t('superAdmin.summary.created')}</dt>
          <dd>{date(c.created_at)}</dd>
          <dt>{t('superAdmin.summary.last')}</dt>
          <dd>{date(c.last_activity, true)}</dd>
        </dl>
        {inside ? (
          <Group gap="sm">
            <Button
              component={Link}
              to={`/campaign/${c.id}`}
              leftSection={<DoorOpen size={18} aria-hidden="true" />}
            >
              {t('superAdmin.summary.open')}
            </Button>
            <Button
              variant="default"
              leftSection={<LogOut size={18} aria-hidden="true" />}
              loading={exit.isPending}
              onClick={() => exit.mutate(c.id)}
            >
              {t('superAdmin.summary.exit')}
            </Button>
          </Group>
        ) : c.viewer_role ? (
          <Stack gap={6} align="flex-start">
            <Button
              component={Link}
              to={`/campaign/${c.id}`}
              leftSection={<DoorOpen size={18} aria-hidden="true" />}
            >
              {t('superAdmin.summary.open')}
            </Button>
            <Text size="sm" c="dimmed">
              {t('superAdmin.summary.member')}
            </Text>
          </Stack>
        ) : (
          <Stack gap={6} align="flex-start">
            <Button
              leftSection={<LogIn size={18} aria-hidden="true" />}
              loading={enter.isPending}
              onClick={() =>
                enter.mutate(c.id, { onSuccess: () => void navigate(`/campaign/${c.id}`) })
              }
            >
              {t('superAdmin.summary.enter')}
            </Button>
            <Text size="sm" c="dimmed">
              {t('superAdmin.summary.enterHint')}
            </Text>
          </Stack>
        )}
        {(enter.isError || exit.isError) && (
          <Alert color="red" role="alert">
            {t('superAdmin.actionError')}
          </Alert>
        )}
        {inside && (
          <Text size="sm" c="dimmed">
            {t('superAdmin.summary.until', { time: date(c.access_expires_at, true) })}
          </Text>
        )}
      </Stack>
    </Paper>
  )
}

function UsageTab() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const usage = useQuery(adminUsageQuery(state.user!.id))
  const pct = usePercent()
  const date = useDate()
  if (usage.isPending) return <Loader size="sm" aria-label={t('common.loading')} />
  if (usage.isError) return <LoadError onRetry={() => void usage.refetch()} />
  return (
    <Stack gap="sm">
      <Text c="dimmed">{t('superAdmin.usage.lead')}</Text>
      <div
        className="admin-table-wrap"
        role="region"
        aria-label={t('superAdmin.tab.usage')}
        tabIndex={0}
      >
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t('superAdmin.usage.week')}</th>
              <th scope="col">{t('superAdmin.usage.campaigns')}</th>
              <th scope="col">{t('superAdmin.usage.activated')}</th>
              <th scope="col">{t('superAdmin.usage.solo')}</th>
              <th scope="col">{t('superAdmin.usage.returned')}</th>
            </tr>
          </thead>
          <tbody>
            {usage.data.map((row) => (
              <tr key={row.cohort_week} data-total={row.cohort_week === 'total' || undefined}>
                <th scope="row">
                  {row.cohort_week === 'total'
                    ? t('superAdmin.usage.total')
                    : date(`${row.cohort_week}T00:00:00Z`)}
                </th>
                <td>{row.campaigns}</td>
                <td>
                  {row.activated_settled}/{row.activation_denominator}
                  <span className="admin-share">
                    {pct(row.activated_settled, row.activation_denominator)}
                  </span>
                </td>
                <td>{row.solo_preparation}</td>
                <td>
                  {row.returned_settled}/{row.return_denominator}
                  <span className="admin-share">
                    {pct(row.returned_settled, row.return_denominator)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Stack>
  )
}

function AuditTab() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const audit = useQuery(adminAuditQuery(state.user!.id))
  const date = useDate()
  if (audit.isPending) return <Loader size="sm" aria-label={t('common.loading')} />
  if (audit.isError) return <LoadError onRetry={() => void audit.refetch()} />
  if (audit.data.length === 0) return <Text c="dimmed">{t('superAdmin.audit.none')}</Text>
  return (
    <ul className="admin-list" aria-label={t('superAdmin.tab.audit')}>
      {audit.data.map((entry) => (
        <li key={entry.id} className="admin-row is-static">
          <span className="admin-row-main">
            <span className="admin-row-name">{auditLine(t, entry)}</span>
            <span className="admin-row-meta user-copy">
              {[entry.actor, date(entry.at, true)].filter(Boolean).join(' · ')}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function auditLine(t: TFunction, entry: AuditEntry) {
  const campaign = entry.campaign ?? t('superAdmin.audit.deleted')
  if (entry.action === 'account_lookup')
    return t(entry.detail.found ? 'superAdmin.audit.lookupFound' : 'superAdmin.audit.lookupMissing')
  if (entry.action === 'exit') {
    const minutes = Math.max(1, Math.round(Number(entry.detail.seconds ?? 0) / 60))
    return t('superAdmin.audit.exit', { campaign, minutes })
  }
  return t(`superAdmin.audit.${entry.action}`, { campaign })
}

function AccountsTab() {
  const { t } = useTranslation()
  const lookup = useAccountLookup()
  const [query, setQuery] = useState('')
  const date = useDate()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (query.trim().length >= 3) lookup.mutate(query)
  }
  return (
    <Stack gap="md">
      <form onSubmit={submit} className="admin-lookup">
        <TextInput
          label={t('superAdmin.accounts.label')}
          description={t('superAdmin.accounts.hint')}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          maxLength={254}
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" loading={lookup.isPending} disabled={query.trim().length < 3}>
          {t('superAdmin.accounts.find')}
        </Button>
      </form>
      <div role="status" aria-live="polite">
        {lookup.isSuccess && lookup.data === null && <Text>{t('superAdmin.accounts.none')}</Text>}
      </div>
      {lookup.isError && (
        <Alert color="red" role="alert">
          {t('superAdmin.actionError')}
        </Alert>
      )}
      {lookup.data && (
        <Paper p="lg" className="admin-card">
          <dl className="admin-facts">
            <dt>{t('superAdmin.accounts.email')}</dt>
            <dd className="user-copy">{lookup.data.email ?? '—'}</dd>
            <dt>{t('superAdmin.accounts.username')}</dt>
            <dd className="user-copy">{lookup.data.username ?? '—'}</dd>
            <dt>{t('superAdmin.accounts.created')}</dt>
            <dd>{date(lookup.data.created_at)}</dd>
            <dt>{t('superAdmin.accounts.lastSignIn')}</dt>
            <dd>{date(lookup.data.last_sign_in_at, true)}</dd>
            <dt>{t('superAdmin.accounts.providers')}</dt>
            <dd>
              {lookup.data.providers.map((provider) => providerLabel(t, provider)).join(', ') ||
                '—'}
            </dd>
          </dl>
          <Text fw={600} mt="md" mb={4}>
            {t('superAdmin.accounts.campaigns')}
          </Text>
          {lookup.data.campaigns.length === 0 ? (
            <Text c="dimmed">{t('superAdmin.accounts.noCampaigns')}</Text>
          ) : (
            <ul className="admin-plain-list">
              {lookup.data.campaigns.map((c) => (
                <li key={c.id}>
                  <Link to={`/admin?tab=campaigns&campaign=${c.id}`} className="user-copy">
                    {c.name}
                  </Link>{' '}
                  · {t(c.role === 'dm' ? 'superAdmin.accounts.dm' : 'superAdmin.accounts.player')}
                </li>
              ))}
            </ul>
          )}
        </Paper>
      )}
    </Stack>
  )
}
