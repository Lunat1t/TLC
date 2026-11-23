import assert from "node:assert/strict"
import crypto from "node:crypto"
import test from "node:test"
import { BILLING_PLANS, canRolePurchasePlan, formatKzt, getPlanById } from "../src/lib/billing/plans.ts"
import {
  canUseTestBillingMode,
  EMPTY_ENTITLEMENTS,
  mapBillingErrorCode,
  parseEntitlementsPayload,
} from "../src/lib/billing/entitlements.ts"
import {
  parseCloudPaymentsWebhook,
  verifyCloudPaymentsHmac,
} from "../src/lib/billing/cloudpayments.ts"
import { parseRoadmapStatePayload } from "../src/lib/roadmap-client.ts"

const TEST_USER_ID = "11111111-2222-4333-8444-555555555555"

test("BILLING_PLANS define all three KZT plans and limits", () => {
  assert.deepEqual(
    BILLING_PLANS.map((p) => [p.id, p.amountKzt, p.teacherLimit, p.studentLimit]),
    [
      ["solo", 3900, 0, 1],
      ["school_mini", 19900, 1, 30],
      ["school_pro", 49900, 25, 300],
    ]
  )
  assert.equal(getPlanById("solo")?.supportsSoloCheck, true)
  assert.equal(getPlanById("school_mini")?.supportsGroups, false)
  assert.equal(getPlanById("school_pro")?.supportsGroups, true)
  assert.equal(getPlanById("unknown"), null)
  assert.match(formatKzt(19900), /19\s?900\s?₸/)
})

test("verifyCloudPaymentsHmac checks base64 SHA-256 HMAC strictly", () => {
  const secret = "cp-secret-key-123"
  const rawBody = JSON.stringify({ TransactionId: 42, Currency: "KZT", Amount: 3900 })
  const validHmac = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64")

  assert.equal(verifyCloudPaymentsHmac(rawBody, validHmac, secret), true)
  assert.equal(verifyCloudPaymentsHmac(rawBody + " ", validHmac, secret), false)
  assert.equal(verifyCloudPaymentsHmac(rawBody, "invalid-sig", secret), false)
  assert.equal(verifyCloudPaymentsHmac(rawBody, null, secret), false)
  assert.equal(verifyCloudPaymentsHmac(rawBody, validHmac, ""), false)
})

test("parseCloudPaymentsWebhook parses valid Pay/Recurrent/Cancel KZT payloads and rejects tampering", () => {
  const payJson = JSON.stringify({
    TransactionId: 9001,
    SubscriptionId: "sc_123",
    Amount: 19900,
    Currency: "KZT",
    AccountId: TEST_USER_ID,
    Data: JSON.stringify({ plan: "school_mini", userId: TEST_USER_ID, orgName: "Robo Club" }),
  })
  const parsed = parseCloudPaymentsWebhook(payJson, { now: new Date("2026-11-23T00:00:00Z") })
  assert.equal(parsed.eventId, "pay:9001")
  assert.equal(parsed.plan, "school_mini")
  assert.equal(parsed.amountKzt, 19900)
  assert.equal(parsed.status, "active")
  assert.equal(parsed.orgName, "Robo Club")
  assert.equal(parsed.userId, TEST_USER_ID)

  const formPayload = new URLSearchParams({
    SubscriptionId: "sc_456",
    Status: "Cancelled",
    Currency: "KZT",
    AccountId: TEST_USER_ID,
    Data: JSON.stringify({ plan: "solo", userId: TEST_USER_ID }),
  }).toString()
  const canceled = parseCloudPaymentsWebhook(formPayload)
  assert.equal(canceled.eventType, "cancel")
  assert.equal(canceled.status, "canceled")

  assert.throws(
    () =>
      parseCloudPaymentsWebhook(
        JSON.stringify({
          TransactionId: 9002,
          Amount: 3900,
          Currency: "USD",
          AccountId: TEST_USER_ID,
          Data: { plan: "solo", userId: TEST_USER_ID },
        })
      ),
    /unsupported_currency/
  )

  assert.throws(
    () =>
      parseCloudPaymentsWebhook(
        JSON.stringify({
          TransactionId: 9003,
          Amount: 100,
          Currency: "KZT",
          AccountId: TEST_USER_ID,
          Data: { plan: "solo", userId: TEST_USER_ID },
        })
      ),
    /amount_mismatch/
  )
})

test("canUseTestBillingMode stays disabled in production unless explicitly overridden", () => {
  assert.equal(canUseTestBillingMode({ NODE_ENV: "development", BILLING_TEST_MODE: "true" }), true)
  assert.equal(canUseTestBillingMode({ NODE_ENV: "production", BILLING_TEST_MODE: "true" }), false)
  assert.equal(
    canUseTestBillingMode({
      NODE_ENV: "production",
      BILLING_TEST_MODE: "true",
      BILLING_ALLOW_TEST_IN_PROD: "true",
    }),
    true
  )
})

test("parseEntitlementsPayload, mapBillingErrorCode, and parseRoadmapStatePayload handle edge cases", () => {
  assert.deepEqual(parseEntitlementsPayload(null), EMPTY_ENTITLEMENTS)

  const schoolStudent = parseEntitlementsPayload({
    user_id: TEST_USER_ID,
    plan: "school_pro",
    status: "active",
    source: "org",
    org_id: "org-1",
    org_name: "Лицей 1",
    org_plan: "school_pro",
    org_role: "student",
    group_id: "grp-1",
    group_name: "5А",
    can_access_learning: true,
    can_manage_school: false,
    can_use_solo_check: false,
    is_school_student: true,
    is_admin: false,
    current_period_end: "2026-12-23T00:00:00Z",
  })
  assert.equal(schoolStudent.canAccessLearning, true)
  assert.equal(schoolStudent.canUseSoloCheck, false)
  assert.equal(schoolStudent.isSchoolStudent, true)
  assert.equal(schoolStudent.groupName, "5А")

  assert.equal(mapBillingErrorCode("invite_rate_limited").status, 429)
  assert.equal(mapBillingErrorCode("school_student_forbidden").code, "school_student_forbidden")
  assert.equal(mapBillingErrorCode("wrong_answer").status, 400)

  const rm = parseRoadmapStatePayload({
    role: "student",
    is_editor: false,
    can_use_solo_check: true,
    is_school_student: false,
    solo_checks: {
      "c1": { checkKind: "quiz", question: "Какой датчик?", options: ["Гироскоп", "Ультразвук"] },
    },
    cards: [],
    progress: {},
    saved_ranks: { ev3: 1, vex: 0, spike: 0 },
  })
  assert.equal(rm.canUseSoloCheck, true)
  assert.equal(rm.isSchoolStudent, false)
  assert.deepEqual(rm.soloChecks["c1"].options, ["Гироскоп", "Ультразвук"])
})

test("canRolePurchasePlan blocks student->school, teacher->solo, and parent->all", () => {
  const solo = getPlanById("solo")!
  const mini = getPlanById("school_mini")!
  const pro = getPlanById("school_pro")!

  assert.equal(canRolePurchasePlan("student", solo).allowed, true)
  assert.deepEqual(canRolePurchasePlan("student", mini), {
    allowed: false,
    code: "student_cannot_buy_school_plan",
    message: "Школьный тариф оформляется на аккаунт учителя.",
  })
  assert.equal(canRolePurchasePlan("student", pro).allowed, false)

  assert.equal(canRolePurchasePlan("teacher", mini).allowed, true)
  assert.equal(canRolePurchasePlan("teacher", pro).allowed, true)
  assert.deepEqual(canRolePurchasePlan("teacher", solo), {
    allowed: false,
    code: "teacher_needs_school_plan",
    message: "Для учителя выберите тариф School Mini или School Pro.",
  })

  assert.equal(canRolePurchasePlan("parent", solo).allowed, false)
  assert.equal(canRolePurchasePlan("parent", mini).allowed, false)
})
