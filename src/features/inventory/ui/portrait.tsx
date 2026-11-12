import { useId, useRef, useState } from 'react'
import { Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { portraitQuery, usePortraitUpload } from '../api'
import { initials } from './initials'
import { PortraitEditor } from './portrait-editor'

export function CharacterPortrait({
  campaignId,
  characterId,
  name,
  path,
  size = 96,
  editable = false,
}: {
  campaignId: string
  characterId: string
  name: string
  path: string | null
  size?: number
  editable?: boolean
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const inputId = useId()
  const url = useQuery(portraitQuery(state.user!.id, path))
  const upload = usePortraitUpload(campaignId, characterId)
  const [file, setFile] = useState<File | null>(null)
  const label = useRef<HTMLLabelElement>(null)
  const close = () => {
    setFile(null)
    requestAnimationFrame(() => label.current?.focus())
  }
  return (
    <div className="portrait" style={{ width: size, height: size }}>
      <div className="portrait-medallion" aria-hidden={!url.data}>
        {url.data ? (
          <img src={url.data} alt={t('inventory.portrait.alt', { name })} />
        ) : (
          <span className="portrait-initials" aria-hidden="true">
            {initials(name)}
          </span>
        )}
      </div>
      {editable && (
        <>
          <input
            id={inputId}
            type="file"
            accept="image/webp,image/png,image/jpeg"
            className="visually-hidden"
            disabled={upload.isPending}
            onChange={(event) => {
              const chosen = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              // RYT-074: the editor always opens to crop or fit the image before upload.
              if (chosen) {
                upload.reset()
                setFile(chosen)
              }
            }}
          />
          <label
            ref={label}
            htmlFor={inputId}
            className="portrait-edit"
            data-pending={upload.isPending || undefined}
          >
            <Camera size={16} aria-hidden="true" />
            <span className="visually-hidden">{t('inventory.portrait.change', { name })}</span>
          </label>
        </>
      )}
      {file && (
        <PortraitEditor
          file={file}
          name={name}
          pending={upload.isPending}
          error={upload.isError}
          onCancel={close}
          onSave={(image) => upload.mutate(image, { onSuccess: close })}
        />
      )}
      {upload.isError && !file && (
        <Text size="xs" role="alert" className="portrait-error">
          {t('inventory.portrait.error')}
        </Text>
      )}
    </div>
  )
}
