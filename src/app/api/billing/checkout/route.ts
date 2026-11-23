import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { canUseTestBillingMode } from "@/lib/billing/entitlements"
import { canRolePurchasePlan, getPlanById } from "@/lib/billing/plans"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"
import { isBillingAdminConfigured } from "@/utils/supabase/admin"

export async function POST(request: Request) {
  try {
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
      throw new InstructionError(403, "onboarding_required", "Сначала завершите регистрацию аккаунта.")
    }
    const roleCheck = canRolePurchasePlan(profile.role, plan)
    if (!roleCheck.allowed) {
      throw new InstructionError(roleCheck.code === "teacher_needs_school_plan" ? 400 : 403, roleCheck.code, roleCheck.message)
    }

    const orgName =
      plan.subjectType === "org" && typeof body?.orgName === "string"
        ? body.orgName.trim().slice(0, 120)
        : ""

    if (!isBillingAdminConfigured()) {
      throw new InstructionError(
        503,
        "billing_unconfigured",
        "Оплата временно не подключена на сервере (отсутствует SUPABASE_SERVICE_ROLE_KEY)."
      )
    }

    const publicId = process.env.CLOUDPAYMENTS_PUBLIC_ID?.trim()
    const apiSecret = process.env.CLOUDPAYMENTS_API_SECRET?.trim()

    if (publicId && apiSecret) {
      return NextResponse.json(
        {
          mode: "cloudpayments_kz",
          widget: {
            publicId,
            description: `Brick Studio · ${plan.name}`,
            amount: plan.amountKzt,
            currency: "KZT",
            accountId: user.id,
            invoiceId: `bs-${plan.id}-${crypto.randomUUID().slice(0, 8)}`,
            data: {
              plan: plan.id,
              userId: user.id,
              ...(orgName ? { orgName } : {}),
            },
          },
        },
        { headers: noStoreHeaders() }
      )
    }

    if (canUseTestBillingMode()) {
      return NextResponse.json(
        {
          mode: "test",
          planId: plan.id,
          amountKzt: plan.amountKzt,
          orgName: orgName || null,
        },
        { headers: noStoreHeaders() }
      )
    }

    throw new InstructionError(
      503,
      "billing_unconfigured",
      "Онлайн-оплата CloudPayments KZ пока не настроена."
    )
  } catch (error) {
    return errorResponse(error)
  }
}
