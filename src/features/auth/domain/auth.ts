export interface Identity {
  id: string
  email: string
}
export type AuthIssue = 'callback' | 'connection' | 'expired' | 'sign-out'
export interface AuthSnapshot {
  status: 'loading' | 'signed-in' | 'signed-out'
  user: Identity | null
  issue: AuthIssue | null
}
export interface AuthAdapter {
  initialize(): Promise<Identity | null>
  subscribe(listener: (user: Identity | null) => void): () => void
  signIn(): Promise<void>
  signOut(): Promise<void>
}

export class AuthFailure extends Error {
  readonly issue: AuthIssue
  constructor(issue: AuthIssue) {
    super(issue)
    this.issue = issue
  }
}

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
  private publish(user: Identity | null, issue: AuthIssue | null = null) {
    if (this.snapshot.user?.id !== user?.id || !user) this.clearPrivate()
    this.snapshot = { status: user ? 'signed-in' : 'signed-out', user, issue }
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
          this.publish(user, !user ? (this.snapshot.user ? 'expired' : this.snapshot.issue) : null)
      })
      try {
        const user = await this.adapter.initialize()
        this.publish(latest === undefined ? user : latest)
      } catch (error) {
        this.publish(null, error instanceof AuthFailure ? error.issue : 'connection')
      } finally {
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
}
