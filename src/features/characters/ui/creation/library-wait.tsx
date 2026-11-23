import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Alert, Button, Loader, Group, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useGlossary } from '@/features/glossary'

/**
 * RYT-164 (P4 A): a new character takes its class features from the campaign's packs, so creating
 * one waits for the library. While it loads this says so; when it cannot be reached it offers a
 * retry. Nothing is shown once the library is there.
 */
export const LibraryWait = forwardRef<
  HTMLDivElement,
  {
    ready: boolean
    /** Where focus goes when a retry brings the library back (the button that finishes). */
    onReady?: () => void
    /** What is waiting for the library: finishing the character, or its class (RYT-167). */
    subject?: 'finish' | 'classes'
  }
>(function LibraryWait({ ready, onReady, subject = 'finish' }, ref) {
  const { t } = useTranslation()
  const glossary = useGlossary()
  const box = useRef<HTMLDivElement>(null)
  const retried = useRef(false)
  useImperativeHandle(ref, () => box.current!, [])
  useEffect(() => {
    if (!ready || !retried.current) return
    retried.current = false
    onReady?.()
  }, [ready, onReady])
  if (ready) return null
  const failed = Boolean(glossary?.indexError)
  return (
    <Alert
      ref={box}
      tabIndex={-1}
      color={failed ? 'red' : undefined}
      role={failed ? 'alert' : 'status'}
      className="library-wait"
    >
      {failed ? (
        <Stack gap="xs" align="flex-start">
          <Text size="sm">
            {t(subject === 'classes' ? 'creation.classes.error' : 'creation.library.error')}
          </Text>
          <Button
            variant="light"
            onClick={() => {
              // The button leaves while the rules reload: focus stays on the notice meanwhile.
              retried.current = true
              box.current?.focus()
              glossary?.retry()
            }}
          >
            {t('common.retry')}
          </Button>
        </Stack>
      ) : (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm">
            {t(subject === 'classes' ? 'creation.classes.loading' : 'creation.library.loading')}
          </Text>
        </Group>
      )}
    </Alert>
  )
})
