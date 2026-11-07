// One account's display data, in memory only. Never use this as authorization.
export function createSessionResource<T>(
  load: (userId: string, signal: AbortSignal) => Promise<T | null>,
  { ttlMs = 60_000, now = Date.now } = {},
) {
  type Snapshot = { userId: string | null; data: T | null; ready: boolean; error: Error | null }
  let snapshot: Snapshot = { userId: null, data: null, ready: false, error: null }
  let checkedAt = -Infinity
  let generation = 0
  let pending: { controller: AbortController; promise: Promise<T | null> } | null = null
  const listeners = new Set<() => void>()
  function publish(next: Snapshot) { snapshot = next; listeners.forEach(listener => listener()) }

  function refresh(force = false): Promise<T | null> {
    const userId = snapshot.userId
    if (!userId) return Promise.resolve(null)
    if (force && pending) cancel()
    if (pending) return pending.promise
    if (!force && now() - checkedAt < ttlMs) return Promise.resolve(snapshot.data)
    const epoch = generation, controller = new AbortController()
    const promise = Promise.resolve().then(() => controller.signal.aborted ? null : load(userId, controller.signal)).then(data => {
      if (generation !== epoch || controller.signal.aborted) return null
      checkedAt = now()
      publish({ userId, data, ready: true, error: null })
      return data
    }).catch(error => {
      if (generation === epoch && !controller.signal.aborted) {
        publish({ ...snapshot, ready: true, error: error instanceof Error ? error : new Error("Не удалось загрузить профиль.") })
      }
      return null
    }).finally(() => { if (pending?.controller === controller) pending = null })
    pending = { controller, promise }
    return promise
  }

  function cancel() {
    generation++
    pending?.controller.abort()
    pending = null
  }

  function identify(userId: string | null) {
    if (userId !== snapshot.userId || !snapshot.ready && !userId) {
      cancel()
      checkedAt = -Infinity
      publish({ userId, data: null, ready: !userId, error: null })
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    identify,
    select(userId: string | null) {
      identify(userId)
      return refresh()
    },
    refresh,
    update(update: (current: T) => T) {
      if (snapshot.data === null) return
      cancel()
      publish({ ...snapshot, data: update(snapshot.data), error: null })
    },
    cancel,
  }
}
