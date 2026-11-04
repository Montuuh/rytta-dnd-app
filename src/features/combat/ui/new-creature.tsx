import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core'
import {
  ArrowLeft,
  BookCopy,
  Check,
  ClipboardPaste,
  Crosshair,
  Crown,
  Footprints,
  Shield,
  Sparkles,
  Swords,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  archetypeDraft,
  archetypes,
  parseStatBlockText,
  proficiencyForCr,
  xpForCr,
  type Archetype,
  type Baseline,
  type BestiaryLanguage,
  type CreatureListItem,
  type CreatureSize,
  type CreatureType,
  type StatBlock,
} from '@/features/bestiary'
import { usePhone } from '@/shared/ui/use-viewport'
import { draftFromBlock, metaLine, type CreatureDraft } from './creature-draft'
import { CrDial, SizeScale, TypeTiles } from './bestiary-widgets'
import { creatureFilter } from './creatures'

type Step = 'choose' | 'srd' | 'archetype' | 'paste'
const archetypeIcons: Record<Archetype, LucideIcon> = {
  brute: Swords,
  skirmisher: Footprints,
  artillery: Crosshair,
  spellcaster: Sparkles,
  leader: Crown,
  minion: Users,
}

/**
 * "New creature" (ADR 028): four ways to start. Quick (core numbers only), from an SRD creature,
 * from an archetype and a CR, or from pasted text. Every start but quick opens the full editor
 * with a draft; nothing is stored until the DM saves.
 */
export function NewCreatureDialog({
  language,
  baselines,
  srdItems,
  srdBlock,
  onQuick,
  onDraft,
  onClose,
}: {
  language: BestiaryLanguage
  baselines: Baseline[]
  srdItems: CreatureListItem[]
  srdBlock: (id: string) => StatBlock | null
  onQuick: () => void
  onDraft: (draft: CreatureDraft, unplaced?: string[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const [step, setStep] = useState<Step>('choose')
  // A new step replaces the content: focus its first field (or the first way to start).
  const [moved, setMoved] = useState(false)
  useEffect(() => {
    if (!moved) return
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('.bst-new-creature [data-autofocus]')?.focus(),
    )
  }, [step, moved])
  const go = (next: Step) => {
    setMoved(true)
    setStep(next)
  }
  const back = (
    <Button
      variant="subtle"
      leftSection={<ArrowLeft size={16} aria-hidden="true" />}
      onClick={() => go('choose')}
    >
      {t('bestiary.start.back')}
    </Button>
  )
  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen={phone}
      zIndex={400}
      size="lg"
      title={t(`bestiary.start.title.${step}`)}
      classNames={{ content: 'bst-new-creature' }}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      {step === 'choose' && (
        <ul className="bst-start" aria-label={t('bestiary.start.title.choose')}>
          {(
            [
              ['quick', Zap],
              ['srd', BookCopy],
              ['archetype', Shield],
              ['paste', ClipboardPaste],
            ] as const
          ).map(([key, Icon], index) => (
            <li key={key}>
              <UnstyledButton
                className="bst-start-card"
                data-autofocus={index === 0 || undefined}
                onClick={() => (key === 'quick' ? onQuick() : go(key))}
              >
                <span className="bst-start-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <span>
                  <span className="bst-start-name">{t(`bestiary.start.${key}`)}</span>
                  <span className="bst-start-help">{t(`bestiary.start.${key}Help`)}</span>
                </span>
              </UnstyledButton>
            </li>
          ))}
        </ul>
      )}
      {step === 'srd' && (
        <FromSrd
          items={srdItems}
          back={back}
          pick={(item) => {
            const block = srdBlock(item.id)
            if (!block) return
            onDraft(
              draftFromBlock(t, language, block, {
                size: item.size[0],
                type: item.type,
                cr: item.cr,
                legendary: item.legendary,
                srdId: item.id,
                name: t('bestiary.start.copyName', { name: item.name }),
              }),
            )
          }}
        />
      )}
      {step === 'archetype' && (
        <FromArchetype
          back={back}
          create={(input) => {
            const { block, core } = archetypeDraft({
              ...input,
              baselines,
              t: (key, options) => t(key as never, options as never) as unknown as string,
            })
            block.meta = metaLine(t, language, {
              ...input,
              tags: '',
              alignment: t('bestiary.editor.defaultAlignment'),
            })
            onDraft(
              draftFromBlock(t, language, block, {
                size: input.size,
                type: input.type,
                cr: input.cr,
                legendary: core.legendary,
                metaAuto: true,
              }),
            )
          }}
        />
      )}
      {step === 'paste' && (
        <FromPaste
          back={back}
          read={(text) => {
            const parsed = parseStatBlockText(text)
            onDraft(
              draftFromBlock(t, language, parsed.block, {
                size: parsed.core.size,
                type: parsed.core.type,
                cr: parsed.core.cr,
                legendary: parsed.core.legendary,
                notes: t('bestiary.paste.note'),
              }),
              parsed.unplaced,
            )
          }}
        />
      )}
    </Modal>
  )
}

function FromSrd({
  items,
  back,
  pick,
}: {
  items: CreatureListItem[]
  back: ReactNode
  pick: (item: CreatureListItem) => void
}) {
  const { t } = useTranslation()
  const [id, setId] = useState<string | null>(null)
  const item = items.find((i) => i.id === id)
  const filter = useMemo(
    () => creatureFilter(new Map(items.map((i) => [i.id, `${i.name} ${i.altName ?? ''}`]))),
    [items],
  )
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('bestiary.start.srdBody')}
      </Text>
      <Select
        data-autofocus
        searchable
        filter={filter}
        label={t('bestiary.start.srdPick')}
        placeholder={t('bestiary.searchPlaceholder')}
        nothingFoundMessage={t('bestiary.noMatch')}
        value={id}
        onChange={setId}
        limit={60}
        comboboxProps={{ zIndex: 410 }}
        data={items.map((i) => ({
          value: i.id,
          label: `${i.name} · ${t('bestiary.crShort', { cr: i.cr })}`,
        }))}
      />
      <Group justify="space-between" className="bst-dialog-actions">
        {back}
        <Button disabled={!item} onClick={() => item && pick(item)}>
          {t('bestiary.start.continue')}
        </Button>
      </Group>
    </Stack>
  )
}

function FromArchetype({
  back,
  create,
}: {
  back: ReactNode
  create: (input: {
    archetype: Archetype
    cr: string
    name: string
    size: CreatureSize
    type: CreatureType
  }) => void
}) {
  const { t } = useTranslation()
  const [archetype, setArchetype] = useState<Archetype>('brute')
  const [cr, setCr] = useState('2')
  const [name, setName] = useState('')
  const [size, setSize] = useState<CreatureSize>('medium')
  const [type, setType] = useState<CreatureType>('monstrosity')
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) create({ archetype, cr, name: name.trim(), size, type })
      }}
    >
      <Stack gap="md">
        <TextInput
          data-autofocus
          required
          label={t('combat.add.name')}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <fieldset className="bst-archetypes">
          <legend>{t('bestiary.start.archetypeLegend')}</legend>
          {archetypes.map((key) => {
            const Icon = archetypeIcons[key]
            return (
              <label key={key} className="bst-archetype">
                <input
                  type="radio"
                  name="archetype"
                  value={key}
                  checked={archetype === key}
                  onChange={() => setArchetype(key)}
                />
                <Icon size={20} aria-hidden="true" />
                <span className="bst-tile-seal" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
                <span>
                  <span className="bst-start-name">{t(`bestiary.arch.${key}`)}</span>
                  <span className="bst-start-help">{t(`bestiary.arch.${key}Help`)}</span>
                </span>
              </label>
            )
          })}
        </fieldset>
        <CrDial
          label={t('bestiary.cr')}
          value={cr}
          onChange={setCr}
          description={t('bestiary.editor.crHelp', {
            xp: xpForCr(cr as Parameters<typeof xpForCr>[0]).toLocaleString(),
            pb: proficiencyForCr(cr as Parameters<typeof proficiencyForCr>[0]),
          })}
        />
        <SizeScale legend={t('bestiary.editor.size')} value={size} onChange={setSize} />
        <TypeTiles compact legend={t('bestiary.editor.type')} value={type} onChange={setType} />
        <Text size="sm" c="dimmed">
          {t('bestiary.start.archetypeNote')}
        </Text>
        <Group justify="space-between" className="bst-dialog-actions">
          {back}
          <Button type="submit" disabled={!name.trim()}>
            {t('bestiary.start.createDraft')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

function FromPaste({ back, read }: { back: ReactNode; read: (text: string) => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim()) read(text)
      }}
    >
      <Stack gap="md">
        <Textarea
          data-autofocus
          autosize
          minRows={8}
          maxRows={18}
          label={t('bestiary.paste.label')}
          description={t('bestiary.paste.help')}
          value={text}
          maxLength={20000}
          onChange={(e) => setText(e.currentTarget.value)}
        />
        <Text size="sm" c="dimmed">
          {t('bestiary.paste.private')}
        </Text>
        <Group justify="space-between" className="bst-dialog-actions">
          {back}
          <Button type="submit" disabled={!text.trim()}>
            {t('bestiary.paste.read')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
