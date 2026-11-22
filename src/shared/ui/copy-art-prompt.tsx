import { useEffect, useId, useRef, useState } from 'react'
import { Button, Textarea } from '@mantine/core'
import { Check, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { artPrompt, copyArtPrompt, type ArtSubject } from '@/shared/lib/art-prompt'
import './copy-art-prompt.css'

/**
 * RYT-154: "Copy art prompt" beside an image picker. A short confirmation says where to paste it;
 * when the clipboard is refused, the prompt appears selected so it can be copied by hand.
 */
export function CopyArtPrompt({ subject }: { subject: ArtSubject }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const manual = useRef<HTMLTextAreaElement>(null)
  const statusId = useId()
  useEffect(() => {
    if (state !== 'copied') return
    const timer = window.setTimeout(() => setState('idle'), 4000)
    return () => window.clearTimeout(timer)
  }, [state])
  useEffect(() => {
    if (state === 'failed') manual.current?.select()
  }, [state])
  return (
    <div className="art-prompt">
      <Button
        variant="subtle"
        className="art-prompt-button"
        leftSection={
          state === 'copied' ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <Sparkles size={18} aria-hidden="true" />
          )
        }
        aria-describedby={statusId}
        onClick={async () => setState((await copyArtPrompt(subject)) ? 'copied' : 'failed')}
      >
        {t('art.prompt.copy')}
      </Button>
      <span id={statusId} className="art-prompt-status" aria-live="polite">
        {state === 'copied' ? t('art.prompt.copied') : ''}
      </span>
      {state === 'failed' && (
        <Textarea
          ref={manual}
          className="art-prompt-manual"
          label={t('art.prompt.manual')}
          value={artPrompt(subject)}
          readOnly
          autosize
          minRows={3}
          maxRows={8}
        />
      )}
    </div>
  )
}
