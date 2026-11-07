import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionResource } from '../src/lib/session-resource.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test('concurrent readers share one load and reuse fresh data', async () => {
  let calls = 0
  const result = deferred<string>()
  const cache = createSessionResource(async () => { calls++; return result.promise })
  const first = cache.select('alice')
  assert.equal(first, cache.refresh())
  await Promise.resolve()
  assert.equal(calls, 1)
  result.resolve('Alice')
  await first
  assert.equal(await cache.select('alice'), 'Alice')
  assert.equal(calls, 1)
})

test('expired data stays visible during a background refresh', async () => {
  let clock = 0
  let result = deferred<string>()
  const cache = createSessionResource(() => result.promise, { now: () => clock, ttlMs: 60_000 })
  const first = cache.select('alice')
  result.resolve('old'); await first
  clock = 60_001
  result = deferred<string>()
  const refresh = cache.refresh()
  assert.equal(cache.getSnapshot().data, 'old')
  assert.equal(cache.getSnapshot().ready, true)
  result.resolve('new'); await refresh
  assert.equal(cache.getSnapshot().data, 'new')
})

test('sign out clears data immediately and ignores a late response', async () => {
  const result = deferred<string>()
  const cache = createSessionResource(() => result.promise)
  const first = cache.select('alice')
  await Promise.resolve()
  await cache.select(null)
  assert.deepEqual(cache.getSnapshot(), { userId: null, data: null, ready: true, error: null })
  result.resolve('private Alice data'); await first
  assert.equal(cache.getSnapshot().data, null)
})

test('switching accounts aborts the old request and cannot show its data', async () => {
  const alice = deferred<string>(), bob = deferred<string>()
  let aliceSignal: AbortSignal | undefined
  const cache = createSessionResource((id, signal) => {
    if (id === 'alice') { aliceSignal = signal; return alice.promise }
    return bob.promise
  })
  const first = cache.select('alice'); await Promise.resolve()
  const second = cache.select('bob'); await Promise.resolve()
  assert.equal(aliceSignal?.aborted, true)
  assert.equal(cache.getSnapshot().data, null)
  alice.resolve('Alice'); await first
  assert.equal(cache.getSnapshot().userId, 'bob')
  assert.equal(cache.getSnapshot().data, null)
  bob.resolve('Bob'); await second
  assert.equal(cache.getSnapshot().data, 'Bob')
})

test('forced refresh after onboarding supersedes an earlier incomplete profile read', async () => {
  const firstResult = deferred<boolean>(), completed = deferred<boolean>()
  let calls = 0
  const cache = createSessionResource(() => ++calls === 1 ? firstResult.promise : completed.promise)
  const first = cache.select('alice'); await Promise.resolve()
  const refreshed = cache.refresh(true); await Promise.resolve()
  firstResult.resolve(false); await first
  completed.resolve(true); await refreshed
  assert.equal(cache.getSnapshot().data, true)
})

test('saved avatar updates cancel stale reads instead of being overwritten', async () => {
  let result = deferred<{ avatar: string }>()
  const cache = createSessionResource(() => result.promise)
  const first = cache.select('alice'); result.resolve({ avatar: 'blue' }); await first
  result = deferred<{ avatar: string }>()
  const stale = cache.refresh(true); await Promise.resolve()
  cache.update(profile => ({ ...profile, avatar: 'green' }))
  result.resolve({ avatar: 'blue' }); await stale
  assert.equal(cache.getSnapshot().data?.avatar, 'green')
})

test('network failures preserve cached data and a subsequent retry recovers', async () => {
  let fail = false
  const cache = createSessionResource(async () => { if (fail) throw new Error('offline'); return 'Alice' })
  await cache.select('alice')
  fail = true
  await cache.refresh(true)
  assert.equal(cache.getSnapshot().data, 'Alice')
  assert.equal(cache.getSnapshot().error?.message, 'offline')
  fail = false
  await cache.refresh(true)
  assert.equal(cache.getSnapshot().error, null)
})

test('auth callbacks can clear account data without starting a network request', async () => {
  let calls = 0
  const cache = createSessionResource(async () => { calls++; return 'Alice' })
  cache.identify('alice')
  assert.equal(calls, 0)
  await cache.refresh()
  assert.equal(calls, 1)
  cache.identify('bob')
  assert.equal(cache.getSnapshot().data, null)
  assert.equal(cache.getSnapshot().userId, 'bob')
  assert.equal(calls, 1)
})
