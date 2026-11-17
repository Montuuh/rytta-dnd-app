import type { ReactNode } from 'react'
import { Paper, Text, Title, UnstyledButton } from '@mantine/core'
import { ChevronRight, Map as MapIcon, Shield, UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

type Done = { invite: boolean; modules: boolean; characters: boolean }

/** RYT-112: what a DM still has to do before the first session. Steps leave the list as the
 * data already loaded shows them done; "Open the table" is the closing destination. */
export function FirstSession({
  campaignId,
  done,
  onInvite,
  onModules,
}: {
  campaignId: string
  done: Done
  onInvite: (target: HTMLElement) => void
  onModules: () => void
}) {
  const { t } = useTranslation()
  // Counts the rows listed below: the open steps plus the closing "Open the table".
  const remaining = [done.invite, done.modules, done.characters].filter((step) => !step).length + 1
  const row = (icon: ReactNode, label: string, hint: string) => (
    <>
      <span className="first-session-icon">{icon}</span>
      <span className="first-session-text">
        <Text fw={600}>{label}</Text>
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="first-session-chevron" />
    </>
  )
  return (
    <Paper
      component="section"
      p="md"
      className="first-session"
      aria-labelledby="first-session-title"
    >
      <div className="first-session-head">
        <Title order={2} id="first-session-title">
          {t('dm.checklistTitle')}
        </Title>
        <Text size="sm" c="dimmed">
          {t('dm.checklistProgress', { count: remaining })}
        </Text>
      </div>
      <ul className="first-session-list">
        {!done.invite && (
          <li>
            <UnstyledButton
              className="first-session-row"
              onClick={(event) => onInvite(event.currentTarget)}
            >
              {row(
                <UserPlus size={20} aria-hidden="true" />,
                t('dm.stepInvite'),
                t('dm.stepInviteHint'),
              )}
            </UnstyledButton>
          </li>
        )}
        {!done.modules && (
          <li>
            <UnstyledButton className="first-session-row" onClick={onModules}>
              {row(
                <Shield size={20} aria-hidden="true" />,
                t('dm.stepModules'),
                t('dm.stepModulesHint'),
              )}
            </UnstyledButton>
          </li>
        )}
        {!done.characters && (
          <li>
            <UnstyledButton
              component={Link}
              to={`/campaign/${campaignId}/party`}
              className="first-session-row"
            >
              {row(
                <Users size={20} aria-hidden="true" />,
                t('dm.stepCharacters'),
                t('dm.stepCharactersHint'),
              )}
            </UnstyledButton>
          </li>
        )}
        <li>
          <UnstyledButton
            component={Link}
            to={`/campaign/${campaignId}/tabletop`}
            className="first-session-row"
          >
            {row(
              <MapIcon size={20} aria-hidden="true" />,
              t('dm.stepTable'),
              t('dm.stepTableHint'),
            )}
          </UnstyledButton>
        </li>
      </ul>
    </Paper>
  )
}
