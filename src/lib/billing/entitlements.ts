import { isPlanId, type PlanId } from "./plans.ts"

export type EntitlementStatus = "active" | "past_due" | "canceled" | "none"
export type EntitlementSource = "org" | "user" | "admin" | "none"
export type OrgRole = "school_admin" | "teacher" | "student"

export interface EffectiveEntitlements {
  userId: string | null
  plan: PlanId | null
  status: EntitlementStatus
  source: EntitlementSource
  orgId: string | null
  orgName: string | null
  orgPlan: "school_mini" | "school_pro" | null
  orgRole: OrgRole | null
  groupId: string | null
  groupName: string | null
  canAccessLearning: boolean
  canManageSchool: boolean
  canUseSoloCheck: boolean
  isSchoolStudent: boolean
  isAdmin: boolean
  currentPeriodEnd: string | null
}

export const EMPTY_ENTITLEMENTS: EffectiveEntitlements = {
  userId: null,
  plan: null,
  status: "none",
  source: "none",
  orgId: null,
  orgName: null,
  orgPlan: null,
  orgRole: null,
  groupId: null,
  groupName: null,
  canAccessLearning: false,
  canManageSchool: false,
  canUseSoloCheck: false,
  isSchoolStudent: false,
  isAdmin: false,
  currentPeriodEnd: null,
}

function asStatus(value: unknown): EntitlementStatus {
  if (value === "active" || value === "past_due" || value === "canceled") return value
  return "none"
}

function asSource(value: unknown): EntitlementSource {
  if (value === "org" || value === "user" || value === "admin") return value
  return "none"
}

function asOrgPlan(value: unknown): "school_mini" | "school_pro" | null {
  if (value === "school_mini" || value === "school_pro") return value
  return null
}

function asOrgRole(value: unknown): OrgRole | null {
  if (value === "school_admin" || value === "teacher" || value === "student") return value
  return null
}

export function parseEntitlementsPayload(raw: unknown): EffectiveEntitlements {
  if (!raw || typeof raw !== "object") return { ...EMPTY_ENTITLEMENTS }
  const row = raw as Record<string, unknown>
  return {
    userId: typeof row.user_id === "string" ? row.user_id : null,
    plan: isPlanId(row.plan) ? row.plan : null,
    status: asStatus(row.status),
    source: asSource(row.source),
    orgId: typeof row.org_id === "string" ? row.org_id : null,
    orgName: typeof row.org_name === "string" ? row.org_name : null,
    orgPlan: asOrgPlan(row.org_plan),
    orgRole: asOrgRole(row.org_role),
    groupId: typeof row.group_id === "string" ? row.group_id : null,
    groupName: typeof row.group_name === "string" ? row.group_name : null,
    canAccessLearning: row.can_access_learning === true,
    canManageSchool: row.can_manage_school === true,
    canUseSoloCheck: row.can_use_solo_check === true,
    isSchoolStudent: row.is_school_student === true,
    isAdmin: row.is_admin === true,
    currentPeriodEnd: typeof row.current_period_end === "string" ? row.current_period_end : null,
  }
}

export function isMissingBillingMigrationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as { code?: string; message?: string }
  if (e.code === "PGRST202" || e.code === "42883" || e.code === "42P01" || e.code === "3F000") {
    return true
  }
  const msg = String(e.message || "").toLowerCase()
  return (
    msg.includes("get_effective_entitlements") ||
    msg.includes("tlc_school_workspace") ||
    msg.includes("tlc_billing") ||
    msg.includes("does not exist")
  )
}

export function canUseTestBillingMode(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.BILLING_TEST_MODE !== "true") return false
  if (env.NODE_ENV === "production" && env.BILLING_ALLOW_TEST_IN_PROD !== "true") {
    return false
  }
  return true
}

export function mapBillingErrorCode(rawError: unknown): {
  status: number
  code: string
  message: string
} {
  const msg =
    rawError && typeof rawError === "object" && "message" in rawError
      ? String((rawError as { message?: unknown }).message || "")
      : typeof rawError === "string"
        ? rawError
        : ""
  const lower = msg.toLowerCase()

  if (lower.includes("invite_rate_limited")) {
    return {
      status: 429,
      code: "invite_rate_limited",
      message: "Слишком много неверных попыток. Подождите 15 минут и попробуйте снова.",
    }
  }
  if (lower.includes("invite_invalid")) {
    return { status: 400, code: "invite_invalid", message: "Код школы не найден. Проверьте символы." }
  }
  if (lower.includes("invite_revoked")) {
    return { status: 400, code: "invite_revoked", message: "Этот код был отозван учителем." }
  }
  if (lower.includes("invite_expired")) {
    return { status: 400, code: "invite_expired", message: "Срок действия кода истёк. Запросите новый." }
  }
  if (lower.includes("invite_exhausted")) {
    return { status: 400, code: "invite_exhausted", message: "Лимит использований этого кода исчерпан." }
  }
  if (lower.includes("student_role_required")) {
    return {
      status: 403,
      code: "student_role_required",
      message: "Этот код предназначен только для аккаунта ученика.",
    }
  }
  if (lower.includes("teacher_role_required")) {
    return {
      status: 403,
      code: "teacher_role_required",
      message: "Этот код предназначен только для аккаунта учителя.",
    }
  }
  if (lower.includes("school_subscription_inactive")) {
    return {
      status: 403,
      code: "school_subscription_inactive",
      message: "У этой школы сейчас неактивна подписка.",
    }
  }
  if (lower.includes("already_in_another_school")) {
    return {
      status: 409,
      code: "already_in_another_school",
      message: "Вы уже привязаны к другой школе. Сначала выйдите из неё в настройках.",
    }
  }
  if (lower.includes("school_mini_teacher_limit")) {
    return {
      status: 403,
      code: "school_mini_teacher_limit",
      message: "На тарифе School Mini может быть только один учитель.",
    }
  }
  if (lower.includes("teacher_limit_reached")) {
    return {
      status: 403,
      code: "teacher_limit_reached",
      message: "Достигнут лимит учителей по тарифу школы.",
    }
  }
  if (lower.includes("student_limit_reached")) {
    return {
      status: 403,
      code: "student_limit_reached",
      message: "Достигнут лимит учеников по тарифу школы.",
    }
  }
  if (lower.includes("solo_check_rate_limited")) {
    return {
      status: 429,
      code: "solo_check_rate_limited",
      message: "Слишком много попыток проверки. Подождите 5 минут.",
    }
  }
  if (lower.includes("wrong_answer") || lower.includes("invalid_answer")) {
    return {
      status: 400,
      code: "wrong_answer",
      message: "Ответ не подошёл. Проверьте карточку и попробуйте ещё раз.",
    }
  }
  if (lower.includes("school_student_forbidden")) {
    return {
      status: 403,
      code: "school_student_forbidden",
      message: "В школьном аккаунте выполнение карточек подтверждает учитель.",
    }
  }
  if (lower.includes("solo_subscription_required")) {
    return {
      status: 403,
      code: "solo_subscription_required",
      message: "Самопроверка доступна только на активном тарифе Solo.",
    }
  }
  if (lower.includes("card_rank_locked")) {
    return {
      status: 403,
      code: "card_rank_locked",
      message: "Эта карточка пока закрыта по рангу. Сначала пройдите предыдущий ярус.",
    }
  }
  if (lower.includes("subscription_required")) {
    return {
      status: 403,
      code: "subscription_required",
      message: "Нужна активная подписка или код школы.",
    }
  }
  if (lower.includes("school_pro_required")) {
    return {
      status: 403,
      code: "school_pro_required",
      message: "Учебные группы доступны на тарифе School Pro.",
    }
  }
  if (lower.includes("school_admin_required")) {
    return {
      status: 403,
      code: "school_admin_required",
      message: "Это действие доступно только администратору школы.",
    }
  }
  if (lower.includes("cannot_remove_owner")) {
    return {
      status: 400,
      code: "cannot_remove_owner",
      message: "Владельца школы нельзя удалить из организации.",
    }
  }

  return {
    status: 400,
    code: "billing_error",
    message: "Не удалось выполнить операцию. Попробуйте ещё раз.",
  }
}
