import { Badge, Text, Title } from '@mantine/core'
import {
  Axe,
  BowArrow,
  Check,
  Compass,
  Eye,
  Feather,
  Flame,
  HandFist,
  HandHeart,
  Leaf,
  Moon,
  Music,
  ShieldHalf,
  Sun,
  Swords,
  VenetianMask,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { config } from '@/shared/lib/config'
import './settings-panel.css'
import {
  classThemes,
  setClassTheme,
  themesOfScheme,
  useClassTheme,
  type ClassThemeId,
} from '@/shared/theme'

const glyphs: Record<ClassThemeId, LucideIcon> = {
  default: Compass,
  barbarian: Axe,
  bard: Music,
  cleric: HandHeart,
  druid: Leaf,
  fighter: Swords,
  monk: HandFist,
  paladin: ShieldHalf,
  ranger: BowArrow,
  rogue: VenetianMask,
  sorcerer: Flame,
  warlock: Eye,
  wizard: WandSparkles,
  parchment: Feather,
}

/** One settings group: a heading with one line of help, then its controls. */
function Section({
  title,
  help,
  children,
}: {
  title: string
  help?: string
  children: (ids: { labelledBy: string; describedBy?: string }) => ReactNode
}) {
  const id = useId()
  return (
    <section className="settings-section" aria-labelledby={`${id}-title`}>
      <div className="settings-section-head">
        <Title order={3} id={`${id}-title`} className="settings-section-title">
          {title}
        </Title>
        {help && (
          <Text id={`${id}-help`} className="settings-section-help">
            {help}
          </Text>
        )}
      </div>
      {children({ labelledBy: `${id}-title`, describedBy: help ? `${id}-help` : undefined })}
    </section>
  )
}

/** A native radio wrapped in a card: arrow keys, Tab and screen readers work as usual. */
function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  label,
  hint,
  lang,
  className,
  style,
  children,
}: {
  name: string
  value: string
  checked: boolean
  onSelect: () => void
  label: string
  hint?: string
  lang?: string
  className: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const id = useId()
  return (
    <label className={`choice-card ${className}`} data-checked={checked || undefined} style={style}>
      <input
        type="radio"
        className="choice-input"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {children}
      <span className="choice-copy">
        <span id={`${id}-label`} className="choice-label" lang={lang}>
          {label}
        </span>
        {hint && (
          <span id={`${id}-hint`} className="choice-hint">
            {hint}
          </span>
        )}
      </span>
      <span className="choice-check" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
    </label>
  )
}

/** Paints a theme's own tokens into custom properties, so each tile previews its real look. */
function previewStyle(id: ClassThemeId): CSSProperties {
  const tokens = classThemes[id].tokens
  return {
    '--pv-bg': tokens.bg,
    '--pv-surface': tokens.surface,
    '--pv-border': tokens.border,
    '--pv-text': tokens.text,
    '--pv-muted': tokens.muted,
    '--pv-accent': tokens.accent,
    '--pv-secondary': tokens.accentSecondary,
    '--pv-on-accent': tokens.onAccent,
  } as CSSProperties
}

const schemeGroups = [
  { scheme: 'dark', icon: Moon, title: 'settings.darkThemes', hint: 'settings.darkHint' },
  { scheme: 'light', icon: Sun, title: 'settings.lightThemes', hint: 'settings.lightHint' },
] as const

/**
 * RYT-069: one radio group for the whole look. Each theme owns its scheme, so a dark and a light
 * subgroup replace the old appearance switch. Each tile is a small swatch of its theme: the
 * theme's background, its accent on a seal with the class glyph and its text color.
 */
function ThemePicker({ labelledBy, describedBy }: { labelledBy: string; describedBy?: string }) {
  const { t } = useTranslation()
  const current = useClassTheme()
  const id = useId()
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="theme-picker"
    >
      {schemeGroups.map(({ scheme, icon: Icon, title, hint }) => (
        <div
          key={scheme}
          role="group"
          aria-labelledby={`${id}-${scheme}`}
          aria-describedby={`${id}-${scheme}-hint`}
          className="theme-group"
        >
          <div className="theme-group-head">
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" className="theme-group-icon" />
            <Title order={4} id={`${id}-${scheme}`} className="theme-group-title">
              {t(title)}
            </Title>
            <Text component="span" id={`${id}-${scheme}-hint`} className="theme-group-hint">
              {t(hint)}
            </Text>
          </div>
          <div className="theme-gallery">
            {themesOfScheme(scheme).map((themeId) => {
              const Glyph = glyphs[themeId]
              return (
                <ChoiceCard
                  key={themeId}
                  name="theme"
                  value={themeId}
                  checked={current === themeId}
                  onSelect={() => setClassTheme(themeId)}
                  label={t(`theme.${themeId}`)}
                  hint={t(`theme.${themeId}.tagline`)}
                  className="theme-card"
                  style={previewStyle(themeId)}
                >
                  <span className="theme-seal" aria-hidden="true">
                    <Glyph size={20} strokeWidth={1.8} />
                  </span>
                </ChoiceCard>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function LanguagePicker({ labelledBy, describedBy }: { labelledBy: string; describedBy?: string }) {
  const { i18n } = useTranslation()
  const current = i18n.resolvedLanguage === 'en' ? 'en' : 'es'
  const options = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
  ] as const
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="language-picker"
    >
      {options.map(({ value, label }) => (
        <ChoiceCard
          key={value}
          name="language"
          value={value}
          checked={current === value}
          onSelect={() => void i18n.changeLanguage(value)}
          label={label}
          lang={value}
          className="language-card"
        >
          <span className="language-monogram" aria-hidden="true">
            {value.toUpperCase()}
          </span>
        </ChoiceCard>
      ))}
    </div>
  )
}

/**
 * RYT-069: the settings content, shown in the right-hand Settings drawer (app/layout.tsx).
 * Language comes first, then the theme tiles.
 */
export function SettingsPanel() {
  const { t } = useTranslation()
  const demo = config.VITE_DATA_MODE === 'demo'
  return (
    <div className="settings-panel">
      <Section title={t('preferences.language')} help={t('settings.languageHelp')}>
        {(ids) => <LanguagePicker {...ids} />}
      </Section>
      <Section title={t('settings.theme')} help={t('settings.themeHelp')}>
        {(ids) => <ThemePicker {...ids} />}
      </Section>
      <Text className="settings-saved">{t('preferences.saved')}</Text>
      {/* Demo data must stay explicit; a live installation shows no setup internals. */}
      {demo && (
        <Section title={t('settings.about')}>
          {() => (
            <div className="settings-about">
              <Badge variant="light" w="fit-content">
                {t('settings.demo')}
              </Badge>
              <Text>{t('settings.demoDescription')}</Text>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}
