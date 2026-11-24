import assert from "node:assert/strict"
import test from "node:test"
import { createBrowserProjectJournal, createMemoryProjectJournal } from "../src/lib/project-journal.ts"
import { createEditorProjectDraft, parseEditorProjectDraft } from "../src/lib/account-projects.ts"
import { makeProject } from "../src/lib/projects.ts"

const flush = () => new Promise<void>(resolve => setImmediate(resolve))

/** Controlled IndexedDB boundary: request success and durable transaction completion are distinct. */
function controlledDatabase(initial: Array<[string, string]> = []) {
  const values = new Map(initial)
  const transactions: Array<{
    mode: string; operations: string[]; oncomplete?: () => void; onabort?: () => void; onerror?: () => void;
    error?: Error; objectStore: () => unknown; abort: () => void; complete: () => void
  }> = []
  let rejectWrites = false
  const db = {
    onversionchange: null, onclose: null, objectStoreNames: { contains: () => true }, close() {},
    transaction(_name: string, mode: string) {
      const working = new Map(values)
      let aborted = false
      const tx = {
        mode, operations: [] as string[], oncomplete: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined,
        error: undefined as Error | undefined,
        objectStore() {
          return {
            get(key: string) {
              tx.operations.push("get")
              const request = { result: working.get(key), onsuccess: undefined as (() => void) | undefined }
              queueMicrotask(() => request.onsuccess?.())
              return request
            },
            put(value: string, key: string) {
              tx.operations.push("put")
              if (rejectWrites) {
                rejectWrites = false
                queueMicrotask(() => { tx.error = new Error("quota"); tx.onerror?.(); tx.abort() })
              } else working.set(key, value)
              return {}
            },
            delete(key: string) { tx.operations.push("delete"); working.delete(key); return {} },
          }
        },
        abort() { aborted = true; queueMicrotask(() => tx.onabort?.()) },
        complete() {
          if (aborted) return
          if (mode === "readwrite") { values.clear(); for (const [key, value] of working) values.set(key, value) }
          tx.oncomplete?.()
        },
      }
      transactions.push(tx)
      return tx
    },
  }
  const factory = {
    open() {
      const request = { result: db, onsuccess: undefined as (() => void) | undefined }
      queueMicrotask(() => request.onsuccess?.())
      return request
    },
  }
  return { factory: factory as unknown as IDBFactory, transactions, values, rejectNextWrite() { rejectWrites = true } }
}

test("IndexedDB set resolves only after transaction commit, never request success", async () => {
  const fake = controlledDatabase(), journal = createBrowserProjectJournal(fake.factory)
  let saved = false
  const saving = journal.set("account:program", "large-payload").then(() => { saved = true })
  await flush()
  assert.equal(saved, false)
  assert.equal(fake.values.has("account:program"), false)
  assert.equal(fake.transactions[0].mode, "readwrite")
  fake.transactions[0].complete()
  await saving
  assert.equal(saved, true)
  assert.equal(fake.values.get("account:program"), "large-payload")
})

test("IndexedDB mutation reads and updates a generation inside one transaction", async () => {
  const fake = controlledDatabase([["draft", JSON.stringify({ token: "new", base: "old" })]])
  const journal = createBrowserProjectJournal(fake.factory)
  const mutation = journal.mutate("draft", raw => {
    const current = JSON.parse(raw!)
    return current.token === "old" ? null : JSON.stringify({ ...current, base: "acknowledged" })
  })
  await flush()
  assert.equal(fake.transactions.length, 1)
  assert.deepEqual(fake.transactions[0].operations, ["get", "put"])
  assert.equal(JSON.parse(fake.values.get("draft")!).base, "old")
  fake.transactions[0].complete(); await mutation
  assert.deepEqual(JSON.parse(fake.values.get("draft")!), { token: "new", base: "acknowledged" })
})

test("IndexedDB aborted write rejects and cannot report a durable new value", async () => {
  const fake = controlledDatabase([["draft", "original"]]), journal = createBrowserProjectJournal(fake.factory)
  fake.rejectNextWrite()
  const failed = assert.rejects(journal.set("draft", "unsaved"), /место|браузера/)
  await flush(); await failed
  assert.equal(fake.values.get("draft"), "original")
})

test("a failed atomic transform leaves its original record unchanged", async () => {
  const fake = controlledDatabase([["draft", "original"]]), journal = createBrowserProjectJournal(fake.factory)
  const failed = assert.rejects(journal.mutate("draft", () => { throw new Error("invalid generation") }), /резервную копию/)
  await flush(); await failed
  assert.equal(fake.values.get("draft"), "original")
})

test("unavailable IndexedDB fails clearly without falling back to localStorage", async () => {
  await assert.rejects(createBrowserProjectJournal(null as unknown as IDBFactory).set("draft", "payload"), /IndexedDB/)
})

test("journal enumeration and mutation preserve account boundaries", async () => {
  const journal = createMemoryProjectJournal()
  await Promise.all([journal.set("one:p", "private-one"), journal.set("two:p", "private-two")])
  assert.deepEqual(await journal.entries("one:"), [["one:p", "private-one"]])
  await journal.mutate("one:p", () => null)
  assert.equal(await journal.get("one:p"), null)
  assert.equal(await journal.get("two:p"), "private-two")
})

test("a rejected memory transaction leaves journal ordering usable", async () => {
  const journal = createMemoryProjectJournal([["p", "original"]])
  await assert.rejects(journal.mutate("p", () => { throw new Error("bad draft") }))
  assert.equal(await journal.get("p"), "original")
  await journal.set("p", "next")
  assert.equal(await journal.get("p"), "next")
})

test("an older queued acknowledgement cannot clear a newer IndexedDB generation", async () => {
  const project = makeProject("Initial", "spike", "p"), next = { ...project, name: "Latest" }
  const old = createEditorProjectDraft("one", "editor", "p", [project], "[]", "old", 2)
  const latest = createEditorProjectDraft("one", "editor", "p", [next], "[]", "latest", 2)
  const journal = createMemoryProjectJournal([[old.key, JSON.stringify(old)]])
  await Promise.all([
    journal.set(latest.key, JSON.stringify(latest)),
    journal.mutate(old.key, raw => {
      const current = JSON.parse(raw!)
      return current.token === old.token ? null : raw
    }),
  ])
  const restored = parseEditorProjectDraft(latest.key, (await journal.get(latest.key))!, "one")!
  assert.equal(restored.token, "latest")
  assert.equal(restored.projects[0].name, "Latest")
  assert.equal(parseEditorProjectDraft(latest.key, (await journal.get(latest.key))!, "two"), null)
})

test("large target-only editor drafts use the journal without a browser string quota", async () => {
  const program = { ...makeProject("Large", "spike", "p"), workspace: { text: "x".repeat(1_400_000) }, future: { retained: true } }
  const unrelated = makeProject("Other", "ev3", "q")
  const draft = createEditorProjectDraft("one", "editor", "p", [program, unrelated], JSON.stringify([program, unrelated]), "latest", 2)
  const journal = createMemoryProjectJournal()
  await journal.set(draft.key, JSON.stringify(draft))
  const recovered = parseEditorProjectDraft(draft.key, (await journal.get(draft.key))!, "one")!
  assert.equal(recovered.projects.length, 1)
  assert.equal(JSON.parse(recovered.baseRaw!).length, 1)
  assert.deepEqual((recovered.projects[0] as unknown as { future: unknown }).future, { retained: true })
  assert.equal(JSON.stringify(recovered).includes('"id":"q"'), false)
})
