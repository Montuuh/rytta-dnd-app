import { useId, type ReactNode } from 'react'
import { Check, PenTool } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { classes, classKeys, type Ability, type ClassKey } from '../../domain/srd'
import { classEmblem } from '../class-emblem'
import './class-picker.css'

/**
 * RYT-112: the class chooser of both creation paths. One native radio per painted emblem card
 * (arrow keys move the choice, Tab leaves the group). The chosen card is marked by a check and a
 * heavier frame as well as by colour. `withCustom` adds the homebrew class of the full wizard.
 */
export function ClassPicker({
  value,
  onChange,
  label,
  description,
  withCustom = false,
  showSaves = false,
  hideLabel = false,
}: {
  value: string
  onChange: (key: ClassKey | 'custom') => void
  label: string
  description?: string
  withCustom?: boolean
  /** The full wizard also lists the two saving throws the class is proficient in. */
  showSaves?: boolean
  /** The step's own heading already names the choice. */
  hideLabel?: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
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
        {classKeys.map((key) => {
          const emblem = classEmblem(key)
          const entry = classes[key]
          return (
            <Card
              key={key}
              name={`${id}-class`}
              checked={value === key}
              onSelect={() => onChange(key)}
              title={t(`srd.class.${key}`)}
              role={t(`wizard.classRole.${key}`)}
              meta={
                showSaves
                  ? t('wizard.classCard', { die: entry.hitDie, saves: saves(entry.saves) })
                  : t('creation.hitDie', { die: entry.hitDie })
              }
              art={
                <img
                  src={emblem?.thumb}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  width={72}
                  height={72}
                />
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
