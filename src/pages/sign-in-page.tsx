import { useState } from 'react'
import { Alert, Button, Text } from '@mantine/core'
import { Backpack, Map as MapIcon, Store, Swords, UserPlus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AccountDeletedNotice, useAccountNotice, useAuth } from '@/features/auth'
import { ArtPlate } from '@/shared/ui/art'
import { artUrl } from '@/shared/ui/art-url'
import { LegalLinks } from './legal-page'
import './sign-in-page.css'

/** Google's multicolour "G" mark (brand colours), drawn inline so it needs no request. */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

const forDm = [
  ['auth.dm1', UserPlus],
  ['auth.dm2', Store],
  ['auth.dm3', MapIcon],
] as const
const forPlayers = [
  ['auth.pl1', Users],
  ['auth.pl2', Backpack],
  ['auth.pl3', Swords],
] as const

/** RYT-112: the landing for visitors who are not signed in. */
export function SignInPage() {
  const { t } = useTranslation()
  const { state, controller } = useAuth()
  const deletedNotice = useAccountNotice()
  const [busy, setBusy] = useState(false)
  const signIn = async () => {
    setBusy(true)
    await controller?.signIn()
    setBusy(false)
  }
  return (
    <div className="landing">
      <section className="landing-hero">
        <picture className="landing-art" aria-hidden="true">
          <source media="(min-width: 48em)" srcSet={artUrl('brand/hero-wide')} />
          <img
            src={artUrl('brand/hero-tall')}
            alt=""
            decoding="async"
            fetchPriority="high"
            draggable={false}
          />
        </picture>
        <div className="landing-copy">
          <ArtPlate name="brand/emblem" size={56} round className="landing-emblem" />
          <h1>{t('auth.title')}</h1>
          <p className="landing-lede">{t('auth.intro')}</p>
          <AccountDeletedNotice />
          {state.issue && !deletedNotice && (
            <Alert color="red" role="alert" title={t('auth.problem')} className="landing-alert">
              <Text>{t(`auth.issue.${state.issue}`)}</Text>
              {state.issue === 'sign-out' && (
                <Button mt="sm" variant="light" onClick={() => void controller?.signOut()}>
                  {t('auth.signOut')}
                </Button>
              )}
            </Alert>
          )}
          <Button
            className="sign-in-google"
            size="md"
            leftSection={<GoogleMark />}
            onClick={() => void signIn()}
            loading={busy}
          >
            {t('auth.google')}
          </Button>
          {state.issue === 'connection' && (
            <Button
              className="landing-retry"
              variant="default"
              onClick={() => void controller?.retry()}
            >
              {t('common.retry')}
            </Button>
          )}
          <p className="landing-note">{t('auth.open')}</p>
        </div>
      </section>
      <div className="landing-uses">
        {(
          [
            ['auth.forDm', forDm],
            ['auth.forPlayers', forPlayers],
          ] as const
        ).map(([heading, items]) => (
          <section key={heading} className="landing-use">
            <h2>{t(heading)}</h2>
            <ul>
              {items.map(([key, Icon]) => (
                <li key={key}>
                  <Icon size={20} aria-hidden="true" />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <LegalLinks />
    </div>
  )
}
