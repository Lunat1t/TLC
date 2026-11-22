import assert from 'node:assert/strict'
import test from 'node:test'
import {
  enterEditorLandscape,
  requestEditorLandscape,
  shouldRequireEditorLandscape,
} from '../src/lib/editor-orientation.ts'

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

test('shouldRequireEditorLandscape blocks mobile/tablet portrait and allows landscape or desktop split', () => {
  assert.equal(shouldRequireEditorLandscape({ width: 375, height: 812, coarsePointer: true }), true)
  assert.equal(shouldRequireEditorLandscape({ width: 375, height: 812, coarsePointer: false }), true)
  assert.equal(shouldRequireEditorLandscape({ width: 1024, height: 1366, coarsePointer: true }), true)
  assert.equal(shouldRequireEditorLandscape({ width: 812, height: 375, coarsePointer: true }), false)
  assert.equal(shouldRequireEditorLandscape({ width: 960, height: 1080, coarsePointer: false }), false)
  assert.equal(shouldRequireEditorLandscape({ width: 0, height: 0, coarsePointer: true }), false)
})

test('enterEditorLandscape requests fullscreen and lock, cleaning up on leave', async () => {
  const calls: string[] = []
  const doc = {
    fullscreenElement: null as Element | null,
    async exitFullscreen() {
      calls.push('exitFullscreen')
      doc.fullscreenElement = null
    },
  }
  const orientation = {
    async lock(value: 'landscape') {
      calls.push(`lock:${value}`)
    },
    unlock() {
      calls.push('unlock')
    },
  }
  const leave = requestEditorLandscape(orientation, doc)
  const result = await enterEditorLandscape({
    target: {
      async requestFullscreen() {
        calls.push('requestFullscreen')
        doc.fullscreenElement = {} as Element
      },
    },
    doc,
    orientation,
  })
  assert.equal(result, 'locked')
  assert.deepEqual(calls, ['lock:landscape', 'requestFullscreen', 'lock:landscape'])
  leave()
  assert.deepEqual(calls, ['lock:landscape', 'requestFullscreen', 'lock:landscape', 'unlock', 'exitFullscreen'])
})

test('enterEditorLandscape returns manual when lock or fullscreen is rejected', async () => {
  const result = await enterEditorLandscape({
    target: { async requestFullscreen() { throw new Error('denied') } },
    doc: { fullscreenElement: null },
    orientation: { async lock() { throw new Error('unsupported') } },
  })
  assert.equal(result, 'manual')
  assert.equal(await enterEditorLandscape({}), 'manual')
})
