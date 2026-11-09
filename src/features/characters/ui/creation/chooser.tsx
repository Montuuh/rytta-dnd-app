import { useEffect, useId, useRef, useState } from 'react'
import { Button, Drawer, Modal, Stack, Title } from '@mantine/core'
import { FileText, ListChecks, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '../sheet/panel.css'
import { useNavigate } from 'react-router'
import { usePhone } from '@/shared/ui/use-viewport'

import { creationModes, type CreationMode } from './modes'

const icons = { quick: Zap, full: ListChecks, blank: FileText } as const

/** RYT-072 three doors: native radios painted as cards, each with what it asks and how long. */
export function CreationDoors({
  value,
  onChange,
}: {
  value: CreationMode
  onChange: (mode: CreationMode) => void
}) {
  const { t } = useTranslation()
  const name = useId()
  return (
    <div role="radiogroup" aria-label={t('creation.doorsLabel')} className="creation-doors">
      {creationModes.map((mode) => {
        const Icon = icons[mode]
        const id = `${name}-${mode}`
        return (
          <label
            key={mode}
            htmlFor={id}
            className="creation-door"
            data-checked={value === mode || undefined}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
              className="creation-door-input"
              aria-describedby={`${id}-hint`}
            />
            <span className="creation-door-glyph" aria-hidden="true">
              <Icon size={22} />
            </span>
            <span className="creation-door-text">
              <span className="creation-door-title">
                {t(`creation.door.${mode}`)}
                {mode === 'quick' && (
                  <span className="creation-door-tag">{t('creation.recommended')}</span>
                )}
              </span>
              <span id={`${id}-hint`} className="creation-door-hint">
                {t(`creation.doorHint.${mode}`)}
              </span>
              <span className="creation-door-time">{t(`creation.doorTime.${mode}`)}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

/** Opened from "Create sheet": the doors over the current screen (bottom sheet on phones). */
export function CreationChooser({
  opened,
  onClose,
  name,
  characterPath,
}: {
  opened: boolean
  onClose: () => void
  name: string
  characterPath: string
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const navigate = useNavigate()
  const [mode, setMode] = useState<CreationMode>('quick')
  const title = <span className="block-sheet-title user-copy">{t('creation.title', { name })}</span>
  const body = (
    <Stack gap="md">
      <CreationDoors value={mode} onChange={setMode} />
      <Button size="md" onClick={() => void navigate(`${characterPath}/create?mode=${mode}`)}>
        {t('creation.start')}
      </Button>
    </Stack>
  )
  const close = { 'aria-label': t('panel.close'), size: 44 } as const
  return phone ? (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="auto"
      title={title}
      closeButtonProps={close}
    >
      {body}
    </Drawer>
  ) : (
    <Modal opened={opened} onClose={onClose} title={title} size="lg" closeButtonProps={close}>
      {body}
    </Modal>
  )
}

/** The same choice as a page, for direct links to /create without a mode. */
export function CreationChooserPanel({
  name,
  characterPath,
}: {
  name: string
  characterPath: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<CreationMode>('quick')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <Stack gap="md" className="creation-chooser-page">
      <Title order={1} ref={heading} tabIndex={-1} className="user-copy">
        {t('creation.title', { name })}
      </Title>
      <CreationDoors value={mode} onChange={setMode} />
      <Button
        size="md"
        w="fit-content"
        onClick={() => void navigate(`${characterPath}/create?mode=${mode}`, { replace: true })}
      >
        {t('creation.start')}
      </Button>
    </Stack>
  )
}
