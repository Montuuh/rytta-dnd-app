import { z } from 'zod'

type Signer = {
  storage: {
    from: (bucket: string) => {
      createSignedUrls: (
        paths: string[],
        seconds: number,
      ) => PromiseLike<{
        data: { path: string | null; signedUrl: string | null; error: string | null }[] | null
        error: unknown
      }>
    }
  }
}

/** The Storage API signs at most this many paths per request. */
const signBatchLimit = 100

/**
 * RYT-114: one signer per private bucket. Calls made in the same moment (a satchel, a fight's
 * portraits, a shop list) are collected for 15 ms and signed with one Storage request per 100
 * paths instead of one request each. A path that fails, or whose URL is not valid, rejects alone.
 */
export function createBatchSigner(client: () => Promise<Signer>, bucket: string, seconds: number) {
  let pending = new Map<
    string,
    { resolve: (url: string) => void; reject: (e: unknown) => void }[]
  >()
  let timer: ReturnType<typeof setTimeout> | null = null

  async function flush() {
    const batch = pending
    pending = new Map()
    timer = null
    const paths = [...batch.keys()]
    const fail = (chunk: string[], error: unknown) => {
      for (const path of chunk) for (const waiter of batch.get(path) ?? []) waiter.reject(error)
    }
    let db: Signer
    try {
      db = await client()
    } catch (error) {
      fail(paths, error)
      return
    }
    for (let i = 0; i < paths.length; i += signBatchLimit) {
      const chunk = paths.slice(i, i + signBatchLimit)
      try {
        const result = await db.storage.from(bucket).createSignedUrls(chunk, seconds)
        if (result.error) throw result.error
        const urls = new Map(
          (result.data ?? [])
            .filter((row) => !row.error && row.path)
            .map((row) => [row.path!, row.signedUrl]),
        )
        for (const path of chunk) {
          const url = z.url().safeParse(urls.get(path))
          for (const waiter of batch.get(path) ?? [])
            if (url.success) waiter.resolve(url.data)
            else waiter.reject(new Error('unavailable'))
        }
      } catch (error) {
        fail(chunk, error)
      }
    }
  }

  return (path: string) =>
    new Promise<string>((resolve, reject) => {
      const waiters = pending.get(path) ?? []
      waiters.push({ resolve, reject })
      pending.set(path, waiters)
      timer ??= setTimeout(() => void flush(), 15)
    })
}
