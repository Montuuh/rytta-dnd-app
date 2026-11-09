import { z } from 'zod'
import type { AppSupabaseClient } from '@/shared/api/database.types'
import { UsernameError, usernameSchema, type UsernameRepository } from '../domain/username'

function check(error: { message: string } | null) {
  if (!error) return
  const kind = error.message.includes('Username taken')
    ? 'taken'
    : error.message.includes('Username reserved')
      ? 'reserved'
      : error.message.includes('Invalid username')
        ? 'invalid'
        : 'unavailable'
  throw new UsernameError(kind)
}

export function createSupabaseUsernameRepository(client: AppSupabaseClient): UsernameRepository {
  return {
    async get(signal) {
      let query = client.rpc('get_my_username')
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      check(error)
      return usernameSchema.nullable().parse(data ?? null)
    },
    async available(candidate, signal) {
      let query = client.rpc('username_available', { candidate })
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      check(error)
      return z.boolean().parse(data)
    },
    async set(username) {
      const { data, error } = await client.rpc('set_my_username', { new_username: username })
      check(error)
      return usernameSchema.parse(data)
    },
  }
}
