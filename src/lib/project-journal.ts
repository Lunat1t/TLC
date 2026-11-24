/** Durable recovery payloads live outside localStorage's small synchronous quota. */
export type ProjectJournal = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  entries(prefix: string): Promise<Array<[string, string]>>
  mutate(key: string, transform: (value: string | null) => string | null): Promise<void>
}

const unavailable = () => new Error("Этот браузер не поддерживает надёжное локальное хранение программ (IndexedDB). Откройте Brick Studio в другом браузере.")
function storageError(cause: unknown) {
  return new Error("Не удалось сохранить или прочитать резервную копию программы на устройстве. Проверьте доступное место и настройки браузера.", { cause })
}

export function createBrowserProjectJournal(factory: IDBFactory | undefined = globalThis.indexedDB): ProjectJournal {
  let database: Promise<IDBDatabase> | null = null
  function open(): Promise<IDBDatabase> {
    if (!factory) return Promise.reject(unavailable())
    if (database) return database
    const requestPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false
      let request: IDBOpenDBRequest
      try { request = factory.open("tlc-project-journal-v1", 1) } catch (error) { reject(storageError(error)); return }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("records")) request.result.createObjectStore("records")
      }
      request.onerror = () => { settled = true; reject(storageError(request.error)) }
      request.onblocked = () => { settled = true; reject(new Error("Хранилище программ занято другой вкладкой. Закройте старые вкладки Brick Studio и повторите.")) }
      request.onsuccess = () => {
        const db = request.result
        if (settled) { db.close(); return }
        settled = true
        db.onversionchange = () => { db.close(); database = null }
        db.onclose = () => { database = null }
        resolve(db)
      }
    })
    database = requestPromise
    void requestPromise.catch(() => { if (database === requestPromise) database = null })
    return requestPromise
  }
  async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, result: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction
      try { tx = db.transaction("records", mode) } catch (error) { reject(storageError(error)); return }
      let value: T, failed: unknown = null
      const fail = (error: unknown) => { failed = error; try { tx.abort() } catch { reject(storageError(error)) } }
      tx.oncomplete = () => resolve(value)
      tx.onabort = () => reject(storageError(failed ?? tx.error))
      tx.onerror = () => { failed ??= tx.error }
      try { action(tx.objectStore("records"), result => { value = result }, fail) } catch (error) { fail(error) }
    })
  }
  function stringValue(value: unknown): string | null {
    if (value === undefined) return null
    if (typeof value !== "string") throw new Error("Журнал программ повреждён.")
    return value
  }
  return {
    get: key => transaction("readonly", (store, result, fail) => {
      const request = store.get(key)
      request.onsuccess = () => { try { result(stringValue(request.result)) } catch (error) { fail(error) } }
    }),
    set: (key, value) => transaction<void>("readwrite", store => { store.put(value, key) }),
    remove: key => transaction<void>("readwrite", store => { store.delete(key) }),
    entries: prefix => transaction<Array<[string, string]>>("readonly", (store, result, fail) => {
      const values: Array<[string, string]> = []
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) { result(values); return }
        try {
          if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
            const value = stringValue(cursor.value)
            if (value !== null) values.push([cursor.key, value])
          }
          cursor.continue()
        } catch (error) { fail(error) }
      }
    }),
    mutate: (key, transform) => transaction<void>("readwrite", (store, _result, fail) => {
      const request = store.get(key)
      request.onsuccess = () => {
        try {
          const value = transform(stringValue(request.result))
          if (value === null) store.delete(key)
          else if (typeof value === "string") store.put(value, key)
          else throw new Error("Неверное значение журнала программ.")
        } catch (error) { fail(error) }
      }
    }),
  }
}

/** The same atomic ordering for deterministic sync/recovery tests. No browser fallback. */
export function createMemoryProjectJournal(initial: Iterable<[string, string]> = []): ProjectJournal {
  const values = new Map(initial)
  let tail: Promise<unknown> = Promise.resolve()
  function run<T>(action: () => T): Promise<T> {
    const task = tail.catch(() => {}).then(action)
    tail = task
    return task
  }
  return {
    get: key => run(() => values.get(key) ?? null),
    set: (key, value) => run(() => { values.set(key, value) }),
    remove: key => run(() => { values.delete(key) }),
    entries: prefix => run(() => [...values].filter(([key]) => key.startsWith(prefix))),
    mutate: (key, transform) => run(() => {
      const next = transform(values.get(key) ?? null)
      if (next === null) values.delete(key)
      else values.set(key, next)
    }),
  }
}
