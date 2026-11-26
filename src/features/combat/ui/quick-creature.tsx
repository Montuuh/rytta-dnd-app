import { useState } from 'react'
import { Button, Group, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { Modal } from '@/shared/ui/overlays'
import { Crown, Heart, Shield, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePhone } from '@/shared/ui/use-viewport'
import type { CombatantTemplate, TemplateInput } from '../domain/combat'
import { NumberDial, SideToggle } from './bestiary-widgets'
import { CreatureChanges } from './creature-changes'

/** Quick creature: the numbers combat needs, nothing more (the RYT-036 dialog). */
export function QuickDialog({
  template,
  variantOf,
  pending,
  close,
  save,
}: {
  template: CombatantTemplate | null
  variantOf?: CombatantTemplate
  pending: boolean
  close: () => void
  save: (data: TemplateInput) => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const source = template ?? variantOf
  const startName = variantOf
    ? t('bestiary.variantName', { name: variantOf.name }).slice(0, 80)
    : (template?.name ?? '')
  const [name, setName] = useState(startName)
  const [side, setSide] = useState<'enemy' | 'ally'>(source?.side ?? 'enemy')
  const [maxHp, setMaxHp] = useState<number | string>(source?.max_hp ?? 7)
  const [ac, setAc] = useState<number | string>(source?.armor_class ?? 12)
  const [bonus, setBonus] = useState<number | string>(source?.initiative_bonus ?? 0)
  const [legendary, setLegendary] = useState<number | string>(source?.legendary_max ?? 0)
  const [notes, setNotes] = useState(source?.notes ?? '')
  // Closing with typed content asks first (Escape, Back, the close button or Cancel).
  const [confirming, setConfirming] = useState(false)
  const dirty =
    name !== startName ||
    side !== (source?.side ?? 'enemy') ||
    maxHp !== (source?.max_hp ?? 7) ||
    ac !== (source?.armor_class ?? 12) ||
    bonus !== (source?.initiative_bonus ?? 0) ||
    legendary !== (source?.legendary_max ?? 0) ||
    notes !== (source?.notes ?? '')
  // Opened after the closing key event, so the same Escape does not also dismiss the question.
  const requestClose = () => (dirty ? window.setTimeout(() => setConfirming(true), 0) : close())
  const valid =
    name.trim().length > 0 && [maxHp, ac, bonus, legendary].every((n) => typeof n === 'number')
  return (
    <Modal
      opened
      onClose={requestClose}
      closeOnEscape={!confirming}
      fullScreen={phone}
      zIndex={400}
      title={
        variantOf
          ? t('bestiary.editor.variantTitle', { name: variantOf.name })
          : template
            ? t('combat.bestiary.edit', { name: template.name })
            : t('bestiary.quick.title')
      }
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || pending) return
          save({
            name: name.trim(),
            side,
            max_hp: maxHp as number,
            armor_class: ac as number,
            initiative_bonus: bonus as number,
            legendary_max: legendary as number,
            notes,
            ...(variantOf && {
              srd_id: variantOf.srd_id,
              hp_formula: variantOf.hp_formula,
              challenge: variantOf.challenge,
              creature_type: variantOf.creature_type,
            }),
          })
        }}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t(variantOf ? 'bestiary.scope.variant' : 'bestiary.scope.template')}
          </Text>
          <TextInput
            data-autofocus
            required
            label={t('combat.add.name')}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <SideToggle legend={t('combat.add.side')} name={name} value={side} onChange={setSide} />
          <div className="combat-grid-2">
            <NumberDial
              label={t('combat.add.maxHp')}
              icon={Heart}
              min={1}
              max={99999}
              value={maxHp}
              onChange={setMaxHp}
            />
            <NumberDial
              label={t('combat.add.ac')}
              icon={Shield}
              min={0}
              max={99}
              value={ac}
              onChange={setAc}
            />
            <NumberDial
              label={t('combat.add.bonus')}
              icon={Zap}
              min={-20}
              max={30}
              value={bonus}
              onChange={setBonus}
            />
            <NumberDial
              label={t('combat.add.legendary')}
              icon={Crown}
              min={0}
              max={9}
              value={legendary}
              onChange={setLegendary}
            />
          </div>
          <Textarea
            label={t('combat.bestiary.notes')}
            value={notes}
            maxLength={2000}
            autosize
            minRows={3}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
          {source && valid && (
            <CreatureChanges
              reference={source.name}
              changes={[
                { field: t('combat.add.name'), before: source.name, after: name.trim() },
                { field: t('bestiary.hp'), before: source.max_hp, after: maxHp },
                { field: t('bestiary.ac'), before: source.armor_class, after: ac },
                { field: t('bestiary.initiative'), before: source.initiative_bonus, after: bonus },
                {
                  field: t('combat.add.legendary'),
                  before: source.legendary_max,
                  after: legendary,
                },
                {
                  field: t('combat.add.side'),
                  before: t(`combat.side.${source.side}`),
                  after: t(`combat.side.${side}`),
                },
              ]}
              sections={source.notes === notes ? [] : [t('combat.bestiary.notes')]}
              collapsible
            />
          )}
          <Group justify="flex-end" className="bst-dialog-actions">
            <Button variant="subtle" onClick={requestClose}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending} loading={pending}>
              {t('combat.bestiary.save')}
            </Button>
          </Group>
        </Stack>
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
          <Button color="red" variant="light" onClick={close}>
            {t('glossary.hb.discard')}
          </Button>
        </Group>
      </Modal>
    </Modal>
  )
}
