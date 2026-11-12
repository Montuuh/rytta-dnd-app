import { useMemo, useState } from 'react'
import {
  Accordion,
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  Heart,
  Plus,
  Scale,
  Shield,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  abilityKeys,
  detailKeys,
  estimateCr,
  hitDieBySize,
  sectionKinds,
  signed,
  StatBlockView,
  type Baseline,
  type BestiaryLanguage,
  type LibraryTrait,
  type SectionKind,
} from '@/features/bestiary'
import { usePhone, useWide } from '@/shared/ui/use-viewport'
import type { CombatantTemplate } from '../domain/combat'
import {
  draftNumbers,
  draftToTemplate,
  draftUid,
  isCreatureSize,
  isCreatureType,
  metaLine,
  type CreatureDraft,
  type DraftEntry,
  type UsageChoice,
} from './creature-draft'
import { CrDial, NumberDial, SideToggle, SizeScale, TileGroup, TypeTiles } from './bestiary-widgets'
import { useRunner } from './helpers'
import { RunnerError } from './parts'

const dieFaces = [4, 6, 8, 10, 12, 20]
const usageChoices: UsageChoice[] = ['none', 'r6', 'r5', 'r4', 'd1', 'd2', 'd3']

/**
 * The full creature editor (ADR 028): identity, defences, abilities, details and the entry lists,
 * with computed modifiers, saves, hit points, XP, PB and passive Perception, a live preview (beside
 * the form from 62em, behind a switch on phones) and a balance hint from the SRD's medians.
 */
export function CreatureEditor({
  campaignId,
  initial,
  template,
  language,
  baselines,
  traits,
  unplaced = [],
  basedOn,
  version = false,
  onClose,
  onSaved,
}: {
  campaignId: string
  initial: CreatureDraft
  /** Editing an existing template (revision-checked), otherwise a new one is created. */
  template: CombatantTemplate | null
  language: BestiaryLanguage
  baselines: Baseline[]
  traits: LibraryTrait[]
  /** Pasted lines the parser could not place. */
  unplaced?: string[]
  /** A customised SRD creature: the title names it. */
  basedOn?: string
  /** RYT-089: a new campaign version of the official creature `basedOn` (edited in place). */
  version?: boolean
  onClose: () => void
  /** The saved template id (null for a new one) and the name it was saved with. */
  onSaved: (id: string | null, name: string) => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const wide = useWide()
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  const [draft, setDraft] = useState<CreatureDraft>(initial)
  const [view, setView] = useState<'form' | 'preview'>('form')
  const [confirming, setConfirming] = useState(false)
  const update = (patch: Partial<CreatureDraft>) =>
    setDraft((current) => {
      const next = { ...current, ...patch }
      if (
        next.metaAuto &&
        ('size' in patch || 'type' in patch || 'tags' in patch || 'alignment' in patch)
      )
        next.meta = metaLine(t, language, next)
      return next
    })
  const numbers = draftNumbers(draft)
  const { block, input } = useMemo(() => draftToTemplate(t, draft), [t, draft])
  const firstAttack = useMemo(() => {
    const text = draft.sections.actions
      .map((e) => e.text)
      .join(' ')
      .replace(/[−–]/g, '-')
    const attack = text.match(/(?:attack roll|tirada de ataque)[^+\-\d]{0,40}([+-]\d+)/i)
    const dc = text.match(/\b(?:DC|CD)\s*(\d+)/)
    return { attack: attack ? Number(attack[1]) : null, dc: dc ? Number(dc[1]) : null }
  }, [draft.sections.actions])
  const estimate = estimateCr({ hp: numbers.hp, ac: draft.ac, ...firstAttack }, baselines)
  const valid = draft.name.trim().length > 0
  const save = async () => {
    if (!valid || pending) return
    // RYT-089: an official creature saved without changes stays the official one (no version).
    if (version && !template && !dirty) return onClose()
    const ok = await run({
      kind: 'saveTemplate',
      templateId: template?.id ?? null,
      revision: template?.revision ?? null,
      data: version && !template ? { ...input, srd_override: true } : input,
    })
    if (ok) onSaved(template?.id ?? null, input.name)
  }
  const setEntries = (kind: SectionKind, entries: DraftEntry[]) =>
    setDraft((current) => ({ ...current, sections: { ...current.sections, [kind]: entries } }))
  const form = (
    <Stack gap="md">
      {unplaced.length > 0 && (
        <Alert
          color="yellow"
          role="status"
          title={t('bestiary.paste.unplacedTitle', { count: unplaced.length })}
        >
          <Text size="sm">{t('bestiary.paste.unplacedBody')}</Text>
          <ul className="bst-unplaced">
            {unplaced.slice(0, 8).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Alert>
      )}
      <Accordion
        multiple
        defaultValue={['identity', 'defence', 'abilities', 'entries']}
        variant="separated"
      >
        <Accordion.Item value="identity">
          <Accordion.Control>{t('bestiary.editor.identity')}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <TextInput
                data-autofocus
                required
                label={t('combat.add.name')}
                value={draft.name}
                maxLength={80}
                onChange={(e) => update({ name: e.currentTarget.value })}
              />
              <SizeScale
                legend={t('bestiary.editor.size')}
                value={draft.size}
                onChange={(v) => isCreatureSize(v) && update({ size: v, hitDie: hitDieBySize[v] })}
              />
              <TypeTiles
                compact
                legend={t('bestiary.editor.type')}
                value={draft.type}
                onChange={(v) => isCreatureType(v) && update({ type: v })}
              />
              <div className="bst-grid">
                <TextInput
                  label={t('bestiary.editor.tags')}
                  description={t('bestiary.editor.tagsHelp')}
                  value={draft.tags}
                  maxLength={40}
                  onChange={(e) => update({ tags: e.currentTarget.value })}
                />
                <TextInput
                  label={t('bestiary.editor.alignment')}
                  value={draft.alignment}
                  maxLength={40}
                  onChange={(e) => update({ alignment: e.currentTarget.value })}
                />
              </div>
              <TextInput
                label={t('bestiary.editor.meta')}
                description={t(
                  draft.metaAuto ? 'bestiary.editor.metaAuto' : 'bestiary.editor.metaManual',
                )}
                value={draft.meta}
                maxLength={200}
                onChange={(e) =>
                  setDraft((c) => ({ ...c, meta: e.currentTarget.value, metaAuto: false }))
                }
                rightSectionWidth={draft.metaAuto ? undefined : 110}
                rightSection={
                  draft.metaAuto ? undefined : (
                    <Button
                      size="compact-sm"
                      variant="subtle"
                      onClick={() =>
                        setDraft((c) => ({ ...c, metaAuto: true, meta: metaLine(t, language, c) }))
                      }
                    >
                      {t('bestiary.editor.metaReset')}
                    </Button>
                  )
                }
              />
              <div className="bst-editor-cr-side">
                <CrDial
                  label={t('bestiary.cr')}
                  value={draft.cr}
                  onChange={(v) => update({ cr: v })}
                  description={t('bestiary.editor.crHelp', {
                    xp: numbers.xp.toLocaleString(),
                    pb: numbers.pb,
                  })}
                />
                <SideToggle
                  legend={t('combat.add.side')}
                  name={draft.name}
                  value={draft.side}
                  onChange={(v) => update({ side: v })}
                />
              </div>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="defence">
          <Accordion.Control>{t('bestiary.editor.defence')}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <div className="bst-grid">
                <NumberDial
                  label={t('combat.add.ac')}
                  icon={Shield}
                  min={0}
                  max={30}
                  value={draft.ac}
                  onChange={(v) => typeof v === 'number' && update({ ac: v })}
                />
                <TextInput
                  label={t('bestiary.editor.acNote')}
                  placeholder={t('bestiary.editor.acNotePlaceholder')}
                  value={draft.acNote}
                  maxLength={60}
                  onChange={(e) => update({ acNote: e.currentTarget.value })}
                />
                <NumberDial
                  label={t('bestiary.editor.hitDice')}
                  icon={Heart}
                  description={t('bestiary.editor.hpResult', {
                    hp: numbers.hp,
                    dice: numbers.dice,
                  })}
                  min={1}
                  max={999}
                  value={draft.hitDice}
                  onChange={(v) => typeof v === 'number' && update({ hitDice: v })}
                />
                <TileGroup
                  legend={t('bestiary.editor.hitDie')}
                  className="bst-dice"
                  value={String(draft.hitDie)}
                  onChange={(v) => update({ hitDie: Number(v) })}
                  options={dieFaces.map((f) => ({
                    value: String(f),
                    content: <span className="bst-die">d{f}</span>,
                  }))}
                />
                <NumberDial
                  label={t('bestiary.editor.initiativeExtra')}
                  icon={Zap}
                  description={t('bestiary.editor.initiativeResult', {
                    value: signed(numbers.initiative),
                  })}
                  min={-10}
                  max={20}
                  value={draft.initiativeExtra}
                  onChange={(v) => typeof v === 'number' && update({ initiativeExtra: v })}
                />
                <TextInput
                  label={t('bestiary.speed')}
                  value={draft.speed}
                  maxLength={200}
                  onChange={(e) => update({ speed: e.currentTarget.value })}
                />
              </div>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="abilities">
          <Accordion.Control>{t('bestiary.abilities')}</Accordion.Control>
          <Accordion.Panel>
            <div className="bst-ability-grid">
              {abilityKeys.map((key) => (
                <fieldset key={key} className="bst-ability-field">
                  <legend>{t(`bestiary.ability.${key}`)}</legend>
                  <NumberDial
                    label={t('bestiary.editor.score', { name: t(`bestiary.ability.${key}`) })}
                    className="bst-ability-dial"
                    min={1}
                    max={30}
                    value={draft.abilities[key]}
                    onChange={(v) =>
                      typeof v === 'number' &&
                      update({ abilities: { ...draft.abilities, [key]: v } })
                    }
                  />
                  <p className="bst-ability-read">
                    <span className="bst-ability-mod">{signed(numbers.mods[key])}</span>
                    <span>
                      {t('bestiary.saveShort')} {signed(numbers.saves[key])}
                    </span>
                  </p>
                  <label className="bst-seal">
                    <input
                      type="checkbox"
                      aria-label={t('bestiary.editor.saveSealFor', {
                        name: t(`bestiary.ability.${key}`),
                      })}
                      checked={draft.saves.includes(key)}
                      onChange={(e) =>
                        update({
                          saves: e.currentTarget.checked
                            ? [...draft.saves, key]
                            : draft.saves.filter((s) => s !== key),
                        })
                      }
                    />
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span aria-hidden="true">{t('bestiary.editor.saveSeal')}</span>
                  </label>
                </fieldset>
              ))}
            </div>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="details">
          <Accordion.Control>{t('bestiary.editor.details')}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              {detailKeys.map((key) => (
                <Textarea
                  key={key}
                  autosize
                  minRows={1}
                  label={t(`bestiary.detail.${key}`)}
                  description={
                    key === 'senses'
                      ? t('bestiary.editor.passiveHelp', { value: numbers.passive })
                      : key === 'immunities'
                        ? t('bestiary.editor.immunitiesHelp')
                        : undefined
                  }
                  maxLength={500}
                  value={draft.details[key]}
                  onChange={(e) =>
                    update({ details: { ...draft.details, [key]: e.currentTarget.value } })
                  }
                />
              ))}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="entries">
          <Accordion.Control>{t('bestiary.editor.entries')}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="lg">
              {sectionKinds.map((kind) => (
                <EntryList
                  key={kind}
                  kind={kind}
                  entries={draft.sections[kind]}
                  traits={kind === 'traits' ? traits : []}
                  legendary={draft.legendary}
                  setLegendary={(value) => update({ legendary: value })}
                  onChange={(entries) => setEntries(kind, entries)}
                />
              ))}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="notes">
          <Accordion.Control>{t('bestiary.editor.notes')}</Accordion.Control>
          <Accordion.Panel>
            <Textarea
              autosize
              minRows={3}
              label={t('bestiary.editor.notesLabel')}
              description={t('bestiary.editor.notesHelp')}
              maxLength={2000}
              value={draft.notes}
              onChange={(e) => update({ notes: e.currentTarget.value })}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  )
  const preview = (
    <div className="bst-preview" aria-label={t('bestiary.editor.preview')} role="region">
      <StatBlockView block={block} level={3} headingId="creature-preview-name" />
    </div>
  )
  // Closing with changes asks first (Escape, the close button, Cancel or a click outside).
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  // Opened after the closing key event, so the same Escape does not also dismiss the question.
  const requestClose = () => (dirty ? window.setTimeout(() => setConfirming(true), 0) : onClose())
  return (
    <Modal
      opened
      onClose={requestClose}
      closeOnEscape={!confirming}
      fullScreen={phone}
      size={wide ? 'min(1240px, 96vw)' : 'xl'}
      title={
        template
          ? t('bestiary.editor.editTitle', { name: template.name })
          : basedOn
            ? t(version ? 'bestiary.editor.versionTitle' : 'bestiary.editor.basedTitle', {
                name: basedOn,
              })
            : t('bestiary.editor.newTitle')
      }
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      classNames={{ body: 'bst-editor-body' }}
      // Above the phone stat block sheet it may open from (z-index 300).
      zIndex={400}
    >
      <form
        className="bst-editor"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <RunnerError error={error} trigger={trigger} onClose={clear} />
        {!wide && (
          <SegmentedControl
            fullWidth
            className="bst-editor-switch"
            aria-label={t('bestiary.editor.viewSwitch')}
            value={view}
            onChange={(v) => setView(v as 'form' | 'preview')}
            data={[
              { value: 'form', label: t('bestiary.editor.form') },
              { value: 'preview', label: t('bestiary.editor.preview') },
            ]}
          />
        )}
        <div className={wide ? 'bst-editor-grid' : undefined}>
          <div hidden={!wide && view !== 'form'}>{form}</div>
          {(wide || view === 'preview') && preview}
        </div>
        <div className="bst-editor-footer">
          {estimate && (
            <p className="bst-balance" role="status">
              <Scale size={18} aria-hidden="true" />
              <span>
                {t(
                  estimate.low === estimate.high
                    ? 'bestiary.editor.balanceOne'
                    : 'bestiary.editor.balance',
                  {
                    low: estimate.low,
                    high: estimate.high,
                    chosen: draft.cr,
                  },
                )}
              </span>
            </p>
          )}
          <Group gap="sm" justify="flex-end" className="bst-dialog-actions">
            <Button variant="subtle" onClick={requestClose}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending} loading={pending}>
              {t('bestiary.editor.save')}
            </Button>
          </Group>
        </div>
      </form>
      <Modal
        opened={confirming}
        onClose={() => setConfirming(false)}
        zIndex={430}
        title={t('glossary.hb.discardTitle')}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <Text>{t('bestiary.editor.discardBody')}</Text>
        <Group justify="flex-end" mt="md" className="bst-dialog-actions">
          <Button variant="subtle" data-autofocus onClick={() => setConfirming(false)}>
            {t('glossary.hb.keepEditing')}
          </Button>
          <Button color="red" variant="light" onClick={onClose}>
            {t('glossary.hb.discard')}
          </Button>
        </Group>
      </Modal>
    </Modal>
  )
}

function EntryList({
  kind,
  entries,
  traits,
  legendary,
  setLegendary,
  onChange,
}: {
  kind: SectionKind
  entries: DraftEntry[]
  traits: LibraryTrait[]
  legendary: number
  setLegendary: (value: number) => void
  onChange: (entries: DraftEntry[]) => void
}) {
  const { t } = useTranslation()
  const headingId = `editor-section-${kind}`
  const move = (index: number, by: number) => {
    const next = [...entries]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item!)
    onChange(next)
    requestAnimationFrame(() =>
      document.getElementById(`entry-name-${item!.uid}`)?.focus({ preventScroll: false }),
    )
  }
  const add = (entry: Partial<DraftEntry> = {}) => {
    const uid = draftUid()
    onChange([...entries, { uid, key: '', name: '', usage: 'none', text: '', ...entry }])
    requestAnimationFrame(() => document.getElementById(`entry-name-${uid}`)?.focus())
  }
  return (
    <section aria-labelledby={headingId} className="bst-entry-section">
      <Group justify="space-between" align="center" gap="xs">
        <Text component="h3" id={headingId} fw={700} className="bst-entry-heading" tabIndex={-1}>
          {t(`bestiary.section.${kind}`)} <span className="bst-count">({entries.length})</span>
        </Text>
        <Group gap="xs" className="bst-entry-tools">
          {traits.length > 0 && (
            <Select
              aria-label={t('bestiary.editor.library')}
              placeholder={t('bestiary.editor.library')}
              leftSection={<BookMarked size={16} aria-hidden="true" />}
              searchable
              value={null}
              comboboxProps={{ zIndex: 410, width: 320, position: 'bottom-end' }}
              nothingFoundMessage={t('bestiary.noMatch')}
              data={traits.map((tr) => ({ value: tr.key, label: tr.name }))}
              onChange={(key) => {
                const trait = traits.find((tr) => tr.key === key)
                if (trait) add({ name: trait.name, key: trait.key, text: trait.text.join('\n\n') })
              }}
            />
          )}
          <Button
            variant="light"
            leftSection={<Plus size={16} aria-hidden="true" />}
            onClick={() => add()}
          >
            {t('bestiary.editor.addEntry')}
          </Button>
        </Group>
      </Group>
      {kind === 'legendaryActions' && entries.length > 0 && (
        <NumberInput
          hideControls
          mt="xs"
          maw={260}
          label={t('bestiary.editor.legendaryUses')}
          min={1}
          max={9}
          allowDecimal={false}
          value={legendary || 3}
          onChange={(v) => typeof v === 'number' && setLegendary(v)}
        />
      )}
      {entries.length === 0 ? (
        <Text size="sm" c="dimmed" mt={4}>
          {t('bestiary.editor.noEntries')}
        </Text>
      ) : (
        <ol className="bst-entries">
          {entries.map((entry, index) => {
            const patch = (p: Partial<DraftEntry>) =>
              onChange(entries.map((e) => (e.uid === entry.uid ? { ...e, ...p } : e)))
            const label = entry.name.trim() || t('bestiary.editor.untitled')
            return (
              <li key={entry.uid} className="bst-entry-card">
                <div className="bst-grid">
                  <TextInput
                    id={`entry-name-${entry.uid}`}
                    label={t('bestiary.editor.entryName')}
                    value={entry.name}
                    maxLength={120}
                    onChange={(e) => patch({ name: e.currentTarget.value })}
                  />
                  <Select
                    label={t('bestiary.editor.usage')}
                    value={entry.usage}
                    allowDeselect={false}
                    comboboxProps={{ zIndex: 410 }}
                    onChange={(v) => v && patch({ usage: v as UsageChoice })}
                    data={usageChoices.map((u) => ({ value: u, label: t(`bestiary.usage.${u}`) }))}
                  />
                </div>
                <Textarea
                  mt="xs"
                  autosize
                  minRows={2}
                  label={t('bestiary.editor.entryText')}
                  description={index === 0 ? t('bestiary.editor.entryTextHelp') : undefined}
                  placeholder={t(
                    kind === 'actions'
                      ? 'bestiary.editor.attackPlaceholder'
                      : 'bestiary.editor.textPlaceholder',
                  )}
                  maxLength={4000}
                  value={entry.text}
                  onChange={(e) => patch({ text: e.currentTarget.value })}
                />
                <Group gap={4} justify="flex-end" mt={4}>
                  <Tooltip label={t('bestiary.editor.moveUp', { name: label })}>
                    <ActionIcon
                      variant="subtle"
                      size={44}
                      disabled={index === 0}
                      aria-label={t('bestiary.editor.moveUp', { name: label })}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={18} aria-hidden="true" />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t('bestiary.editor.moveDown', { name: label })}>
                    <ActionIcon
                      variant="subtle"
                      size={44}
                      disabled={index === entries.length - 1}
                      aria-label={t('bestiary.editor.moveDown', { name: label })}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={18} aria-hidden="true" />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t('bestiary.editor.removeEntry', { name: label })}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size={44}
                      aria-label={t('bestiary.editor.removeEntry', { name: label })}
                      onClick={() => {
                        onChange(entries.filter((e) => e.uid !== entry.uid))
                        requestAnimationFrame(() => document.getElementById(headingId)?.focus())
                      }}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
