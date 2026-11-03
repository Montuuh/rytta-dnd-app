import {
  Badge,
  Button,
  Text,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import {
  ArrowLeft,
  Axe,
  BowArrow,
  Check,
  Compass,
  Eye,
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
import { useLocation, useNavigate } from 'react-router'
import { config } from '@/shared/lib/config'
import './settings-page.css'
import {
  classThemeIds,
  classThemes,
  setClassTheme,
  useClassTheme,
  type ClassThemeId,
  type ColorSchemeName,
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
}

/** One settings group: heading and help on the side (wide screens), controls beside them. */
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
        <Title order={2} id={`${id}-title`} className="settings-section-title">
          {title}
        </Title>
        {help && (
          <Text id={`${id}-help`} className="settings-section-help">
            {help}
          </Text>
        )}
      </div>
      <div className="settings-section-body">
        {children({ labelledBy: `${id}-title`, describedBy: help ? `${id}-help` : undefined })}
      </div>
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

/** Paints a theme's tokens into custom properties for decorative previews. */
function previewStyle(id: ClassThemeId, scheme: ColorSchemeName): CSSProperties {
  const tokens = classThemes[id][scheme]
  return {
    '--pv-bg': tokens.bg,
    '--pv-surface': tokens.surface,
    '--pv-raised': tokens.raised,
    '--pv-border': tokens.border,
    '--pv-text': tokens.text,
    '--pv-muted': tokens.muted,
    '--pv-accent': tokens.accent,
    '--pv-secondary': tokens.accentSecondary,
  } as CSSProperties
}

function SchemePicker({ labelledBy, describedBy }: { labelledBy: string; describedBy?: string }) {
  const { t } = useTranslation()
  const scheme = useComputedColorScheme('dark')
  const { setColorScheme } = useMantineColorScheme()
  const classTheme = useClassTheme()
  const options = [
    { value: 'dark', icon: Moon, label: t('preferences.dark'), hint: t('settings.darkHint') },
    { value: 'light', icon: Sun, label: t('preferences.light'), hint: t('settings.lightHint') },
  ] as const
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="scheme-picker"
    >
      {options.map(({ value, icon: Icon, label, hint }) => (
        <ChoiceCard
          key={value}
          name="color-scheme"
          value={value}
          checked={scheme === value}
          onSelect={() => setColorScheme(value)}
          label={label}
          hint={hint}
          className="scheme-card"
          style={previewStyle(classTheme, value)}
        >
          <span className="scheme-preview" aria-hidden="true">
            <span className="scheme-preview-bar">
              <Icon size={14} />
            </span>
            <span className="scheme-preview-card">
              <span className="scheme-preview-line is-strong" />
              <span className="scheme-preview-line" />
              <span className="scheme-preview-button" />
            </span>
          </span>
        </ChoiceCard>
      ))}
    </div>
  )
}

function ThemeGallery({ labelledBy, describedBy }: { labelledBy: string; describedBy?: string }) {
  const { t } = useTranslation()
  const scheme = useComputedColorScheme('dark')
  const current = useClassTheme()
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="theme-gallery"
    >
      {classThemeIds.map((id) => {
        const Glyph = glyphs[id]
        return (
          <ChoiceCard
            key={id}
            name="class-theme"
            value={id}
            checked={current === id}
            onSelect={() => setClassTheme(id)}
            label={t(`theme.${id}`)}
            hint={t(`theme.${id}.tagline`)}
            className="theme-card"
            style={previewStyle(id, scheme)}
          >
            <span className="theme-medallion" aria-hidden="true">
              <Glyph size={22} strokeWidth={1.8} />
            </span>
          </ChoiceCard>
        )
      })}
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

export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // Settings is reached from the profile menu; offer the way back to where the user was.
  const cameFromApp = useLocation().key !== 'default'
  const demo = config.VITE_DATA_MODE === 'demo'
  return (
    <div className="settings-page">
      {cameFromApp && (
        <Button
          variant="subtle"
          w="fit-content"
          className="settings-back"
          leftSection={<ArrowLeft size={18} aria-hidden="true" />}
          onClick={() => void navigate(-1)}
        >
          {t('common.back')}
        </Button>
      )}
      <header className="settings-head">
        <Title order={1}>{t('nav.settings')}</Title>
        <Text className="settings-intro">{t('settings.intro')}</Text>
      </header>
      <Section title={t('preferences.theme')} help={t('settings.appearanceHelp')}>
        {(ids) => <SchemePicker {...ids} />}
      </Section>
      <Section title={t('settings.classTheme')} help={t('settings.classThemeHelp')}>
        {(ids) => <ThemeGallery {...ids} />}
      </Section>
      <Section title={t('preferences.language')} help={t('settings.languageHelp')}>
        {(ids) => <LanguagePicker {...ids} />}
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
