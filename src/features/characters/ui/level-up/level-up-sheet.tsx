import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Group, Loader, Text } from '@mantine/core'
import { ArrowLeft, ArrowRight, Check, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CampaignSettingsError, type CampaignSettingsReason } from '@/features/campaigns'
import { useGlossary, useSrdLibrary } from '@/features/glossary'
import { Modal } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { useApplyLevelUp } from '../../api'
import {
  hasChoices,
  levelUpGrants,
  levelUpRequirements,
  noChoices,
  planLevelUp,
  summarizeLevelUp,
  type HitPointChoice,
  type LevelUpChoices,
  type LevelUpSummary,
} from '../../domain/level-up'
import { isClassKey } from '../../domain/rules'
import type { Build } from '../../domain/sheet'
import { useResourceNames } from '../resource-names'
import { useSubmitGuard } from '../use-submit-guard'
import { ChoicesStep, DoneView, GrantsStep, HitPointsStep, ReviewStep } from './level-up-steps'
import './level-up.css'

/** The sheet as it was when the level-up opened; the write is made against this revision. */
export type LevelUpSnapshot = { level: number; maxHp: number; build: Build; revision: number }

type StepKey = 'hp' | 'grants' | 'choices' | 'review'

const refusals = [
  'stale',
  'encounter-locked',
  'above-party-level',
  'sheet-incomplete',
  'class-change',
  'forbidden',
  'character-unavailable',
  'invalid',
  'request-mismatch',
] as const
/** The notice for a refusal; a character the DM marked absent reads as unavailable. */
function errorKeyOf(reason: CampaignSettingsReason | null) {
  if (reason === 'character-absent') return 'character-unavailable'
  return refusals.find((item) => item === reason) ?? 'unavailable'
}

/**
 * RYT-130: the guided level-up of a Player. Hit points, what the level grants, the required
 * choices and one confirm that writes level, hit points and build through one transactional RPC.
 * A failure leaves the character as it was; the confirm becomes a retry that repeats the same
 * request id. After the write the same sheet shows what changed.
 */
export function LevelUpSheet({
  opened,
  onClose,
  onAgain,
  campaignId,
  characterId,
  characterName,
  snapshot,
}: {
  opened: boolean
  onClose: () => void
  /** Present when the party level is still above the new level: starts the next one. */
  onAgain: (() => void) | null
  campaignId: string
  characterId: string
  characterName: string
  snapshot: LevelUpSnapshot
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const glossary = useGlossary()
  const library = useSrdLibrary()
  const names = useResourceNames()
  const mutation = useApplyLevelUp()
  const submit = useSubmitGuard()
  const [step, setStep] = useState<StepKey>('hp')
  const [hitPoints, setHitPoints] = useState<HitPointChoice>({ kind: 'average' })
  const [choices, setChoices] = useState<LevelUpChoices>(noChoices)
  const [summary, setSummary] = useState<LevelUpSummary | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const settled = useRef(false)
  const alert = useRef<HTMLDivElement>(null)
  const { level, build } = snapshot
  const toLevel = level + 1
  const custom = !isClassKey(build.classKey)
  const libraryState = custom || library ? 'ready' : glossary?.indexError ? 'error' : 'loading'
  const features = useMemo(() => library?.features ?? [], [library])
  const plan = useMemo(
    () =>
      libraryState === 'ready'
        ? planLevelUp({ build, level, maxHp: snapshot.maxHp, hitPoints, choices }, features, names)
        : null,
    [libraryState, build, level, snapshot.maxHp, hitPoints, choices, features, names],
  )
  const grants = useMemo(
    () => (libraryState === 'ready' ? levelUpGrants(build, level, toLevel, features, names) : null),
    [libraryState, build, level, toLevel, features, names],
  )
  // The steps follow the build and the level, never the hit points typed so far.
  const requirements = useMemo(() => levelUpRequirements(build, toLevel), [build, toLevel])
  const steps: StepKey[] = [
    'hp',
    'grants',
    ...(hasChoices(requirements) ? ['choices' as const] : []),
    'review',
  ]
  const index = Math.max(0, steps.indexOf(step))
  const pending = mutation.isPending
  const reason = mutation.error instanceof CampaignSettingsError ? mutation.error.reason : null
  const errorKey = errorKeyOf(reason)
  const retryable = mutation.isError && (reason === 'unavailable' || reason === null)
  // A refused write the Player cannot fix by repeating it: only a way out is offered.
  const refused = mutation.isError && !retryable

  // Each step names itself to assistive technology and keeps focus in the sheet's own flow.
  useEffect(() => {
    if (settled.current) heading.current?.focus()
    settled.current = true
  }, [step, summary])

  // A failure or a refusal is brought into view and focused, so the reason is never off-screen.
  const failed = mutation.isError ? mutation.submittedAt : 0
  useEffect(() => {
    if (!failed) return
    alert.current?.scrollIntoView({ block: 'start' })
    alert.current?.focus({ preventScroll: true })
  }, [failed])

  const close = () => {
    if (pending) return
    onClose()
  }
  const go = (next: StepKey) => {
    // A refusal stays: going back and forward must not bring the confirm back.
    if (!refused) mutation.reset()
    setStep(next)
  }
  const nextBlocked = (step === 'hp' && !plan) || (step === 'grants' && libraryState !== 'ready')
  const advance = () => {
    if (nextBlocked) return
    go(steps[Math.min(steps.length - 1, index + 1)]!)
  }
  const confirm = async () => {
    if (!plan || plan.missing.length > 0 || pending) return
    const key = JSON.stringify([snapshot.revision, plan.level, plan.maxHp, plan.build])
    try {
      const done = await submit.run(async () => {
        await mutation.mutateAsync({
          campaignId,
          characterId,
          expectedRevision: snapshot.revision,
          level: plan.level,
          maxHp: plan.maxHp,
          build: plan.build,
          requestId: submit.idFor(key),
        })
        submit.done(key)
        return true
      })
      if (done)
        setSummary(
          summarizeLevelUp(
            { level, maxHp: snapshot.maxHp, build },
            { level: plan.level, maxHp: plan.maxHp, build: plan.build },
          ),
        )
    } catch {
      // The mutation state carries the error; the character is unchanged.
    }
  }

  const stepName = (key: StepKey) => t(`levelUp.step.${key}`)
  const reviewSummary = plan
    ? summarizeLevelUp(
        { level, maxHp: snapshot.maxHp, build },
        { level: plan.level, maxHp: plan.maxHp, build: plan.build },
      )
    : null

  return (
    <Modal
      opened={opened}
      onClose={close}
      fullScreen={phone}
      size="lg"
      title={t('levelUp.title', { level: toLevel })}
      closeOnEscape={!pending}
      closeOnClickOutside={false}
      returnFocus={false}
      onExitTransitionEnd={() => {
        // The prompt that opened the sheet is gone once the level is reached: the sheet's name is next.
        const opener = document.querySelector<HTMLElement>('[data-levelup-prompt-cta]')
        ;(opener ?? document.querySelector<HTMLElement>('#sheet-name'))?.focus()
      }}
      closeButtonProps={{ 'aria-label': t('panel.close'), size: 44, disabled: pending }}
      classNames={{ body: 'levelup-modal-body' }}
    >
      <div className="levelup-who">
        <Text fw={600} className="user-copy">
          {characterName}
        </Text>
        <span className="levelup-who-levels">
          <span className="visually-hidden">
            {t('levelUp.fromTo', { from: level, to: toLevel })}
          </span>
          <span aria-hidden="true">
            {level} → {toLevel}
          </span>
        </span>
      </div>
      {summary ? (
        <>
          <h3 className="levelup-heading" ref={heading} tabIndex={-1} data-autofocus>
            {t('levelUp.done.title', { level: summary.toLevel })}
          </h3>
          <DoneView summary={summary} />
          <div className="levelup-footer">
            <Group justify="flex-end" gap="sm">
              {onAgain ? (
                <Button variant="default" onClick={onClose}>
                  {t('levelUp.done.close')}
                </Button>
              ) : null}
              <Button
                onClick={onAgain ?? onClose}
                rightSection={onAgain ? <ArrowRight size={18} aria-hidden="true" /> : undefined}
                leftSection={onAgain ? undefined : <Check size={18} aria-hidden="true" />}
              >
                {onAgain
                  ? t('levelUp.promptCta', { level: summary.toLevel + 1 })
                  : t('levelUp.done.close')}
              </Button>
            </Group>
          </div>
        </>
      ) : (
        <>
          <div className="levelup-progress">
            <div className="levelup-progress-bars" aria-hidden="true">
              {steps.map((key, position) => (
                <span
                  key={key}
                  data-state={position < index ? 'done' : position === index ? 'now' : undefined}
                />
              ))}
            </div>
            <Text size="sm" c="dimmed" aria-live="polite">
              {t('levelUp.progress', {
                current: index + 1,
                total: steps.length,
                name: stepName(step),
              })}
            </Text>
          </div>
          {mutation.isError && step === 'review' && (
            <Alert
              ref={alert}
              tabIndex={-1}
              color="red"
              role="alert"
              icon={<TriangleAlert size={18} aria-hidden="true" />}
              title={t('levelUp.error.title')}
              className="levelup-error"
            >
              {t(`levelUp.error.${errorKey}`)} {t('levelUp.error.unchanged')}
            </Alert>
          )}
          <h3 className="levelup-heading" ref={heading} tabIndex={-1} data-autofocus>
            {step === 'hp' && t('levelUp.hp.heading', { level: toLevel })}
            {step === 'grants' && t('levelUp.grants.heading', { level: toLevel })}
            {step === 'choices' && t('levelUp.choices.heading', { level: toLevel })}
            {step === 'review' && t('levelUp.review.heading')}
          </h3>
          {step === 'hp' && (
            <HitPointsStep
              build={build}
              toLevel={toLevel}
              maxHp={snapshot.maxHp}
              value={hitPoints}
              onChange={setHitPoints}
            />
          )}
          {step === 'grants' && (
            <GrantsStep
              grants={grants}
              toLevel={toLevel}
              customClass={custom}
              subclassPending={requirements.subclass}
              library={libraryState}
              onRetryLibrary={() => glossary?.retry()}
            />
          )}
          {step === 'choices' && plan && (
            <ChoicesStep
              build={build}
              toLevel={toLevel}
              requirements={requirements}
              missing={plan.missing}
              choices={choices}
              onChange={setChoices}
            />
          )}
          {step === 'review' && plan && reviewSummary && (
            <ReviewStep plan={plan} summary={reviewSummary} onChoices={() => go('choices')} />
          )}
          <div className="levelup-footer">
            <Group justify="space-between" gap="sm" className="levelup-footer-row">
              <Button
                variant="default"
                leftSection={<ArrowLeft size={18} aria-hidden="true" />}
                aria-disabled={index === 0 || pending || undefined}
                onClick={() => index > 0 && !pending && go(steps[index - 1]!)}
              >
                {t('levelUp.back')}
              </Button>
              {step !== 'review' ? (
                <Button
                  rightSection={<ArrowRight size={18} aria-hidden="true" />}
                  aria-disabled={nextBlocked || undefined}
                  onClick={advance}
                >
                  {t('levelUp.next')}
                </Button>
              ) : refused ? (
                <Button onClick={onClose}>{t('levelUp.error.close')}</Button>
              ) : (
                <Button
                  aria-disabled={!plan || plan.missing.length > 0 || pending || undefined}
                  aria-busy={pending || undefined}
                  leftSection={
                    pending ? (
                      <Loader size={16} aria-hidden="true" />
                    ) : (
                      <Check size={18} aria-hidden="true" />
                    )
                  }
                  onClick={() => void confirm()}
                >
                  {pending
                    ? t('levelUp.review.saving')
                    : retryable
                      ? t('common.retry')
                      : t('levelUp.review.confirm', { level: toLevel })}
                </Button>
              )}
            </Group>
          </div>
        </>
      )}
    </Modal>
  )
}
