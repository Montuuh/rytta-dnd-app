import { z } from 'zod'

/** RYT-078 (ADR 036): one username per account; the database is authoritative. */
export const usernamePattern = /^[A-Za-z0-9_]{3,24}$/
const reserved = new Set([
  'admin',
  'administrator',
  'dm',
  'gm',
  'master',
  'player',
  'rytta',
  'system',
  'support',
  'moderator',
  'root',
  'null',
  'undefined',
  'me',
  'self',
  'anonymous',
])

export const usernameSchema = z.string().trim().regex(usernamePattern)

export type UsernameProblem = 'length' | 'characters' | 'reserved'

/** Local format check; availability is asked of the server separately. */
export function usernameProblem(value: string): UsernameProblem | null {
  const name = value.trim()
  if (name.length < 3 || name.length > 24) return 'length'
  if (!usernamePattern.test(name)) return 'characters'
  if (reserved.has(name.toLowerCase())) return 'reserved'
  return null
}

/** A first suggestion from the account's email: its local part, reduced to allowed characters. */
export function suggestUsername(email: string): string {
  const local = email.split('@')[0] ?? ''
  const cleaned = local
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24)
  // A neutral pad: the person may be a DM or a Player.
  const padded = cleaned.length >= 3 ? cleaned : `${cleaned || 'user'}_1`.slice(0, 24)
  return usernameProblem(padded) ? `${padded}_1`.slice(0, 24) : padded
}

export type UsernameErrorKind = 'taken' | 'invalid' | 'reserved' | 'unavailable'
export class UsernameError extends Error {
  readonly kind: UsernameErrorKind
  constructor(kind: UsernameErrorKind) {
    super(kind)
    this.kind = kind
  }
}

export interface UsernameRepository {
  get(signal?: AbortSignal): Promise<string | null>
  available(candidate: string, signal?: AbortSignal): Promise<boolean>
  set(username: string): Promise<string>
}
