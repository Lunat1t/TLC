/**
 * Библиотека звуков: готовые звуки и записи ученика.
 * Записи лежат в IndexedDB этого браузера; хранилище подменяется в тестах.
 */
import { SOUND_PRESETS, findSoundPreset, presetDuration, renderPreset } from "./presets.ts"
import { encodeWav } from "./wav.ts"

export const MAX_RECORDINGS = 50
export const MAX_SOUND_NAME = 40
export const MISSING_SOUND_NAME = "Звук не найден"

export interface SoundInfo {
  id: string
  name: string
  kind: "preset" | "recording"
  /** Длительность в секундах. */
  duration: number
}

export interface Recording {
  id: string
  name: string
  duration: number
  createdAt: number
  /** WAV-файл целиком. */
  data: ArrayBuffer
}

export interface RecordingStore {
  list(): Promise<Recording[]>
  get(id: string): Promise<Recording | undefined>
  put(recording: Recording): Promise<void>
  remove(id: string): Promise<void>
}

export function cleanSoundName(name: string, fallback = "Моя запись"): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_SOUND_NAME).trim() || fallback
}

/** «Запись 3»: первый свободный номер. */
export function nextRecordingName(existing: readonly { name: string }[]): string {
  const taken = new Set(existing.map(item => item.name))
  let index = 1
  while (taken.has(`Запись ${index}`)) index++
  return `Запись ${index}`
}

export function filterSounds<T extends { name: string }>(sounds: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase("ru")
  return needle ? sounds.filter(sound => sound.name.toLocaleLowerCase("ru").includes(needle)) : [...sounds]
}

export function memoryRecordingStore(): RecordingStore {
  const items = new Map<string, Recording>()
  return {
    async list() { return [...items.values()] },
    async get(id) { return items.get(id) },
    async put(recording) { items.set(recording.id, recording) },
    async remove(id) { items.delete(id) },
  }
}

const DB_NAME = "tlc-sounds"
const STORE = "recordings"

export function indexedDbRecordingStore(): RecordingStore {
  let opening: Promise<IDBDatabase> | null = null
  const open = () => {
    if (opening) return opening
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("Браузер не даёт сохранить записи."))
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: "id" }) }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error("Не удалось открыть библиотеку звуков."))
    })
    opening.catch(() => { opening = null })
    return opening
  }
  const run = async <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = action(transaction.objectStore(STORE))
      // Ждём завершения транзакции: только тогда запись действительно сохранена.
      transaction.oncomplete = () => resolve(request.result as T)
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error ?? new Error("Не удалось сохранить звук. Возможно, закончилось место."))
    })
  }
  return {
    list: () => run<Recording[]>("readonly", store => store.getAll()),
    get: id => run<Recording | undefined>("readonly", store => store.get(id)),
    put: async recording => { await run("readwrite", store => store.put(recording)) },
    remove: async id => { await run("readwrite", store => store.delete(id)) },
  }
}

export function createSoundLibrary(store: RecordingStore, newId: () => string = () => globalThis.crypto.randomUUID()) {
  const listeners = new Set<() => void>()
  const changed = () => { for (const listener of listeners) listener() }
  const presets: SoundInfo[] = SOUND_PRESETS.map(preset => ({
    id: preset.id, name: preset.name, kind: "preset", duration: presetDuration(preset),
  }))
  const recordings = async (): Promise<SoundInfo[]> =>
    (await store.list())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ id, name, duration }) => ({ id, name, duration, kind: "recording" }))

  return {
    presets,
    recordings,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async find(id: string): Promise<SoundInfo | null> {
      const preset = presets.find(item => item.id === id)
      if (preset) return preset
      const found = await store.get(id)
      return found ? { id, name: found.name, duration: found.duration, kind: "recording" } : null
    },
    /** WAV-байты звука или null, если записи на этом устройстве нет. */
    async data(id: string): Promise<ArrayBuffer | null> {
      const preset = findSoundPreset(id)
      if (preset) return encodeWav(renderPreset(preset)).buffer
      return (await store.get(id))?.data ?? null
    },
    async add(input: { name?: string; data: ArrayBuffer; duration: number; createdAt?: number }): Promise<SoundInfo> {
      const existing = await store.list()
      if (existing.length >= MAX_RECORDINGS) throw new Error(`В библиотеке уже ${MAX_RECORDINGS} записей. Удалите ненужные.`)
      const recording: Recording = {
        id: `rec:${newId()}`,
        name: cleanSoundName(input.name ?? "", nextRecordingName(existing)),
        duration: input.duration,
        createdAt: input.createdAt ?? Date.now(),
        data: input.data,
      }
      await store.put(recording)
      changed()
      return { id: recording.id, name: recording.name, duration: recording.duration, kind: "recording" }
    },
    async rename(id: string, name: string): Promise<void> {
      const found = await store.get(id)
      if (!found) return
      await store.put({ ...found, name: cleanSoundName(name, found.name) })
      changed()
    },
    async remove(id: string): Promise<void> {
      await store.remove(id)
      changed()
    },
  }
}

export type SoundLibrary = ReturnType<typeof createSoundLibrary>

export const soundLibrary: SoundLibrary = createSoundLibrary(indexedDbRecordingStore())
