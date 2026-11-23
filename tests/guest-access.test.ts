import assert from "node:assert/strict"
import test from "node:test"
import { classifyMiddlewareRoute, getAnonymousRedirect } from "../src/lib/auth-destination.ts"
import {
  GUEST_WORKSPACE_PREFIX,
  guestWorkspaceKey,
  readGuestWorkspaceValues,
  writeGuestWorkspaceSection,
} from "../src/lib/guest-workspace.ts"

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
    dump() {
      return Object.fromEntries(map.entries())
    },
  }
}

test("middleware gate allows anonymous visitors on /dashboard and /editor without /login redirect", () => {
  assert.equal(classifyMiddlewareRoute("/dashboard").guestWorkspacePage, true)
  assert.equal(classifyMiddlewareRoute("/editor").guestWorkspacePage, true)
  assert.equal(getAnonymousRedirect("/dashboard"), null)
  assert.equal(getAnonymousRedirect("/editor", "?id=p1"), null)
})

test("middleware gate still redirects anonymous visitors on protected routes to /login", () => {
  assert.equal(getAnonymousRedirect("/map"), "/login?next=%2Fmap")
  assert.equal(getAnonymousRedirect("/instructions"), "/login?next=%2Finstructions")
  assert.equal(getAnonymousRedirect("/instructions/abc", "?tab=2"), "/login?next=%2Finstructions%2Fabc%3Ftab%3D2")
  assert.equal(getAnonymousRedirect("/teacher/roadmap"), "/login?next=%2Fteacher%2Froadmap")
  assert.equal(getAnonymousRedirect("/admin/instructions/drive"), "/login?next=%2Fadmin%2Finstructions%2Fdrive")
})

test("guest workspace storage is strictly scoped under :guest keys and ignores corrupt entries", () => {
  const storage = createMemoryStorage({
    [guestWorkspaceKey("settings")]: "{bad-json",
    [guestWorkspaceKey("board")]: JSON.stringify({ notAnArray: true }),
    "tlc-lab-board-v1:user-123": JSON.stringify([{ id: "n1" }]),
  })

  assert.deepEqual(readGuestWorkspaceValues(storage), {})

  assert.equal(writeGuestWorkspaceSection(storage, "settings", { theme: "dark", color: "#112233" }), true)
  assert.equal(writeGuestWorkspaceSection(storage, "layout", { clock: { x: 0.5, y: 0.2, z: 1 } }), true)
  assert.equal(writeGuestWorkspaceSection(storage, "board", [{ id: "g1", kind: "note", text: "Hi", color: "yellow" }]), true)

  const readBack = readGuestWorkspaceValues(storage)
  assert.deepEqual(readBack.settings, { theme: "dark", color: "#112233" })
  assert.deepEqual(readBack.layout, { clock: { x: 0.5, y: 0.2, z: 1 } })
  assert.deepEqual(readBack.board, [{ id: "g1", kind: "note", text: "Hi", color: "yellow" }])

  for (const key of Object.keys(storage.dump())) {
    if (key.startsWith(GUEST_WORKSPACE_PREFIX)) {
      assert.ok(key.includes(":guest") || key.startsWith("tlc-workspace-guest:v1:"))
    }
  }
})
