import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import {
  createBoundedRangeReadableStream,
  formatUpstreamRangeHeader,
  parseContentRangeHeader,
  parseHttpRangeHeader,
  resolveRangeForTotalSize,
} from "../src/lib/instructions/pdf-range.ts"
import {
  calculateCanvasFitScale,
  calculateReaderScale,
  calculateCanvasPixelRatio,
  clampPageNumber,
  PDFJS_WASM_URL,
  normalizeReaderUserId,
  normalizeRotation,
  normalizeZoom,
  parseStoredReaderState,
  pdfCacheEntryKey,
  readerStateStorageKey,
  rotateClockwise,
  selectPreloadPages,
  serializeReaderState,
} from "../src/lib/instructions/reader-storage.ts"

const MAX_BYTES = 100_000_000

test("parseHttpRangeHeader accepts single byte ranges and rejects invalid or multi-ranges", () => {
  assert.deepEqual(parseHttpRangeHeader(null, MAX_BYTES), { kind: "none" })
  assert.deepEqual(parseHttpRangeHeader("bytes=0-1023", MAX_BYTES), { kind: "bounded", start: 0, end: 1023 })
  assert.deepEqual(parseHttpRangeHeader("BYTES=512-", MAX_BYTES), { kind: "open", start: 512 })
  assert.deepEqual(parseHttpRangeHeader("bytes=-256", MAX_BYTES), { kind: "suffix", suffix: 256 })
  assert.deepEqual(parseHttpRangeHeader("bytes=0-999999999", MAX_BYTES), {
    kind: "bounded",
    start: 0,
    end: MAX_BYTES - 1,
  })

  assert.deepEqual(parseHttpRangeHeader("", MAX_BYTES), { kind: "invalid" })
  assert.deepEqual(parseHttpRangeHeader("bytes=0-10, 20-30", MAX_BYTES), { kind: "invalid" })
  assert.deepEqual(parseHttpRangeHeader("items=0-10", MAX_BYTES), { kind: "invalid" })
  assert.deepEqual(parseHttpRangeHeader("bytes=20-10", MAX_BYTES), { kind: "invalid" })
  assert.deepEqual(parseHttpRangeHeader("bytes=abc-def", MAX_BYTES), { kind: "invalid" })
  assert.deepEqual(parseHttpRangeHeader("bytes=-0", MAX_BYTES), { kind: "unsatisfiable" })
  assert.deepEqual(parseHttpRangeHeader(`bytes=${MAX_BYTES}-${MAX_BYTES + 10}`, MAX_BYTES), { kind: "unsatisfiable" })
})

test("resolveRangeForTotalSize handles bounds, 416 out-of-bounds, and 413 oversized files", () => {
  const bounded = parseHttpRangeHeader("bytes=100-500", MAX_BYTES)
  assert.notEqual(bounded.kind, "none")
  if (bounded.kind !== "none") {
    assert.deepEqual(resolveRangeForTotalSize(bounded, 400, MAX_BYTES), {
      ok: true,
      start: 100,
      end: 399,
      totalSize: 400,
    })
    assert.deepEqual(resolveRangeForTotalSize(bounded, 100, MAX_BYTES), {
      ok: false,
      status: 416,
      totalSize: 100,
    })
    assert.deepEqual(resolveRangeForTotalSize(bounded, MAX_BYTES + 1, MAX_BYTES), {
      ok: false,
      status: 413,
      totalSize: MAX_BYTES + 1,
    })
    assert.deepEqual(resolveRangeForTotalSize(bounded, 0, MAX_BYTES), {
      ok: false,
      status: 416,
      totalSize: 0,
    })
  }

  const suffix = parseHttpRangeHeader("bytes=-100", MAX_BYTES)
  if (suffix.kind !== "none") {
    assert.deepEqual(resolveRangeForTotalSize(suffix, 60, MAX_BYTES), {
      ok: true,
      start: 0,
      end: 59,
      totalSize: 60,
    })
    assert.deepEqual(resolveRangeForTotalSize(suffix, 250, MAX_BYTES), {
      ok: true,
      start: 150,
      end: 249,
      totalSize: 250,
    })
  }
})

test("parseContentRangeHeader and formatUpstreamRangeHeader validate upstream metadata", () => {
  assert.deepEqual(parseContentRangeHeader("bytes 0-1023/4096"), {
    kind: "range",
    start: 0,
    end: 1023,
    total: 4096,
  })
  assert.deepEqual(parseContentRangeHeader("bytes */4096"), { kind: "unsatisfied", total: 4096 })
  assert.equal(parseContentRangeHeader("bytes 10-5/4096"), null)
  assert.equal(parseContentRangeHeader("bytes 0-4096/4096"), null)
  assert.equal(parseContentRangeHeader("bytes 0-10/*"), null)

  assert.equal(formatUpstreamRangeHeader({ kind: "bounded", start: 0, end: 200 }, 100), "bytes=0-99")
  assert.equal(formatUpstreamRangeHeader({ kind: "open", start: 50 }, 100), "bytes=50-")
  assert.equal(formatUpstreamRangeHeader({ kind: "suffix", suffix: 200 }, 100), "bytes=-100")
})

test("reader state & cache keys are strictly isolated by userId", () => {
  assert.equal(normalizeReaderUserId(null), "anon")
  assert.equal(normalizeReaderUserId("   "), "anon")
  assert.equal(normalizeReaderUserId(" user-123 "), "user-123")

  const k1 = readerStateStorageKey("user-a", "robot-1")
  const k2 = readerStateStorageKey("user-b", "robot-1")
  const kAnon = readerStateStorageKey(null, "robot-1")
  assert.notEqual(k1, k2)
  assert.notEqual(k1, kAnon)
  assert.notEqual(k2, kAnon)

  assert.notEqual(pdfCacheEntryKey("user-a", "robot-1"), pdfCacheEntryKey("user-b", "robot-1"))
  assert.notEqual(pdfCacheEntryKey("user-a", "robot-1"), pdfCacheEntryKey(undefined, "robot-1"))
})

test("reader state serialization, rotation, zoom, preloading, and fit recalculation work as expected", () => {
  const serialized = serializeReaderState(12, 90)
  assert.deepEqual(parseStoredReaderState(serialized), { page: 12, rotation: 90 })
  assert.deepEqual(parseStoredReaderState("not-json"), { page: 1, rotation: 0 })
  assert.deepEqual(parseStoredReaderState(JSON.stringify({ page: -4, rotation: 45 })), {
    page: 1,
    rotation: 0,
  })

  assert.equal(normalizeRotation(270), 270)
  assert.equal(normalizeRotation(45), 0)
  assert.equal(rotateClockwise(0), 90)
  assert.equal(rotateClockwise(90), 180)
  assert.equal(rotateClockwise(180), 270)
  assert.equal(rotateClockwise(270), 0)

  assert.equal(normalizeZoom(1.25), 1.25)
  assert.equal(normalizeZoom(3), 1)
  assert.equal(clampPageNumber(99, 10), 10)
  assert.equal(clampPageNumber(0, 10), 1)

  assert.deepEqual(selectPreloadPages(1, 10), [2])
  assert.deepEqual(selectPreloadPages(5, 10), [6, 4])
  assert.deepEqual(selectPreloadPages(10, 10), [9])
  assert.deepEqual(selectPreloadPages(1, 1), [])

  const portraitScale = calculateCanvasFitScale(800, 600)
  const rotatedLandscapeScale = calculateCanvasFitScale(800, 900)
  assert.ok(portraitScale > rotatedLandscapeScale)
  assert.ok(Math.abs(rotatedLandscapeScale - 800 / 900) < 1e-6)
})

test("createBoundedRangeReadableStream skips empty chunks without stalling and stops at expectedBytes", async () => {
  const encoder = new TextEncoder()
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(0))
      controller.enqueue(encoder.encode("EF"))
      controller.enqueue(new Uint8Array(0))
      controller.enqueue(encoder.encode("GH-EXTRA"))
      controller.close()
    },
  })
  const stream = createBoundedRangeReadableStream(upstream.getReader(), encoder.encode("ABCD"), 8)
  const reader = stream.getReader()
  const parts: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  const combined = new TextDecoder().decode(Buffer.concat(parts))
  assert.equal(combined, "ABCDEFGH")
})


test("whole-page fit respects laptop height, tablet orientation, rotation and width mode", () => {
  assert.equal(calculateReaderScale(1200, 500, 600, 900, "page"), 500 / 900)
  assert.equal(calculateReaderScale(740, 850, 600, 900, "page"), 850 / 900)
  assert.equal(calculateReaderScale(900, 500, 900, 600, "page"), 500 / 600)
  assert.equal(calculateReaderScale(1200, 500, 600, 900, "width"), 1.8)
})

test("canvas resolution has a four megapixel budget even at 200% zoom", () => {
  const ratio = calculateCanvasPixelRatio(2400, 3600, 3)
  assert.ok(2400 * 3600 * ratio * ratio <= 4_000_001)
  assert.equal(calculateCanvasPixelRatio(600, 800, 3), 2)
})

test("reader passes wasmUrl to every getDocument call and ships the JPEG 2000 decoder", () => {
  assert.match(PDFJS_WASM_URL, /^\/vendor\/pdfjs-wasm\/$/)
  for (const file of ["openjpeg.wasm", "openjpeg_nowasm_fallback.js", "jbig2.wasm", "qcms_bg.wasm"]) {
    assert.ok(existsSync(new URL(`../public${PDFJS_WASM_URL}${file}`, import.meta.url)), `${file} must be served from ${PDFJS_WASM_URL}`)
  }
  const source = readFileSync(new URL("../src/components/instructions/pdf-reader.tsx", import.meta.url), "utf8")
  const getDocumentCalls = source.match(/lib\.getDocument\(/g) ?? []
  const wasmOptions = source.match(/wasmUrl: PDFJS_WASM_URL/g) ?? []
  assert.equal(getDocumentCalls.length, 2)
  assert.equal(wasmOptions.length, getDocumentCalls.length)
})
