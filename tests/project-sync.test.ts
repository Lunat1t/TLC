import assert from "node:assert/strict"
import test from "node:test"
import { createProjectSync } from "../src/lib/project-sync.ts"
import { makeProject, type RobotProject } from "../src/lib/projects.ts"
import { preserveStoredProject, cacheAccountProjects, cachedAccountProjects, writeEditorProjectDraft, prepareLegacyProjectCopies } from "../src/lib/account-projects.ts"

function storage() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) }, key: (i: number) => [...data.keys()][i] ?? null, get length() { return data.size } }
}
function server(pageSize = 100) {
  const records = new Map<string, { id: string; value: RobotProject | null; revision: number }>()
  const requests: { path: string; method: string; bytes: number }[] = []
  let offline = false, loseAck = false
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    if (offline) throw Error("offline")
    const url = new URL(String(input), "https://tlc.test"), method = init?.method || "GET"
    requests.push({ path: url.pathname, method, bytes: String(init?.body || "").length })
    if (url.pathname === "/api/projects") {
      const after = url.searchParams.get("after") || ""
      const remaining = [...records.values()].sort((a, b) => a.id < b.id ? -1 : 1).filter(row => row.id > after)
      const page = remaining.slice(0, pageSize)
      return Response.json({ userId: "owner", projects: page.map(row => ({ id: row.id, revision: row.revision, deleted: row.value === null })), nextCursor: remaining.length > pageSize ? page.at(-1)!.id : null })
    }
    const id = decodeURIComponent(url.pathname.slice("/api/projects/".length)), old = records.get(id)
    if (method === "GET") return old ? Response.json({ userId: "owner", ...old }) : Response.json({ error: { code: "project_not_found" } }, { status: 404 })
    const body = JSON.parse(init!.body as string)
    if ((old?.revision || 0) !== body.revision) return Response.json({ error: { code: "conflict" } }, { status: 409 })
    const record = { id, value: body.value, revision: body.revision + 1 }
    records.set(id, record)
    if (loseAck) { loseAck = false; throw Error("ack lost") }
    return Response.json({ userId: "owner", ...record })
  }
  return {
    records, requests, request,
    client: (instanceId: string, local = storage(), fetcher = request) => createProjectSync({ userId: "owner", instanceId, storage: local, fetch: fetcher as typeof fetch }),
    offline: (value: boolean) => { offline = value }, loseAck: () => { loseAck = true },
  }
}
const program = (id: string, name = id) => makeProject(name, "spike", id, new Date("2026-11-24T00:00:00Z"))

test("library larger than 3.5 MB saves as separate bounded program requests", async () => {
  const backend = server(), client = backend.client("one"), projects = Array.from({ length: 8 }, (_, i) => ({ ...program(`p${i}`), workspace: { python: "a".repeat(500_000) } }))
  assert.ok(JSON.stringify(projects).length > 3_500_000)
  await client.refresh(); await client.save(projects, [])
  const puts = backend.requests.filter(row => row.method === "PUT")
  assert.equal(puts.length, 8)
  assert.ok(puts.every(row => row.path.startsWith("/api/projects/") && row.bytes < 600_000))
  assert.equal(backend.records.size, 8)
  client.dispose()
})

test("metadata pagination loads each program and refresh fetches only changed payloads", async () => {
  const backend = server(2)
  for (let i = 0; i < 5; i++) backend.records.set(`p${i}`, { id: `p${i}`, value: program(`p${i}`), revision: 1 })
  const client = backend.client("one")
  await client.refresh()
  assert.equal(client.getSnapshot().projects.length, 5)
  const before = backend.requests.length
  backend.records.set("p2", { id: "p2", value: program("p2", "remote"), revision: 2 })
  await client.refresh()
  const reads = backend.requests.slice(before).filter(row => row.path !== "/api/projects")
  assert.deepEqual(reads.map(row => row.path), ["/api/projects/p2"])
  client.dispose()
})

test("devices editing different programs retain both changes", async () => {
  const backend = server(), a = backend.client("a"), b = backend.client("b"), initial = [program("p"), program("q")]
  await a.refresh(); await a.save(initial, []); await b.refresh()
  await a.save([program("p", "remote"), initial[1]], initial)
  await b.save([initial[0], program("q", "local")], initial)
  await b.refresh()
  assert.deepEqual(new Set(b.getSnapshot().projects.map(p => p.name)), new Set(["remote", "local"]))
  a.dispose(); b.dispose()
})

test("same-program conflict preserves local recovery across reopen and cloud choice", async () => {
  const backend = server(), local = storage(), a = backend.client("a"), b = backend.client("b", local), initial = [program("p")]
  await a.refresh(); await a.save(initial, []); await b.refresh()
  await a.save([program("p", "remote")], initial)
  await assert.rejects(b.save([program("p", "local")], initial))
  assert.deepEqual(b.getSnapshot().conflicts, ["p"])
  b.dispose()
  const reopened = backend.client("new", local)
  await assert.rejects(reopened.refresh())
  await reopened.useCloud()
  assert.equal(reopened.getSnapshot().projects[0].name, "remote")
  assert.match(JSON.stringify(reopened.backup()), /local/)
  a.dispose(); reopened.dispose()
})

test("deleted program cannot be recreated by a stale editor or lost creation ack", async () => {
  const backend = server(), local = storage(), a = backend.client("a", local)
  await a.refresh(); backend.loseAck()
  await assert.rejects(a.save([program("p")], []), /ack lost/)
  backend.records.set("p", { id: "p", value: null, revision: 2 })
  await assert.rejects(a.refresh())
  assert.equal(backend.records.get("p")!.value, null)
  a.dispose()
  const reopened = backend.client("new", local)
  await assert.rejects(reopened.refresh())
  assert.equal(backend.records.get("p")!.value, null)
  await reopened.useCloud()
  await assert.rejects(reopened.save([program("p")], []), /удалена/)
  reopened.dispose()
})

test("offline program drafts restore in a different tab without sending whole library", async () => {
  const backend = server(), local = storage(), a = backend.client("a", local)
  await a.refresh(); backend.offline(true)
  await assert.rejects(a.save([program("p")], []))
  a.dispose(); backend.offline(false)
  const next = backend.client("b", local)
  await next.refresh()
  assert.equal(next.getSnapshot().projects[0].id, "p")
  assert.equal(local.length, 0)
  next.dispose()
})

test("old section recovery migrates only changed programs and preserves other programs", async () => {
  const backend = server(), local = storage(), base = [program("p"), program("q")]
  for (const project of base) backend.records.set(project.id, { id: project.id, value: project, revision: 1 })
  backend.records.set("q", { id: "q", value: program("q", "remote q"), revision: 2 })
  local.setItem("tlc-workspace-recovery:owner:projects:old", JSON.stringify({ base, value: [program("p", "local p"), base[1]], revision: 4 }))
  const client = backend.client("new", local)
  await client.refresh()
  assert.equal(backend.records.get("p")!.value!.name, "local p")
  assert.equal(backend.records.get("q")!.value!.name, "remote q")
  assert.equal(local.length, 0)
  client.dispose()
})

test("updates queued during a PUT save the latest program and rebase recovery", async () => {
  const backend = server(), local = storage()
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  let delayed = false
  const client = backend.client("a", local, async (input, init) => {
    if (init?.method === "PUT" && !delayed) { delayed = true; enter(); await gate }
    return backend.request(input, init)
  })
  await client.refresh()
  const first = client.save([program("p", "first")], [])
  await entered
  assert.equal(client.update([program("p", "latest")], [program("p", "first")]), true)
  release(); await first
  assert.equal(backend.records.get("p")!.value!.name, "latest")
  assert.equal(local.length, 0)
  client.dispose()
})

test("accepting cloud archives all conflicting record draft sources", async () => {
  const backend = server(), local = storage()
  backend.records.set("p", { id: "p", value: program("p", "cloud"), revision: 2 })
  for (const instance of ["a", "b"]) local.setItem(`tlc-project-recovery:v2:owner:p:${instance}`, JSON.stringify({ id: "p", base: program("p"), value: program("p", `draft ${instance}`), revision: 1 }))
  const client = backend.client("new", local)
  await assert.rejects(client.refresh())
  await client.useCloud()
  const backup = JSON.stringify(client.backup())
  assert.match(backup, /draft a/); assert.match(backup, /draft b/)
  client.dispose()
})

test("another account's response is rejected before programs become visible", async () => {
  const client = createProjectSync({ userId: "owner", instanceId: "a", storage: storage(), fetch: (async () => Response.json({ userId: "other", projects: [], nextCursor: null })) as typeof fetch })
  await assert.rejects(client.refresh(), /Аккаунт изменился/)
  assert.deepEqual(client.getSnapshot().projects, [])
  assert.equal(client.getSnapshot().ready, false)
  client.dispose()
})

test("editor drafts and optional cache never duplicate a whole multi-megabyte library", async () => {
  const local = storage(), projects = Array.from({ length: 8 }, (_, i) => ({ ...program(`p${i}`), workspace: { code: "x".repeat(500_000) } }))
  const draft = writeEditorProjectDraft(local, "owner", "tab", "p0", projects, JSON.stringify(projects), "latest")
  assert.equal(draft.projects.length, 1)
  assert.equal(JSON.parse(draft.baseRaw!).length, 1)
  assert.ok(local.getItem(draft.key)!.length < 1_100_000)
  const small = Array.from({ length: 20 }, (_, i) => ({ ...program(`small${i}`), workspace: { code: "z".repeat(70_000) } }))
  cacheAccountProjects(local, "owner", small)
  assert.ok(cachedAccountProjects(local, "owner").length < 10)
  assert.ok(local.getItem(draft.key))
  const copies = await prepareLegacyProjectCopies(local, "owner", JSON.stringify(projects), projects)
  assert.equal(copies.length, 8)
  assert.ok(local.getItem("tlc-account-projects-import-plan:owner")!.length < 1000)
})


test("adding another program never rewrites or drops unknown fields of existing records", async () => {
  const backend = server(), client = backend.client("a"), existing = { ...program("p"), futureField: { keep: true } }
  backend.records.set("p", { id: "p", value: existing, revision: 1 })
  await client.refresh()
  const displayed = client.getSnapshot().projects.map(preserveStoredProject)
  await client.save([...displayed, program("q")].map(preserveStoredProject), [existing])
  assert.deepEqual(backend.requests.filter(row => row.method === "PUT").map(row => row.path), ["/api/projects/q"])
  assert.deepEqual(backend.records.get("p")!.value, existing)
  const local = storage(), draft = writeEditorProjectDraft(local, "owner", "tab", "p", [existing], JSON.stringify([existing]), "token")
  assert.deepEqual((draft.projects[0] as typeof existing).futureField, { keep: true })
  client.dispose()
})

import { createMemoryProjectJournal } from "../src/lib/project-journal.ts"

test("large program edits use IndexedDB journal instead of the localStorage quota", async () => {
  const backend = server(), local = storage(), journal = createMemoryProjectJournal()
  const limited = { ...local, get length() { return local.length }, setItem(key: string, value: string) {
    const bytes = Array.from({ length: local.length }, (_, i) => local.key(i)!).filter(k => k !== key).reduce((sum, k) => sum + local.getItem(k)!.length, 0) + value.length
    if (bytes > 5 * 1024 * 1024) throw Error("QuotaExceededError")
    local.setItem(key, value)
  } }
  const original = { ...program("large"), workspace: { code: "x".repeat(1_400_000) } }
  backend.records.set("large", { id: "large", value: original, revision: 1 })
  // A legacy editor backup may still occupy most synchronous storage during transition.
  writeEditorProjectDraft(limited, "owner", "legacy", "large", [original], JSON.stringify([original]), "old")
  const client = createProjectSync({ userId: "owner", instanceId: "new", storage: limited, journal, fetch: backend.request as typeof fetch })
  await client.refresh()
  await client.save([{ ...original, name: "Renamed" }], [original])
  assert.equal(backend.records.get("large")!.value!.name, "Renamed")
  assert.equal(backend.requests.filter(row => row.method === "PUT").length, 1)
  client.dispose()
})

test("cloud PUT waits for durable journal completion and refuses failed transactions", async () => {
  const backend = server(), journal = createMemoryProjectJournal()
  let fail = false
  const client = createProjectSync({ userId: "owner", instanceId: "a", storage: storage(), fetch: backend.request as typeof fetch, journal: { ...journal, async set(key, value) { if (fail) throw Error("disk full"); await journal.set(key, value) } } })
  await client.refresh(); fail = true
  await assert.rejects(client.save([program("p")], []), /disk full/)
  assert.equal(backend.requests.filter(row => row.method === "PUT").length, 0)
  assert.equal(client.getSnapshot().projects[0].id, "p")
  fail = false; await client.refresh()
  assert.equal(backend.records.get("p")!.value!.id, "p")
  client.dispose()
})

test("project flush drains queued program writes before sign-out and skips extra reads when idle", async () => {
  const backend = server(), journal = createMemoryProjectJournal()
  const baseFetch = backend.request as typeof fetch
  let delayed = false
  const client = createProjectSync({
    userId: "owner",
    instanceId: "a",
    storage: storage(),
    journal,
    fetch: async (url, init) => {
      if (delayed && init?.method === "PUT") await new Promise(resolve => setTimeout(resolve, 25))
      return baseFetch(url, init)
    },
  })
  await client.refresh()
  const requestsBeforeIdleFlush = backend.requests.length
  await client.flush()
  assert.equal(backend.requests.length, requestsBeforeIdleFlush)

  delayed = true
  assert.equal(client.update([program("p1")], []), true)
  await client.flush()
  assert.equal(backend.records.get("p1")?.value?.id, "p1")
  assert.equal(client.getSnapshot().saving, false)
  client.dispose()
})

test("deferred push uploads programs only on flush and survives reloads", async () => {
  const backend = server(), local = storage()
  const make = () => createProjectSync({ userId: "owner", instanceId: "device", storage: local, fetch: backend.request as typeof fetch, deferPush: true })
  const a = make()
  await a.refresh()
  const kept = program("kept"), dropped = program("dropped")
  await a.save([kept, dropped], [])
  await a.save([kept], [kept, dropped])
  await a.refresh()
  assert.equal(backend.requests.filter(row => row.method === "PUT").length, 0)
  a.dispose()
  for (const name of ["second", "third"]) {
    const page = make()
    await page.refresh()
    await page.save([program("kept", name)], page.getSnapshot().projects)
    assert.deepEqual(page.getSnapshot().conflicts, [])
    page.dispose()
  }
  const last = make()
  await last.flush()
  assert.deepEqual([...backend.records.keys()], ["kept"])
  assert.equal(backend.records.get("kept")!.value!.name, "third")
  assert.equal(local.length, 0)
  const other = backend.client("other")
  await other.refresh()
  assert.deepEqual(other.getSnapshot().projects.map(p => p.name), ["third"])
  last.dispose(); other.dispose()
})
