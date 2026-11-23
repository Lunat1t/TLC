import assert from "node:assert/strict"
import test from "node:test"
import {
  checkInstructionGateWithClient,
  requireInstructionGateWithClient,
  type GateSupabaseClient,
} from "../src/lib/instructions/roadmap-gate-core.ts"

function mockClient(opts: {
  userId?: string | null
  authError?: { status?: number } | null
  profile?: { role?: string; onboarding_complete?: boolean } | null
  profileError?: { code?: string; message?: string } | null
  canPublish?: boolean
  publishError?: { code?: string; message?: string } | null
  accessData?: unknown
  accessError?: { code?: string; message?: string } | null
  onRpc?: (fn: string) => void
}): GateSupabaseClient {
  return {
    auth: {
      async getUser() {
        return {
          data: { user: opts.userId ? { id: opts.userId } : null },
          error: opts.authError ?? null,
        }
      },
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: opts.profile ?? null,
                    error: opts.profileError ?? null,
                  }
                },
              }
            },
          }
        },
      }
    },
    async rpc(fn: string) {
      opts.onRpc?.(fn)
      if (fn === "can_publish_instruction") {
        return { data: opts.canPublish ?? false, error: opts.publishError ?? null }
      }
      if (fn === "tlc_instruction_access") {
        return { data: opts.accessData ?? null, error: opts.accessError ?? null }
      }
      return { data: null, error: { code: "42883", message: "unexpected rpc" } }
    },
  }
}

test("checkInstructionGateWithClient blocks anonymous callers with 401 before RPC", async () => {
  const rpcCalls: string[] = []
  const client = mockClient({
    userId: null,
    onRpc: (fn) => rpcCalls.push(fn),
  })
  const res = await checkInstructionGateWithClient(client, "spike-prime-0045")
  assert.equal(res.allowed, false)
  if (!res.allowed) {
    assert.equal(res.status, 401)
    assert.equal(res.code, "unauthenticated")
  }
  assert.deepEqual(rpcCalls, [])

  await assert.rejects(
    () => requireInstructionGateWithClient(client, "spike-prime-0045"),
    (err: Error & { status?: number; code?: string }) =>
      err.status === 401 && err.code === "unauthenticated",
  )
})

test("checkInstructionGateWithClient blocks parent and incomplete onboarding with 403", async () => {
  const rpcCalls: string[] = []
  const parentClient = mockClient({
    userId: "parent-1",
    profile: { role: "parent", onboarding_complete: true },
    canPublish: false,
    onRpc: (fn) => rpcCalls.push(fn),
  })
  const parentRes = await checkInstructionGateWithClient(parentClient, "spike-prime-0045")
  assert.equal(parentRes.allowed, false)
  if (!parentRes.allowed) {
    assert.equal(parentRes.status, 403)
    assert.equal(parentRes.code, "forbidden")
  }
  assert.deepEqual(rpcCalls, ["can_publish_instruction"])

  await assert.rejects(
    () => requireInstructionGateWithClient(parentClient, "spike-prime-0045"),
    (err: Error & { status?: number; code?: string }) =>
      err.status === 403 && err.code === "forbidden",
  )

  const unboardedStudent = mockClient({
    userId: "student-new",
    profile: { role: "student", onboarding_complete: false },
    canPublish: false,
  })
  const unboardedRes = await checkInstructionGateWithClient(unboardedStudent, "spike-prime-0045")
  assert.equal(unboardedRes.allowed, false)
  if (!unboardedRes.allowed) assert.equal(unboardedRes.status, 403)
})

test("checkInstructionGateWithClient allows onboarded student for rank 0 and teacher/admin bypass", async () => {
  const studentClient = mockClient({
    userId: "student-1",
    profile: { role: "student", onboarding_complete: true },
    canPublish: false,
    accessData: { exists: true, allowed: true, required_rank: 0 },
  })
  const studentRes = await checkInstructionGateWithClient(studentClient, "spike-prime-0045")
  assert.deepEqual(studentRes, { allowed: true })

  const teacherClient = mockClient({
    userId: "teacher-1",
    profile: { role: "teacher", onboarding_complete: true },
    canPublish: true,
    accessData: { exists: true, allowed: true, bypass: true, required_rank: 2 },
  })
  const teacherRes = await checkInstructionGateWithClient(teacherClient, "spike-prime-0045")
  assert.deepEqual(teacherRes, { allowed: true })
})

test("checkInstructionGateWithClient fails closed on auth/profile outage and keeps migrationPending safe", async () => {
  const authOutage = mockClient({
    userId: null,
    authError: { status: 503 },
  })
  await assert.rejects(
    () => checkInstructionGateWithClient(authOutage, "spike-prime-0045"),
    (err: Error & { status?: number }) => err.status === 503,
  )

  const profileOutage = mockClient({
    userId: "student-1",
    profileError: { code: "57014", message: "timeout" },
    canPublish: false,
  })
  await assert.rejects(
    () => checkInstructionGateWithClient(profileOutage, "spike-prime-0045"),
    (err: Error & { status?: number }) => err.status === 503,
  )

  const studentPendingMigration = mockClient({
    userId: "student-1",
    profile: { role: "student", onboarding_complete: true },
    canPublish: false,
    accessError: { code: "PGRST202", message: "function not found" },
  })
  assert.deepEqual(
    await checkInstructionGateWithClient(studentPendingMigration, "spike-prime-0045"),
    { allowed: true, migrationPending: true },
  )
})

test("checkInstructionGateWithClient maps subscription_required to 403", async () => {
  const client = mockClient({
    userId: "student-free",
    profile: { role: "student", onboarding_complete: true },
    canPublish: false,
    accessData: {
      exists: true,
      allowed: false,
      reason: "subscription_required",
      required_rank: 0,
      required_kit: "spike",
    },
  })
  const res = await checkInstructionGateWithClient(client, "spike-prime-0045")
  assert.equal(res.allowed, false)
  if (!res.allowed) {
    assert.equal(res.status, 403)
    assert.equal(res.code, "subscription_required")
  }
})
