import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { canUseTestBillingMode } from "@/lib/billing/entitlements"
import { canRolePurchasePlan, getPlanById } from "@/lib/billing/plans"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"
import { BillingAdminConfigError, createAdminClient } from "@/utils/supabase/admin"

export async function POST(request: Request) {
  try {
    if (!canUseTestBillingMode()) {
      throw new InstructionError(403, "test_mode_disabled", "Тестовая активация отключена.")
    }

    const { client, user } = await verifiedUser()
    const body = (await request.json().catch(() => null)) as
      | { planId?: unknown; orgName?: unknown }
      | null
    const plan = getPlanById(body?.planId)
    if (!plan) {
      throw new InstructionError(400, "invalid_plan", "Выберите корректный тариф.")
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("role,onboarding_complete")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile?.onboarding_complete) {
      throw new InstructionError(403, "forbidden", "Недостаточно прав для активации тарифа.")
    }
    const roleCheck = canRolePurchasePlan(profile.role, plan)
    if (!roleCheck.allowed) {
      throw new InstructionError(roleCheck.code === "teacher_needs_school_plan" ? 400 : 403, roleCheck.code, roleCheck.message)
    }

    const orgName =
      plan.subjectType === "org" && typeof body?.orgName === "string"
        ? body.orgName.trim().slice(0, 120)
        : null

    let admin
    try {
      admin = createAdminClient()
    } catch (err) {
      if (err instanceof BillingAdminConfigError) {
        throw new InstructionError(503, "billing_unconfigured", err.message)
      }
      throw err
    }

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const eventId = `test:${crypto.randomUUID()}`

    const { data, error } = await admin.rpc("tlc_billing_apply_event", {
      p_provider: "test",
      p_event_id: eventId,
      p_event_type: "test_activate",
      p_payload: { userId: user.id, plan: plan.id, orgName },
      p_user_id: user.id,
      p_plan: plan.id,
      p_status: "active",
      p_external_id: eventId,
      p_amount_kzt: plan.amountKzt,
      p_period_end: periodEnd,
      p_org_name: orgName,
    })

    if (error) {
      throw new InstructionError(503, "billing_failed", "Не удалось активировать тестовый тариф.")
    }

    return NextResponse.json({ ok: true, result: data }, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
