import { useState } from 'react'
import { ActionIcon, Button } from '@mantine/core'
import { Moon, Sunset, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { tally } from '../domain/rest'
import { useRestPanel } from './rest-context'
import './rest.css'

const storageKey = 'rytta-rest-dismissed'
const readDismissed = () => {
  try {
    return window.sessionStorage.getItem(storageKey)
  } catch {
    return null
  }
}

/**
 * RYT-080 "aviso fijo arriba": while a rest request is open, every screen of the campaign shows
 * who asked and how many said yes, with Vote. A settled request stays until dismissed.
 */
export function RestBanner() {
  const { t } = useTranslation()
  const { state, openPanel } = useRestPanel()
  const [dismissed, setDismissed] = useState(readDismissed)
  if (!state) return null
  const key = `${state.id}:${state.status}`
  const open = state.status === 'open'
  if (!open && dismissed === key) return null
  const count = tally(state)
  const kind = t(state.kind === 'short' ? 'rest.short' : 'rest.long')
  const Icon = state.kind === 'short' ? Sunset : Moon
  const needsVote = state.participants.some(
    (person) => person.controlled && person.vote === null && person.can_rest !== false,
  )
  const dismiss = () => {
    setDismissed(key)
    try {
      window.sessionStorage.setItem(storageKey, key)
    } catch {
      // The notice simply comes back on the next visit.
    }
    window.requestAnimationFrame(() => document.getElementById('main-content')?.focus())
  }
  return (
    <section className="rest-banner" data-status={state.status} aria-label={t('rest.panelTitle')}>
      <Icon className="rest-banner-icon" size={20} aria-hidden="true" />
      <p className="rest-banner-text" role="status" aria-atomic="true">
        <strong>
          {open
            ? state.requester_name
              ? t('rest.banner.open', { kind, name: state.requester_name })
              : t('rest.banner.openDm', { kind })
            : t(
                state.status === 'done'
                  ? 'rest.done.title'
                  : state.status === 'rejected'
                    ? 'rest.rejected.title'
                    : state.status === 'expired'
                      ? 'rest.expired.title'
                      : 'rest.cancelled.title',
              )}
        </strong>
        {open && <span>{t('rest.banner.tally', { yes: count.yes, total: count.total })}</span>}
      </p>
      <Button
        className="rest-banner-action"
        variant={open && needsVote ? 'filled' : 'default'}
        aria-haspopup="dialog"
        onClick={(event) => openPanel(event.currentTarget)}
      >
        {open && needsVote ? t('rest.banner.vote') : t('rest.banner.view')}
      </Button>
      {!open && (
        <ActionIcon
          variant="subtle"
          size={44}
          aria-label={t('rest.banner.dismiss')}
          onClick={dismiss}
        >
          <X size={18} aria-hidden="true" />
        </ActionIcon>
      )}
    </section>
  )
}
