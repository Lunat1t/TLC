export type PdfRotation = 0 | 90 | 180 | 270
export type ReaderZoom = 1 | 1.25 | 1.5 | 2

export const READER_ZOOM_OPTIONS: readonly ReaderZoom[] = [1, 1.25, 1.5, 2]

const STATE_KEY_PREFIX = "tlc-pdf-state:v1"
const IDB_NAME = "tlc-pdf-cache-v1"
const IDB_STORE = "documents"
const IDB_VERSION = 1
const MAX_CACHED_DOCS = 6
const MAX_CACHED_PDF_BYTES = 100_000_000

export interface StoredReaderState {
  page: number
  rotation: PdfRotation
}

interface CachedPdfRecord {
  key: string
  userId: string
  slug: string
  bytes: ArrayBuffer
  byteLength: number
  updatedAt: number
}

export function normalizeReaderUserId(userId: string | null | undefined): string {
  if (typeof userId !== "string") return "anon"
  const trimmed = userId.trim()
  return trimmed.length > 0 ? trimmed : "anon"
}

export function readerStateStorageKey(userId: string | null | undefined, slug: string): string {
  return `${STATE_KEY_PREFIX}:${normalizeReaderUserId(userId)}:${slug}`
}

export function pdfCacheEntryKey(userId: string | null | undefined, slug: string): string {
  return `${normalizeReaderUserId(userId)}:${slug}`
}

export function normalizeRotation(value: unknown): PdfRotation {
  const num = typeof value === "number" ? value : Number(value)
  if (num === 90 || num === 180 || num === 270) return num
  return 0
}

export function rotateClockwise(current: PdfRotation): PdfRotation {
  return (((current + 90) % 360) as PdfRotation)
}

export function normalizeZoom(value: unknown): ReaderZoom {
  const num = typeof value === "number" ? value : Number(value)
  if (num === 1.25 || num === 1.5 || num === 2) return num
  return 1
}

export function clampPageNumber(value: unknown, totalPages: number): number {
  const maxPages = Number.isSafeInteger(totalPages) && totalPages >= 1 ? totalPages : 1
  const parsed = typeof value === "number" ? Math.trunc(value) : Math.trunc(Number(value))
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(maxPages, parsed)
}

export function parseStoredReaderState(raw: string | null): StoredReaderState {
  if (!raw) return { page: 1, rotation: 0 }
  try {
    const parsed = JSON.parse(raw) as { page?: unknown; rotation?: unknown }
    if (!parsed || typeof parsed !== "object") return { page: 1, rotation: 0 }
    const pageNum = typeof parsed.page === "number" ? Math.trunc(parsed.page) : 1
    return {
      page: Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1,
      rotation: normalizeRotation(parsed.rotation),
    }
  } catch {
    return { page: 1, rotation: 0 }
  }
}

export function serializeReaderState(page: number, rotation: PdfRotation): string {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1
  return JSON.stringify({ page: safePage, rotation: normalizeRotation(rotation) })
}

export function selectPreloadPages(currentPage: number, totalPages: number): number[] {
  if (!Number.isSafeInteger(totalPages) || totalPages <= 1) return []
  const current = clampPageNumber(currentPage, totalPages)
  const candidates = [current + 1, current - 1]
  const seen = new Set<number>()
  const result: number[] = []
  for (const page of candidates) {
    if (page >= 1 && page <= totalPages && page !== current && !seen.has(page)) {
      seen.add(page)
      result.push(page)
    }
  }
  return result
}

export function calculateCanvasFitScale(
  areaWidth: number,
  pageWidthAtScale1: number,
  maxAutoScale = 1.8,
): number {
  if (!Number.isFinite(areaWidth) || areaWidth <= 0 || !Number.isFinite(pageWidthAtScale1) || pageWidthAtScale1 <= 0) {
    return 1
  }
  return Math.max(0.2, Math.min(areaWidth / pageWidthAtScale1, maxAutoScale))
}

// Fit both dimensions for short laptop screens and tablet landscape mode.
export function calculateReaderScale(
  width: number, height: number, pageWidth: number, pageHeight: number,
  mode: "page" | "width",
): number {
  const widthScale = calculateCanvasFitScale(width, pageWidth)
  if (mode === "width" || height <= 0 || pageHeight <= 0) return widthScale
  return Math.min(widthScale, height / pageHeight)
}

export function calculateCanvasPixelRatio(width: number, height: number, deviceRatio: number): number {
  return Math.min(Math.max(deviceRatio || 1, 1), 2, Math.sqrt(4_000_000 / Math.max(1, width * height)))
}

export function loadStoredReaderState(userId: string | null | undefined, slug: string): StoredReaderState {
  if (typeof window === "undefined") return { page: 1, rotation: 0 }
  try {
    return parseStoredReaderState(window.localStorage.getItem(readerStateStorageKey(userId, slug)))
  } catch {
    return { page: 1, rotation: 0 }
  }
}

export function saveStoredReaderState(
  userId: string | null | undefined,
  slug: string,
  page: number,
  rotation: PdfRotation,
): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      readerStateStorageKey(userId, slug),
      serializeReaderState(page, rotation),
    )
  } catch {
    // Ignore storage quota or private-mode errors.
  }
}

function openPdfCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: "key" })
          store.createIndex("updatedAt", "updatedAt", { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbTransactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function readCachedPdfBytes(
  userId: string | null | undefined,
  slug: string,
): Promise<Uint8Array | null> {
  const db = await openPdfCacheDb()
  if (!db) return null
  try {
    const key = pdfCacheEntryKey(userId, slug)
    const tx = db.transaction(IDB_STORE, "readwrite")
    const store = tx.objectStore(IDB_STORE)
    const record = (await idbRequest(store.get(key))) as CachedPdfRecord | undefined
    if (!record || !(record.bytes instanceof ArrayBuffer) || record.bytes.byteLength < 5) {
      return null
    }
    record.updatedAt = Date.now()
    store.put(record)
    await idbTransactionDone(tx).catch(() => {})
    return new Uint8Array(record.bytes)
  } catch {
    return null
  } finally {
    db.close()
  }
}

export async function deleteCachedPdfBytes(
  userId: string | null | undefined,
  slug: string,
): Promise<void> {
  const db = await openPdfCacheDb()
  if (!db) return
  try {
    const tx = db.transaction(IDB_STORE, "readwrite")
    tx.objectStore(IDB_STORE).delete(pdfCacheEntryKey(userId, slug))
    await idbTransactionDone(tx)
  } catch {
    // Ignore IDB errors.
  } finally {
    db.close()
  }
}

async function evictOldestCacheEntries(db: IDBDatabase, keepLimit: number, excludeKey: string) {
  const tx = db.transaction(IDB_STORE, "readwrite")
  const store = tx.objectStore(IDB_STORE)
  const all = (await idbRequest(store.getAll())) as CachedPdfRecord[]
  const others = all
    .filter((item) => item && item.key !== excludeKey)
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
  const toDelete = Math.max(0, others.length - Math.max(0, keepLimit - 1))
  for (let i = 0; i < toDelete; i += 1) {
    store.delete(others[i].key)
  }
  await idbTransactionDone(tx)
}

export async function writeCachedPdfBytes(
  userId: string | null | undefined,
  slug: string,
  bytes: Uint8Array,
): Promise<boolean> {
  if (bytes.byteLength < 5 || bytes.byteLength > MAX_CACHED_PDF_BYTES) return false
  const db = await openPdfCacheDb()
  if (!db) return false
  const normalizedUserId = normalizeReaderUserId(userId)
  const key = pdfCacheEntryKey(normalizedUserId, slug)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const record: CachedPdfRecord = {
    key,
    userId: normalizedUserId,
    slug,
    bytes: buffer,
    byteLength: bytes.byteLength,
    updatedAt: Date.now(),
  }

  try {
    await evictOldestCacheEntries(db, MAX_CACHED_DOCS, key)
    const tx = db.transaction(IDB_STORE, "readwrite")
    tx.objectStore(IDB_STORE).put(record)
    await idbTransactionDone(tx)
    return true
  } catch {
    try {
      await evictOldestCacheEntries(db, 1, key)
      const tx = db.transaction(IDB_STORE, "readwrite")
      tx.objectStore(IDB_STORE).put(record)
      await idbTransactionDone(tx)
      return true
    } catch {
      return false // Quota or private-mode error.
    }
  } finally {
    db.close()
  }
}
