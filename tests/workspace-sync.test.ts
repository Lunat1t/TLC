import assert from "node:assert/strict"
import test from "node:test"
import { createWorkspaceSync, mergeWorkspaceSection } from "../src/lib/workspace-sync.ts"

function storage() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) }, key: (i: number) => [...data.keys()][i] ?? null, get length() { return data.size } }
}
function server() {
  const rows = new Map<string, { section: string; value: unknown; revision: number }>()
  let offline = false
  const request = async (_url: string, init?: RequestInit) => {
    if (offline) throw Error("offline")
    if (init?.method !== "PUT") return Response.json({ userId: "one", sections: [...rows.values()] })
    const body = JSON.parse(init.body as string)
    const old = rows.get(body.section)
    if ((old?.revision || 0) !== body.revision) return Response.json({ error: { code: "conflict" } }, { status: 409 })
    const revision = body.revision + 1
    rows.set(body.section, { section: body.section, value: JSON.parse(JSON.stringify(body.value)), revision })
    return Response.json({ userId: "one", revision })
  }
  const client = (tabId: string, local = storage(), fetch = request) => createWorkspaceSync({ userId: "one", tabId, storage: local, fetch })
  return { client, rows, request, offline: (value: boolean) => { offline = value } }
}

test("two devices synchronize programs, shortcuts and positions after refresh", async () => {
  const backend = server(), a = backend.client("a"), b = backend.client("b")
  await Promise.all([a.refresh(), b.refresh()])
  await a.save("projects", [{ id: "p", name: "Робот", workspace: { blocks: [1] } }], [])
  await a.save("layout", { "project:p": { x: .3, y: .7, z: 1 } })
  await a.save("board", [{ id: "link", text: "Каталог", kind: "shortcut" }])
  await b.refresh()
  assert.deepEqual(b.getSnapshot().values, a.getSnapshot().values)
  a.dispose(); b.dispose()
})

test("stale devices merge different programs without removing either", async () => {
  const backend = server(), a = backend.client("a"), b = backend.client("b")
  await Promise.all([a.refresh(), b.refresh()])
  await a.save("projects", [{ id: "a", name: "A" }], [])
  await b.save("projects", [{ id: "b", name: "B" }], [])
  await a.refresh()
  assert.deepEqual(new Set((a.getSnapshot().values.projects as { id: string }[]).map(p => p.id)), new Set(["a", "b"]))
  a.dispose(); b.dispose()
})

test("concurrent different-card and position edits merge at entity boundaries", async () => {
  const backend = server(), a = backend.client("a"), b = backend.client("b")
  await a.refresh(); await a.save("board", [{ id: "a", text: "a" }, { id: "b", text: "b" }]); await b.refresh()
  await a.save("board", [{ id: "a", text: "new a" }, { id: "b", text: "b" }])
  await b.save("board", [{ id: "a", text: "a" }, { id: "b", text: "new b" }])
  await a.save("layout", { a: { x: 1 } })
  await b.save("layout", { b: { x: 2 } })
  await a.refresh()
  assert.deepEqual(a.getSnapshot().values.board, [{ id: "a", text: "new a" }, { id: "b", text: "new b" }])
  assert.deepEqual(a.getSnapshot().values.layout, { a: { x: 1 }, b: { x: 2 } })
  a.dispose(); b.dispose()
})

test("same-program conflict preserves local work and remote version", async () => {
  const backend = server(), local = storage(), a = backend.client("a"), b = backend.client("b", local)
  await a.refresh(); await a.save("projects", [{ id: "p", name: "initial" }]); await b.refresh()
  await a.save("projects", [{ id: "p", name: "remote" }])
  await assert.rejects(b.save("projects", [{ id: "p", name: "local" }]), /пересеклись/)
  assert.deepEqual(b.getSnapshot().conflicts, ["projects"])
  assert.equal((backend.rows.get("projects")!.value as { name: string }[])[0].name, "remote")
  assert.match(JSON.stringify(b.backup()), /local/)
  b.dispose()
  const reopened = backend.client("new-tab", local)
  await assert.rejects(reopened.refresh(), /пересеклись/)
  await reopened.useCloud()
  assert.equal((reopened.getSnapshot().values.projects as { name: string }[])[0].name, "remote")
  assert.match(JSON.stringify(reopened.backup()), /local/)
  a.dispose(); reopened.dispose()
})

test("offline changes survive a different-tab reopen and retry on reconnect", async () => {
  const backend = server(), local = storage(), a = backend.client("a", local)
  await a.refresh(); backend.offline(true)
  await assert.rejects(a.save("board", [{ id: "n", text: "offline note" }]), /offline/)
  assert.equal(a.getSnapshot().ready, true)
  a.dispose(); backend.offline(false)
  const reopened = backend.client("new-tab", local)
  await reopened.refresh()
  assert.deepEqual(backend.rows.get("board")!.value, [{ id: "n", text: "offline note" }])
  assert.equal(local.length, 0)
  reopened.dispose()
})

test("rapid updates arriving during a PUT are saved sequentially", async () => {
  const backend = server()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  let delayed = false
  const client = backend.client("a", storage(), async (url, init) => {
    if (init?.method === "PUT" && !delayed) { delayed = true; entered(); await gate }
    return backend.request(url, init)
  })
  await client.refresh()
  const first = client.save("layout", { a: { x: .1 } })
  await started
  assert.equal(client.update("layout", { a: { x: .2 } }), true)
  release(); await first
  assert.deepEqual(backend.rows.get("layout")!.value, { a: { x: .2 } })
  assert.equal(backend.rows.get("layout")!.revision, 2)
  client.dispose()
})

test("stale editor snapshots merge another program but reject changed active program", async () => {
  const backend = server(), a = backend.client("a")
  await a.refresh()
  const initial = [{ id: "p", text: "first" }]
  await a.save("projects", initial)
  await a.save("projects", [...initial, { id: "q", text: "other" }])
  await a.save("projects", [{ id: "p", text: "edited" }], initial)
  assert.equal((a.getSnapshot().values.projects as unknown[]).length, 2)
  await assert.rejects(a.save("projects", [{ id: "p", text: "stale edit" }], initial), /изменена/)
  a.dispose()
})

test("merging compares JSON data independent of PostgreSQL object key order", () => {
  const base = [{ id: "p", name: "Robot", workspace: { blocks: [] } }]
  const remote = [{ workspace: { blocks: [] }, name: "Robot", id: "p" }, { id: "q" }]
  const result = mergeWorkspaceSection("projects", base, [{ ...base[0], name: "Renamed" }], remote)
  assert.equal(result.conflict, false)
  assert.equal((result.value as { name?: string }[])[0].name, "Renamed")
})

test("delete-versus-edit conflicts; unchanged deletion never resurrects an item", () => {
  assert.equal(mergeWorkspaceSection("board", [{ id: "p", text: "old" }], [], [{ id: "p", text: "new" }]).conflict, true)
  assert.deepEqual(mergeWorkspaceSection("board", [{ id: "p" }], [{ id: "p" }, { id: "q" }], []).value, [{ id: "q" }])
})

test("account mismatch never loads data or writes pending changes", async () => {
  let puts = 0
  const client = createWorkspaceSync({ userId: "one", tabId: "a", storage: storage(), fetch: async (_url, init) => {
    if (init?.method === "PUT") puts++
    return Response.json({ userId: "other", sections: [{ section: "board", value: [{ id: "private" }], revision: 1 }] })
  } })
  await assert.rejects(client.refresh(), /Аккаунт изменился/)
  assert.deepEqual(client.getSnapshot().values, {})
  assert.equal(puts, 0)
  client.dispose()
})


test("an update during a conflict cannot wedge retry or accepting cloud", async () => {
  const backend = server(), a = backend.client("a"), b = backend.client("b")
  await a.refresh(); await a.save("projects", [{ id: "p", name: "initial" }]); await b.refresh()
  await a.save("projects", [{ id: "p", name: "remote" }])
  await assert.rejects(b.save("projects", [{ id: "p", name: "local" }]))
  assert.equal(b.update("layout", { item: { x: .3 } }), true)
  await new Promise(resolve => setTimeout(resolve, 0))
  await b.useCloud()
  await b.refresh()
  assert.deepEqual(b.getSnapshot().conflicts, [])
  assert.equal(b.getSnapshot().error, "")
  a.dispose(); b.dispose()
})


test("accepting cloud archives every conflicting tab draft", async () => {
  const backend = server(), local = storage()
  backend.rows.set("projects", { section: "projects", value: [{ id: "p", text: "cloud" }], revision: 2 })
  for (const tab of ["A", "B"]) local.setItem(`tlc-workspace-recovery:one:projects:${tab}`, JSON.stringify({ base: [{ id: "p", text: "original" }], value: [{ id: "p", text: `draft ${tab}` }], revision: 1 }))
  const client = backend.client("A", local)
  await assert.rejects(client.refresh())
  await client.useCloud()
  const backup = JSON.stringify(client.backup())
  assert.match(backup, /draft A/)
  assert.match(backup, /draft B/)
  client.dispose()
})

// Editor drafts retain the newest queued edit independently of network latency.
import { prepareLegacyProjectCopies, writeEditorProjectDraft, readEditorProjectDrafts, clearEditorProjectDraft, acknowledgeEditorProjectDraft } from "../src/lib/account-projects.ts"
import { makeProject } from "../src/lib/projects.ts"

test("editor drafts are isolated by account and editor instance", () => {
  const local = storage(), p = makeProject("Robot", "spike", "p")
  writeEditorProjectDraft(local, "one", "tab-a", "p", [p], "[]", "a")
  writeEditorProjectDraft(local, "one", "tab-b", "p", [p], "[]", "b")
  writeEditorProjectDraft(local, "two", "tab-a", "p", [p], "[]", "c")
  assert.equal(readEditorProjectDrafts(local, "one").length, 2)
  assert.equal(readEditorProjectDrafts(local, "two").length, 1)
})

test("old acknowledgement rebases latest queued draft and it restores without false conflict", async () => {
  const backend = server(), local = storage(), client = backend.client("a")
  const p0 = makeProject("Initial", "spike", "p"), p1 = { ...p0, name: "First edit" }, p2 = { ...p0, name: "Latest edit" }
  await client.refresh(); await client.save("projects", [p0])
  const first = writeEditorProjectDraft(local, "one", "tab", "p", [p1], JSON.stringify([p0]), "first")
  writeEditorProjectDraft(local, "one", "tab", "p", [p2], JSON.stringify([p0]), "latest")
  await client.save("projects", [p1], [p0])
  acknowledgeEditorProjectDraft(local, first, JSON.stringify([p1]))
  const [draft] = readEditorProjectDrafts(local, "one")
  assert.equal(draft.token, "latest")
  assert.equal(draft.projects[0].name, "Latest edit")
  assert.deepEqual(JSON.parse(draft.baseRaw!), [p1])
  const reopened = backend.client("new-tab")
  await reopened.refresh()
  await reopened.save("projects", draft.projects, JSON.parse(draft.baseRaw!))
  assert.equal((backend.rows.get("projects")!.value as { name: string }[])[0].name, "Latest edit")
  assert.equal(clearEditorProjectDraft(local, first), false)
  acknowledgeEditorProjectDraft(local, draft, JSON.stringify(draft.projects))
  assert.equal(readEditorProjectDrafts(local, "one").length, 0)
  client.dispose(); reopened.dispose()
})

test("corrupt editor draft remains untouched for manual recovery", () => {
  const local = storage(), key = "tlc-editor-program-draft:v1:one:tab:p"
  local.setItem(key, "{invalid")
  assert.deepEqual(readEditorProjectDrafts(local, "one"), [])
  assert.equal(local.getItem(key), "{invalid")
})

test("storage failure refuses an edit before reporting durable draft success", () => {
  const local = storage()
  assert.throws(() => writeEditorProjectDraft({ ...local, setItem() { throw Error("quota") } }, "one", "tab", "p", [makeProject("Robot", "spike", "p")], "[]", "token"), /quota/)
})


import { writeNoteDraft, readNoteDrafts, archiveNoteDrafts } from "../src/lib/note-drafts.ts"

test("legacy import retries reuse IDs after reconnect saved a previously failed PUT", async () => {
  const backend = server(), local = storage(), client = backend.client("a")
  const old = [makeProject("Legacy", "spike", "local-id")], source = JSON.stringify(old)
  await client.refresh()
  const copies = await prepareLegacyProjectCopies(local, "one", source, old)
  backend.offline(true)
  await assert.rejects(client.save("projects", copies, []))
  backend.offline(false); await client.refresh()
  const retry = await prepareLegacyProjectCopies(local, "one", source, old)
  assert.deepEqual(retry, copies)
  const stored = client.getSnapshot().values.projects as { id: string }[]
  assert.equal(retry.filter(p => !stored.some(remote => remote.id === p.id)).length, 0)
  assert.equal(stored.length, 1)
  assert.notEqual((await prepareLegacyProjectCopies(local, "two", source, old))[0].id, copies[0].id)
  client.dispose()
})

test("dirty note text survives close before debounce and account boundaries", () => {
  const local = storage()
  writeNoteDraft(local, "one", "note", "tab-a", "my unsent text", "base")
  assert.equal(readNoteDrafts(local, "one", "note")[0].value.text, "my unsent text")
  assert.deepEqual(readNoteDrafts(local, "two", "note"), [])
  archiveNoteDrafts(local, "one", "note")
  assert.deepEqual(readNoteDrafts(local, "one", "note"), [])
  assert.match(local.getItem(local.key(0)!)!, /my unsent text/)
})


test("a slow card upload merges against its opening snapshot after remote refresh", async () => {
  const backend = server(), a = backend.client("a"), b = backend.client("b")
  await Promise.all([a.refresh(), b.refresh()])
  const uploadStartedFrom: unknown[] = []
  await a.save("board", [{ id: "remote", kind: "note" }])
  await b.refresh()
  assert.equal(b.update("board", [{ id: "upload", kind: "image" }], uploadStartedFrom), true)
  await b.refresh()
  assert.deepEqual(new Set((backend.rows.get("board")!.value as { id: string }[]).map(p => p.id)), new Set(["remote", "upload"]))
  a.dispose(); b.dispose()
})


test("new workspace transport excludes frozen library and leaves its drafts for record migration", async () => {
  const local = storage()
  local.setItem("tlc-workspace-recovery:one:projects:old", JSON.stringify({ base: [], value: [{ id: "legacy" }], revision: 0 }))
  let recordsHeader = ""
  const client = createWorkspaceSync({ userId: "one", tabId: "new", storage: local, sections: ["settings", "layout", "board"], fetch: async (_url, init) => {
    recordsHeader = new Headers(init?.headers).get("X-TLC-Program-Storage") || ""
    assert.notEqual(init?.method, "PUT")
    return Response.json({ userId: "one", sections: [{ section: "projects", value: [{ id: "old" }], revision: 1 }] })
  } })
  await client.refresh()
  assert.equal(recordsHeader, "records")
  assert.equal(client.getSnapshot().values.projects, undefined)
  assert.equal(local.length, 1)
  client.dispose()
})
