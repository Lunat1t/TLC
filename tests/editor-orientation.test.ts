import assert from 'node:assert/strict'
import test from 'node:test'
import { requestEditorLandscape } from '../src/lib/editor-orientation.ts'

test('requests device landscape and releases a lock granted after navigation', async () => {
  const calls: string[] = []
  let grant!: () => void
  const leave = requestEditorLandscape({
    lock(value) { calls.push(value); return new Promise(resolve => { grant = resolve }) },
    unlock() { calls.push('unlock') },
  })
  assert.deepEqual(calls, ['landscape'])
  leave?.()
  grant()
  await Promise.resolve()
  assert.deepEqual(calls, ['landscape', 'unlock', 'unlock'])
})

test('unavailable or denied orientation leaves the editor accessible', async () => {
  requestEditorLandscape()
  requestEditorLandscape({lock() { throw Error() }, unlock() {}})
  const leave = requestEditorLandscape({lock: async () => { throw Error() }, unlock() {}})
  await Promise.resolve()
  leave?.()
})
