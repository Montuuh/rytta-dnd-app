/**
 * One write at a time with a stable idempotency id per payload.
 *
 * `run` takes a ref-style flag (not a render-time `isPending`), so two clicks in the same frame
 * cannot both pass. `idFor(key)` keeps the id of a payload until it succeeds (`done`): pressing
 * again after a failed or interrupted request repeats the same request, never a new one.
 */
export function createSubmitGuard(newId: () => string) {
  let busy = false
  const ids = new Map<string, string>()
  return {
    get busy() {
      return busy
    },
    idFor(key: string) {
      let id = ids.get(key)
      if (!id) {
        id = newId()
        ids.set(key, id)
      }
      return id
    },
    done(key: string) {
      ids.delete(key)
    },
    /** Resolves `undefined` without running when a write is already in flight. */
    async run<T>(task: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined
      busy = true
      try {
        return await task()
      } finally {
        busy = false
      }
    },
  }
}
