export interface Identity {
  id: string
  email: string
  /** RYT-157: the account can sign in with email and password (not only with Google). */
  hasPassword?: boolean
}
export type AuthIssue = 'callback' | 'connection' | 'expired' | 'sign-out'
export interface AuthSnapshot {
  status: 'loading' | 'signed-in' | 'signed-out'
  user: Identity | null
  issue: AuthIssue | null
  /** RYT-157: signed in from a password reset link; the app asks for a new password. */
  recovery?: boolean
}
/** RYT-157: what a password action can report. Never says whether an email has an account. */
export type PasswordIssue =
  'credentials' | 'unconfirmed' | 'weak' | 'same' | 'rate' | 'captcha' | 'reauth' | 'connection'
export class PasswordFailure extends Error {
  readonly issue: PasswordIssue
  constructor(issue: PasswordIssue) {
    super(issue)
    this.issue = issue
  }
}
/** RYT-157: the one password rule, also set in the hosted Auth settings. */
export const passwordMinLength = 10
export const passwordMeetsPolicy = (password: string) => [...password].length >= passwordMinLength
export interface InitialSession {
  user: Identity | null
  recovery: boolean
}
export interface AuthAdapter {
  initialize(): Promise<InitialSession>
  subscribe(listener: (user: Identity | null) => void): () => void
  signIn(): Promise<void>
  signOut(): Promise<void>
  /** RYT-157 email and password. `captcha` is the Turnstile token when one is configured. */
  signInWithPassword(email: string, password: string, captcha?: string): Promise<void>
  /** Resolves when the confirmation email is on its way (or would be, for a known address). */
  signUp(email: string, password: string, captcha?: string): Promise<void>
  resendConfirmation(email: string, captcha?: string): Promise<void>
  requestPasswordReset(email: string, captcha?: string): Promise<void>
  updatePassword(password: string): Promise<void>
}

export class AuthFailure extends Error {
  readonly issue: AuthIssue
  constructor(issue: AuthIssue) {
    super(issue)
    this.issue = issue
  }
}

/** A stored session that cannot be checked (no network) must not leave a bare loading screen. */
export const initializeTimeoutMs = 8000

// Independent of React and the SDK so identity/cache races can be tested directly.
export class AuthController {
  private snapshot: AuthSnapshot = { status: 'loading', user: null, issue: null }
  private listeners = new Set<() => void>()
  private boot?: Promise<void>
  private unsubscribe?: () => void
  private loggingOut = false
  private adapter: AuthAdapter
  private clearPrivate: () => void
  constructor(adapter: AuthAdapter, clearPrivate: () => void) {
    this.adapter = adapter
    this.clearPrivate = clearPrivate
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(user: Identity | null, issue: AuthIssue | null = null, recovery = false) {
    if (this.snapshot.user?.id !== user?.id || !user) this.clearPrivate()
    this.snapshot = {
      status: user ? 'signed-in' : 'signed-out',
      user,
      issue,
      ...(user && recovery ? { recovery: true } : {}),
    }
    this.listeners.forEach((listener) => listener())
  }
  start = () => {
    this.boot ??= (async () => {
      let initializing = true
      let latest: Identity | null | undefined
      this.unsubscribe = this.adapter.subscribe((user) => {
        if (initializing) {
          latest = user
          return
        }
        if (!this.loggingOut)
          this.publish(
            user,
            !user ? (this.snapshot.user ? 'expired' : this.snapshot.issue) : null,
            Boolean(user && this.snapshot.recovery && this.snapshot.user?.id === user.id),
          )
      })
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const initial = await Promise.race([
          this.adapter.initialize(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new AuthFailure('connection')), initializeTimeoutMs)
          }),
        ])
        const user = latest === undefined ? initial.user : latest
        this.publish(user, null, initial.recovery && user?.id === initial.user?.id)
      } catch (error) {
        this.publish(null, error instanceof AuthFailure ? error.issue : 'connection')
      } finally {
        clearTimeout(timer)
        initializing = false
      }
    })()
    return this.boot
  }
  retry = async () => {
    this.unsubscribe?.()
    this.boot = undefined
    this.snapshot = { status: 'loading', user: null, issue: null }
    this.listeners.forEach((listener) => listener())
    await this.start()
  }
  signIn = async () => {
    // Offline, the redirect would land on the browser's error page: say so here instead.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.publish(null, 'connection')
      return
    }
    try {
      await this.adapter.signIn()
    } catch {
      this.publish(null, 'connection')
    }
  }
  signOut = async () => {
    this.loggingOut = true
    this.publish(null)
    try {
      await this.adapter.signOut()
    } catch {
      this.publish(null, 'sign-out')
    } finally {
      this.loggingOut = false
    }
  }
  /** RYT-157: the new password is saved (or the user chose to keep the old one). */
  finishRecovery = () => {
    if (!this.snapshot.recovery) return
    this.snapshot = { ...this.snapshot, recovery: false }
    this.listeners.forEach((listener) => listener())
  }
  private password = async (action: () => Promise<void>) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      throw new PasswordFailure('connection')
    try {
      await action()
    } catch (error) {
      throw error instanceof PasswordFailure ? error : new PasswordFailure('connection')
    }
  }
  signInWithPassword = (email: string, password: string, captcha?: string) =>
    this.password(() => this.adapter.signInWithPassword(email.trim(), password, captcha))
  signUp = (email: string, password: string, captcha?: string) =>
    this.password(() => this.adapter.signUp(email.trim(), password, captcha))
  resendConfirmation = (email: string, captcha?: string) =>
    this.password(() => this.adapter.resendConfirmation(email.trim(), captcha))
  requestPasswordReset = (email: string, captcha?: string) =>
    this.password(() => this.adapter.requestPasswordReset(email.trim(), captcha))
  updatePassword = (password: string) => this.password(() => this.adapter.updatePassword(password))
}
