import crypto from "node:crypto"
import { getPlanById, type PlanId } from "./plans.ts"

export type CloudPaymentsEventKind = "pay" | "recurrent" | "fail" | "cancel"

export interface ParsedCloudPaymentsWebhook {
  eventId: string
  eventType: CloudPaymentsEventKind
  externalId: string
  userId: string
  plan: PlanId
  amountKzt: number
  status: "active" | "past_due" | "canceled"
  periodEnd: string | null
  orgName: string | null
  rawPayload: Record<string, unknown>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function verifyCloudPaymentsHmac(
  rawBody: string,
  headerValue: string | null | undefined,
  apiSecret: string | null | undefined
): boolean {
  if (!rawBody || !headerValue || !apiSecret) return false
  const expectedBase64 = crypto
    .createHmac("sha256", apiSecret)
    .update(rawBody, "utf8")
    .digest("base64")
  const provided = headerValue.trim()
  const a = Buffer.from(expectedBase64, "utf8")
  const b = Buffer.from(provided, "utf8")
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function decodeBody(rawBody: string): Record<string, unknown> {
  const trimmed = rawBody.trim()
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    throw new Error("invalid_webhook_json")
  }
  const params = new URLSearchParams(rawBody)
  const out: Record<string, unknown> = {}
  for (const [k, v] of params.entries()) {
    out[k] = v
  }
  return out
}

function extractCustomData(payload: Record<string, unknown>): Record<string, unknown> {
  const raw = payload.Data ?? payload.JsonData ?? payload.data ?? payload.jsonData
  if (!raw) return {}
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

export function resolveEventKind(
  payload: Record<string, unknown>,
  explicitKind?: string | null
): CloudPaymentsEventKind {
  const hint = (explicitKind || String(payload.OperationType || payload.EventType || payload.Status || "")).toLowerCase()
  if (hint.includes("cancel") || hint === "cancelled" || hint === "canceled") return "cancel"
  if (hint.includes("fail") || hint.includes("declin")) return "fail"
  if (hint.includes("recurrent")) return "recurrent"
  if (payload.SubscriptionId && String(payload.Status || "").toLowerCase() === "cancelled") {
    return "cancel"
  }
  if (String(payload.Status || "").toLowerCase() === "declined") return "fail"
  if (payload.SubscriptionId && !payload.TransactionId) return "recurrent"
  return "pay"
}

export function parseCloudPaymentsWebhook(
  rawBody: string,
  options: { explicitKind?: string | null; now?: Date } = {}
): ParsedCloudPaymentsWebhook {
  const payload = decodeBody(rawBody)
  const data = extractCustomData(payload)

  const eventType = resolveEventKind(payload, options.explicitKind)
  const currency = String(payload.Currency || "").trim().toUpperCase()
  if (currency && currency !== "KZT") {
    throw new Error("unsupported_currency")
  }
  if ((eventType === "pay" || eventType === "recurrent") && currency !== "KZT") {
    throw new Error("unsupported_currency")
  }

  const planCandidate = data.plan ?? data.planId ?? payload.PlanId
  const plan = getPlanById(planCandidate)
  if (!plan) {
    throw new Error("unknown_plan")
  }

  const userCandidate = String(data.userId ?? payload.AccountId ?? "").trim()
  if (!UUID_PATTERN.test(userCandidate)) {
    throw new Error("invalid_user_id")
  }

  const hasAmount = payload.Amount !== undefined && payload.Amount !== null && String(payload.Amount).trim() !== ""
  const rawAmount = hasAmount ? Number(payload.Amount) : plan.amountKzt
  if (!Number.isFinite(rawAmount)) {
    throw new Error("invalid_amount")
  }
  const amountKzt = Math.round(rawAmount)

  if (eventType === "pay" || eventType === "recurrent") {
    if (!hasAmount || amountKzt !== plan.amountKzt) {
      throw new Error("amount_mismatch")
    }
  }

  const transactionId = String(payload.TransactionId ?? payload.Id ?? "").trim()
  const subscriptionId = String(payload.SubscriptionId ?? "").trim()
  const baseEventId = transactionId || subscriptionId
  if (!baseEventId) {
    throw new Error("missing_event_id")
  }

  const status: "active" | "past_due" | "canceled" =
    eventType === "cancel" ? "canceled" : eventType === "fail" ? "past_due" : "active"

  const now = options.now ?? new Date()
  const nextMonth = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000)
  const periodEnd =
    status === "active"
      ? nextMonth.toISOString()
      : typeof payload.NextTransactionDateIso === "string"
        ? payload.NextTransactionDateIso
        : null

  const orgNameRaw = typeof data.orgName === "string" ? data.orgName.trim() : ""
  const orgName = orgNameRaw ? orgNameRaw.slice(0, 120) : null

  return {
    eventId: `${eventType}:${baseEventId}`,
    eventType,
    externalId: subscriptionId || transactionId,
    userId: userCandidate,
    plan: plan.id,
    amountKzt,
    status,
    periodEnd,
    orgName,
    rawPayload: payload,
  }
}
