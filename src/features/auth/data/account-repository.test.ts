import { describe, expect, it, vi } from 'vitest'
import type { AppSupabaseClient } from '@/shared/api/database.types'
import { AccountError, accountExportFileName } from '../domain/account'
import { createSupabaseAccountRepository } from './account-repository'

// RYT-115: the deletion removes only active-environment objects of the campaigns it deletes, only
// after the confirmation and the prepared blocker check pass, and only calls the deletion once no
// owned object is listed any more.
const solo = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
type Reply = { data?: unknown; error?: { message: string } | null }

function fakeClient(replies: Record<string, Reply | Reply[]>, removeError = false) {
  const calls: string[] = []
  const removed: [string, string[]][] = []
  const rpc = vi.fn((name: string) => {
    calls.push(name)
    const queued = replies[name]
    const reply = (Array.isArray(queued) ? queued.shift() : queued) ?? { data: null }
    const result = Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null })
    return Object.assign(result, { abortSignal: () => result })
  })
  const client = {
    rpc,
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          calls.push(`remove:${bucket}`)
          removed.push([bucket, paths])
          return Promise.resolve({ error: removeError ? { message: 'denied' } : null })
        },
      }),
    },
  } as unknown as AppSupabaseClient
  return { client, calls, removed, rpc }
}

const prepared = (storage_paths: unknown[] = [], blockers: unknown[] = []) => ({
  data: { blockers, campaigns: [solo], storage_paths, revoked_invitations: 0 },
})
const deleted = {
  deleted: true,
  data_deleted: true,
  environment: 'pre',
  auth_user: 'shared',
  campaigns_deleted: [solo],
  campaigns_left: [other],
}
const paths = [
  { bucket_id: 'character-portraits', object_path: `pre/${solo}/c/a.webp`, campaign_id: solo },
  { bucket_id: 'tabletop-media', object_path: `pre/${solo}/map/b.webp`, campaign_id: solo },
  // A PRE copy keeps production paths: never removed from PRE.
  { bucket_id: 'shop-images', object_path: `public/${solo}/s/c.webp`, campaign_id: solo },
  // The path must belong to the campaign it is listed for.
  { bucket_id: 'item-images', object_path: `pre/${other}/i/d.webp`, campaign_id: solo },
  { bucket_id: 'unknown', object_path: `pre/${solo}/x.webp`, campaign_id: solo },
]

describe('account repository', () => {
  it('removes owned objects, then deletes the account', async () => {
    const fake = fakeClient({
      prepare_account_deletion: prepared(paths),
      // The skipped foreign paths may still be listed; owned ones are gone.
      account_storage_paths: { data: paths.slice(2) },
      delete_my_account: { data: deleted },
    })
    const repo = createSupabaseAccountRepository(fake.client, 'pre')
    const result = await repo.deleteMyAccount('DELETE', 'req-1')
    expect(result).toEqual({
      environment: 'pre',
      authUser: 'shared',
      campaignsDeleted: [solo],
      campaignsLeft: [other],
    })
    expect(fake.removed).toEqual([
      ['character-portraits', [`pre/${solo}/c/a.webp`]],
      ['tabletop-media', [`pre/${solo}/map/b.webp`]],
    ])
    expect(fake.calls).toEqual([
      'prepare_account_deletion',
      'remove:character-portraits',
      'remove:tabletop-media',
      'account_storage_paths',
      'delete_my_account',
    ])
    expect(fake.rpc).toHaveBeenCalledWith('prepare_account_deletion', { request_id: 'req-1' })
    expect(fake.rpc).toHaveBeenLastCalledWith('delete_my_account', {
      confirmation: 'DELETE',
      request_id: 'req-1',
    })
  })

  it('removes large lists in batches of 100', async () => {
    const many = Array.from({ length: 230 }, (_, n) => ({
      bucket_id: 'item-images',
      object_path: `public/${solo}/i/${n}.webp`,
      campaign_id: solo,
    }))
    const fake = fakeClient({
      prepare_account_deletion: prepared(many),
      account_storage_paths: { data: [] },
      delete_my_account: { data: { ...deleted, environment: 'public', auth_user: 'deleted' } },
    })
    await createSupabaseAccountRepository(fake.client, 'public').deleteMyAccount('DELETE', 'r')
    expect(fake.removed.map(([, batch]) => batch.length)).toEqual([100, 100, 30])
  })

  it('refuses a wrong word and open blockers before touching Storage', async () => {
    const fake = fakeClient({
      prepare_account_deletion: prepared(paths, [
        { campaign_id: other, campaign_name: 'Keep', other_members: 3 },
      ]),
    })
    const repo = createSupabaseAccountRepository(fake.client, 'pre')
    await expect(repo.deleteMyAccount('delete', 'r')).rejects.toMatchObject({
      kind: 'confirmation',
    })
    expect(fake.calls).toEqual([])
    const failure = await repo.deleteMyAccount('DELETE', 'r').catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(AccountError)
    expect(failure).toMatchObject({
      kind: 'blocked',
      blockers: [{ campaignId: other, campaignName: 'Keep', otherMembers: 3 }],
    })
    expect(fake.calls).toEqual(['prepare_account_deletion'])
  })

  it('stops when an object cannot be removed', async () => {
    const fake = fakeClient({ prepare_account_deletion: prepared(paths.slice(0, 1)) }, true)
    await expect(
      createSupabaseAccountRepository(fake.client, 'pre').deleteMyAccount('DELETE', 'r'),
    ).rejects.toMatchObject({ kind: 'storage' })
    expect(fake.calls).not.toContain('delete_my_account')
  })

  it('lists again until nothing owned is left, and stops on an object that stays', async () => {
    const page = (n: number) => [
      { bucket_id: 'item-images', object_path: `pre/${solo}/i/${n}.webp`, campaign_id: solo },
    ]
    const fake = fakeClient({
      prepare_account_deletion: prepared(page(1)),
      account_storage_paths: [{ data: page(2) }, { data: [] }],
      delete_my_account: { data: deleted },
    })
    await createSupabaseAccountRepository(fake.client, 'pre').deleteMyAccount('DELETE', 'r')
    expect(fake.removed.map(([, batch]) => batch)).toEqual([
      [`pre/${solo}/i/1.webp`],
      [`pre/${solo}/i/2.webp`],
    ])
    // Removal reported success but the object is listed again (Storage denied it silently).
    const stuck = fakeClient({
      prepare_account_deletion: prepared(page(1)),
      account_storage_paths: { data: page(1) },
    })
    await expect(
      createSupabaseAccountRepository(stuck.client, 'pre').deleteMyAccount('DELETE', 'r'),
    ).rejects.toMatchObject({ kind: 'storage' })
    expect(stuck.calls).not.toContain('delete_my_account')
  })

  it('stops with storage before the deletion when more pages remain than the cap', async () => {
    let n = 0
    const fresh = () => ({
      data: [
        { bucket_id: 'item-images', object_path: `pre/${solo}/i/${n++}.webp`, campaign_id: solo },
      ],
    })
    const fake = fakeClient({
      prepare_account_deletion: prepared(fresh().data),
      account_storage_paths: Array.from({ length: 20 }, fresh),
    })
    await expect(
      createSupabaseAccountRepository(fake.client, 'pre').deleteMyAccount('DELETE', 'r'),
    ).rejects.toMatchObject({ kind: 'storage' })
    expect(fake.calls.filter((c) => c === 'account_storage_paths')).toHaveLength(11)
    expect(fake.calls).not.toContain('delete_my_account')
  })

  it('leaves the objects of a campaign outside the prepared snapshot and still deletes', async () => {
    const late = '00000000-0000-4000-8000-000000000003'
    const lateObject = {
      bucket_id: 'item-images',
      object_path: `pre/${late}/i/late.webp`,
      campaign_id: late,
    }
    const fake = fakeClient({
      prepare_account_deletion: prepared(paths.slice(0, 1)),
      // The re-listing shows a campaign that became solo after the preparation.
      account_storage_paths: { data: [lateObject] },
      delete_my_account: { data: deleted },
    })
    await expect(
      createSupabaseAccountRepository(fake.client, 'pre').deleteMyAccount('DELETE', 'r'),
    ).resolves.toMatchObject({ authUser: 'shared' })
    expect(fake.removed).toEqual([['character-portraits', [`pre/${solo}/c/a.webp`]]])
    expect(fake.calls).toEqual([
      'prepare_account_deletion',
      'remove:character-portraits',
      'account_storage_paths',
      'delete_my_account',
    ])
  })

  it('reports a kept sign-in account without claiming more', async () => {
    const fake = fakeClient({
      prepare_account_deletion: prepared(),
      delete_my_account: {
        data: { ...deleted, deleted: false, environment: 'public', auth_user: 'kept' },
      },
    })
    await expect(
      createSupabaseAccountRepository(fake.client, 'public').deleteMyAccount('DELETE', 'r'),
    ).resolves.toMatchObject({ authUser: 'kept' })
    const unprepared = fakeClient({
      prepare_account_deletion: prepared(),
      delete_my_account: { error: { message: 'Account deletion not prepared' } },
    })
    await expect(
      createSupabaseAccountRepository(unprepared.client, 'pre').deleteMyAccount('DELETE', 'r'),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('maps server errors to typed kinds', async () => {
    const blockers = [{ campaign_id: other, campaign_name: 'Raced', other_members: 1 }]
    const fake = fakeClient({
      prepare_account_deletion: prepared(),
      account_deletion_blockers: { data: blockers },
      delete_my_account: { error: { message: 'Account deletion blocked' } },
    })
    await expect(
      createSupabaseAccountRepository(fake.client, 'pre').deleteMyAccount('DELETE', 'r'),
    ).rejects.toMatchObject({ kind: 'blocked', blockers: [{ campaignName: 'Raced' }] })
    const denied = fakeClient({ export_my_data: { error: { message: 'Forbidden' } } })
    await expect(
      createSupabaseAccountRepository(denied.client, 'pre').exportMyData(),
    ).rejects.toMatchObject({ kind: 'signIn' })
    const broken = fakeClient({ account_deletion_blockers: { error: { message: 'timeout' } } })
    await expect(
      createSupabaseAccountRepository(broken.client, 'pre').deletionBlockers(),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('checks the export envelope and names the file by its date', async () => {
    const payload = {
      format: 'rytta-account-export',
      version: 1,
      environment: 'public',
      generated_at: '2026-11-17T05:55:35.423+00:00',
      limits: { rows_per_section: 500 },
      truncated: [],
      profile: { user_id: solo },
      characters: [],
    }
    const fake = fakeClient({ export_my_data: { data: payload } })
    const data = await createSupabaseAccountRepository(fake.client, 'public').exportMyData()
    expect(data).toEqual(payload)
    expect(accountExportFileName(data)).toBe('rytta-export-2026-11-17.json')
    const wrong = fakeClient({ export_my_data: { data: { format: 'other' } } })
    await expect(
      createSupabaseAccountRepository(wrong.client, 'public').exportMyData(),
    ).rejects.toThrow()
  })
})
