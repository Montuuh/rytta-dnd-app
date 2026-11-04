import { useState } from 'react'
import { Badge, Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, PawPrint, Plus, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useAuth } from '@/features/auth'
import { QueryFeedback } from '@/features/campaigns'
import { encountersQuery } from '../api'
import type { EncounterSummary } from '../domain/combat'
import { useRunner } from './helpers'
import { RunnerError } from './parts'

/** DM hub: the live encounter first, then prepared drafts, then history. The bestiary lives in
 * the DM Command Center (ADR 028); old `?tab=bestiary` links go there. */
export function EncounterList({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const bestiaryPath = `/campaign/${campaignId}/members?panel=bestiary`
  if (params.get('tab') === 'bestiary') return <Navigate to={bestiaryPath} replace />
  return (
    <Stack gap="lg">
      <Encounters campaignId={campaignId} />
      <Paper className="combat-panel combat-bestiary-link" p="sm">
        <Group gap="sm" wrap="nowrap" align="center">
          <PawPrint size={22} className="feature-icon" aria-hidden="true" />
          <Text size="sm" style={{ flex: 1 }}>
            {t('combat.bestiaryLink.body')}
          </Text>
          <Button component={Link} to={bestiaryPath} variant="light">
            {t('combat.bestiaryLink.open')}
          </Button>
        </Group>
      </Paper>
    </Stack>
  )
}

function Encounters({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const query = useQuery(encountersQuery(state.user!.id, campaignId))
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  const [name, setName] = useState('')
  const all = query.data ?? []
  const live = all.filter((e) => e.status === 'initiative' || e.status === 'active')
  const drafts = all.filter((e) => e.status === 'draft')
  const ended = all.filter((e) => e.status === 'ended')
  return (
    <Stack gap="lg">
      <form
        className="combat-create"
        onSubmit={async (event) => {
          event.preventDefault()
          const value = name.trim()
          if (!value) return
          if (await run({ kind: 'create', name: value })) setName('')
        }}
      >
        <TextInput
          label={t('combat.create.label')}
          placeholder={t('combat.create.placeholder')}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Button
          type="submit"
          leftSection={<Plus size={16} aria-hidden="true" />}
          disabled={pending || !name.trim()}
        >
          {t('combat.create.submit')}
        </Button>
      </form>
      <RunnerError error={error} trigger={trigger} onClose={clear} />
      <QueryFeedback
        pending={query.isPending}
        error={query.isError}
        retry={() => void query.refetch()}
      />
      {query.data && all.length === 0 && <Text c="dimmed">{t('combat.list.empty')}</Text>}
      {live.length > 0 && <EncounterGroup title={t('combat.list.live')} items={live} highlight />}
      {drafts.length > 0 && <EncounterGroup title={t('combat.list.drafts')} items={drafts} />}
      {ended.length > 0 && <EncounterGroup title={t('combat.list.ended')} items={ended} />}
    </Stack>
  )
}

export function EncounterGroup({
  title,
  items,
  highlight = false,
}: {
  title: string
  items: EncounterSummary[]
  highlight?: boolean
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={title}>
      <Title order={2} className="combat-section-title">
        {title}
      </Title>
      <ul className="combat-cards">
        {items.map((item) => (
          <li key={item.id} className={`combat-card${highlight ? ' is-live' : ''}`}>
            <Link
              to={item.id}
              className="combat-card-link"
              aria-label={t('combat.open', { name: item.name })}
            >
              <span className="combat-card-icon" aria-hidden="true">
                <Swords size={20} />
              </span>
              <span className="combat-card-text">
                <Text component="span" fw={700} className="combat-card-name">
                  {item.name}
                </Text>
                <Group component="span" gap={6}>
                  <Badge variant={highlight ? 'filled' : 'light'} size="sm">
                    {t(`combat.status.${item.status}`)}
                  </Badge>
                  {item.status === 'active' && (
                    <Text component="span" size="sm" c="dimmed">
                      {t('combat.round', { round: item.round })}
                    </Text>
                  )}
                  <Text component="span" size="sm" c="dimmed">
                    {t('combat.combatants', { count: item.combatants })}
                  </Text>
                  {item.needs_initiative && (
                    <Badge color="yellow" variant="light" size="sm">
                      {t('combat.needsInitiative')}
                    </Badge>
                  )}
                </Group>
              </span>
              <ChevronRight size={20} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
