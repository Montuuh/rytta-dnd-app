import { useId, type ReactNode } from 'react'
import { BookMarked, Check, PenTool } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ClassDef } from '../../domain/class-catalog'
import type { Ability } from '../../domain/srd'
import { useClassDefName } from '../class-catalog'
import { useClassEmblemOf } from '../class-emblem'
import './class-picker.css'

/**
 * RYT-112: the class chooser of both creation paths. One native radio per painted emblem card
 * (arrow keys move the choice, Tab leaves the group). The chosen card is marked by a check and a
 * heavier frame as well as by colour. `withCustom` adds the homebrew class of the full wizard.
 * RYT-168: the classes come from the campaign's packs; a pack class names its pack.
 */
export function ClassPicker({
  options,
  value,
  onChange,
  label,
  description,
  withCustom = false,
  showSaves = false,
  hideLabel = false,
}: {
  /** The classes the campaign offers. */
  options: readonly ClassDef[]
  value: string
  onChange: (key: string) => void
  label: string
  description?: string
  withCustom?: boolean
  /** The full wizard also lists the two saving throws the class is proficient in. */
  showSaves?: boolean
  /** The step's own heading already names the choice. */
  hideLabel?: boolean
}) {
  const classEmblem = useClassEmblemOf()
  const { t, i18n } = useTranslation()
  const id = useId()
  const nameOf = useClassDefName()
  const saves = (list: readonly Ability[]) =>
    list.map((key) => t(`srd.abilityShort.${key}`)).join(', ')
  return (
    <div className="class-picker">
      <p id={`${id}-label`} className={hideLabel ? 'visually-hidden' : 'class-picker-label'}>
        {label}
      </p>
      {description && !hideLabel && (
        <p id={`${id}-hint`} className="class-picker-hint">
          {description}
        </p>
      )}
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={description && !hideLabel ? `${id}-hint` : undefined}
        className="class-picker-grid"
      >
        {options.map((entry) => {
          const key = entry.key
          const emblem = classEmblem(key)
          const pack = entry.pack
            ? i18n.language.startsWith('en')
              ? entry.pack.title_en || entry.pack.title_es
              : entry.pack.title_es || entry.pack.title_en
            : ''
          return (
            <Card
              key={key}
              name={`${id}-class`}
              checked={value === key}
              onSelect={() => onChange(key)}
              title={nameOf(entry)}
              role={entry.srd ? t(`wizard.classRole.${key}` as 'wizard.classRole.wizard') : pack}
              meta={
                showSaves
                  ? t('wizard.classCard', { die: entry.hitDie, saves: saves(entry.saves) })
                  : t('creation.hitDie', { die: entry.hitDie })
              }
              art={
                emblem ? (
                  <img
                    src={emblem.thumb}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    width={72}
                    height={72}
                  />
                ) : (
                  <BookMarked size={28} aria-hidden="true" />
                )
              }
            />
          )
        })}
        {withCustom && (
          <Card
            name={`${id}-class`}
            checked={value === 'custom'}
            onSelect={() => onChange('custom')}
            title={t('srd.custom')}
            role={t('wizard.classRole.custom')}
            art={<PenTool size={28} aria-hidden="true" />}
          />
        )}
      </div>
    </div>
  )
}

function Card({
  name,
  checked,
  onSelect,
  title,
  role,
  meta,
  art,
}: {
  name: string
  checked: boolean
  onSelect: () => void
  title: string
  role: string
  meta?: string
  art: ReactNode
}) {
  return (
    <label className="class-pick" data-checked={checked || undefined}>
      <input
        type="radio"
        name={name}
        className="class-pick-input"
        checked={checked}
        onChange={onSelect}
      />
      <span className="class-pick-art">{art}</span>
      <span className="class-pick-name">{title}</span>
      <span className="class-pick-role">{role}</span>
      {meta && <span className="class-pick-meta">{meta}</span>}
      <span className="class-pick-check" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
    </label>
  )
}
