import { useState } from 'react'
import { Button, Group, Modal, Stack, Paper, Text, Title, UnstyledButton } from '@mantine/core'
import { Check, ChevronRight, Hourglass, Map, Play, Shield, UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useBackToClose } from '@/shared/ui/use-back-to-close'
import type { Member } from '../domain/campaign'

export function FirstSession({
  campaignId,
  joined,
  pending,
  modules,
  linked,
  available,
  nextMember,
  onInvite,
  onModules,
  onAssign,
}: {
  campaignId: string
  joined: boolean
  pending: number
  modules: boolean
  linked: boolean
  available: boolean
  nextMember?: Member
  onInvite: (target: HTMLElement) => void
  onModules: () => void
  onAssign: (member: Member) => void
}) {
  const { t } = useTranslation()
  const [rehearsing, setRehearsing] = useState(false)
  const invitationSent = joined || pending > 0
  const row = (Icon: typeof Shield, label: string, hint: string, actionable = true) => (
    <>
      <span className="first-session-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="first-session-text">
        <Text fw={600}>{label}</Text>
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
      </span>
      {actionable && (
        <ChevronRight size={18} aria-hidden="true" className="first-session-chevron" />
      )}
    </>
  )
  const characterLabel = t(
    linked
      ? 'dm.characterLinked'
      : nextMember && available
        ? 'dm.linkCharacter'
        : available
          ? 'dm.characterReady'
          : 'dm.stepCharacters',
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
          {t('dm.stepsComplete', { count: Number(joined) + Number(modules) + Number(linked) })}
        </Text>
      </div>
      <ul className="first-session-list">
        <li>
          {invitationSent ? (
            <div className="first-session-row">
              {row(
                joined ? Check : Hourglass,
                t(joined ? 'dm.playerJoined' : 'dm.invitePending'),
                t(joined ? (linked ? 'dm.groupLinked' : 'dm.joinedHint') : 'dm.waitForPlayer'),
                false,
              )}
            </div>
          ) : (
            <UnstyledButton
              className="first-session-row"
              onClick={(e) => onInvite(e.currentTarget)}
            >
              {row(UserPlus, t('dm.stepInvite'), t('dm.stepInviteHint'))}
            </UnstyledButton>
          )}
        </li>
        <li>
          <UnstyledButton className="first-session-row" onClick={onModules}>
            {row(
              modules ? Check : Shield,
              t(modules ? 'dm.modulesReady' : 'dm.stepModules'),
              t('dm.stepModulesHint'),
            )}
          </UnstyledButton>
        </li>
        <li>
          {nextMember && available ? (
            <UnstyledButton className="first-session-row" onClick={() => onAssign(nextMember)}>
              {row(Users, characterLabel, nextMember.display_name || nextMember.email)}
            </UnstyledButton>
          ) : (
            <UnstyledButton
              component={Link}
              to={`/campaign/${campaignId}/party`}
              className="first-session-row"
            >
              {row(
                linked ? Check : Users,
                characterLabel,
                t(
                  linked
                    ? 'module.party'
                    : available
                      ? 'dm.waitForMember'
                      : 'dm.stepCharactersHint',
                ),
              )}
            </UnstyledButton>
          )}
        </li>
        <li>
          <UnstyledButton
            component={Link}
            to={`/campaign/${campaignId}/tabletop`}
            className="first-session-row"
          >
            {row(Map, t('dm.stepTable'), t('dm.stepTableHint'))}
          </UnstyledButton>
        </li>
        <li>
          <UnstyledButton className="first-session-row" onClick={() => setRehearsing(true)}>
            {row(Play, t('dm.rehearse'), t('dm.rehearseHint'))}
          </UnstyledButton>
        </li>
      </ul>
      {rehearsing && <SoloRehearsal close={() => setRehearsing(false)} />}
    </Paper>
  )
}

function SoloRehearsal({ close }: { close: () => void }) {
  const { t } = useTranslation()
  const [turn, setTurn] = useState(0)
  const participants = ['Arin', 'Bea', t('dm.rehearsalCreature')]
  const round = Math.floor(turn / participants.length) + 1
  useBackToClose(true, close)
  return (
    <Modal
      opened
      onClose={close}
      title={t('dm.rehearse')}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t('dm.rehearseHint')}
        </Text>
        <div aria-live="polite" aria-atomic="true">
          <Text fw={700}>
            {t('combat.turn.announce', { name: participants[turn % participants.length]!, round })}
          </Text>
          <Text>
            {t('combat.turn.upNext')} · {participants[(turn + 1) % participants.length]}
          </Text>
        </div>
        <Group justify="space-between">
          <Button variant="subtle" disabled={turn === 0} onClick={() => setTurn(0)}>
            {t('dm.restartRehearsal')}
          </Button>
          <Button data-autofocus onClick={() => setTurn((current) => current + 1)}>
            {t('combat.turn.next')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
