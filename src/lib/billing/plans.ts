export type PlanId = "solo" | "school_mini" | "school_pro"

export interface BillingPlan {
  id: PlanId
  name: string
  badge: string
  tagline: string
  amountKzt: number
  periodLabel: string
  subjectType: "user" | "org"
  teacherLimit: number
  studentLimit: number
  supportsGroups: boolean
  supportsSoloCheck: boolean
  features: readonly string[]
}

export const BILLING_PLANS: readonly BillingPlan[] = [
  {
    id: "solo",
    name: "Solo",
    badge: "Для ученика",
    tagline: "Самостоятельный путь по роадмапу и инструкциям",
    amountKzt: 3900,
    periodLabel: "в месяц",
    subjectType: "user",
    teacherLimit: 0,
    studentLimit: 1,
    supportsGroups: false,
    supportsSoloCheck: true,
    features: [
      "Доступ к роадмапу EV3, VEX и SPIKE Prime",
      "Полный каталог и PDF-инструкции по рангу",
      "Самопроверка карточек (Solo) для роста ранга",
    ],
  },
  {
    id: "school_mini",
    name: "School Mini",
    badge: "Для кружка",
    tagline: "1 учитель, до 30 учеников, инвайты и журнал прогресса",
    amountKzt: 19900,
    periodLabel: "в месяц",
    subjectType: "org",
    teacherLimit: 1,
    studentLimit: 30,
    supportsGroups: false,
    supportsSoloCheck: false,
    features: [
      "1 учитель + до 30 учеников в школе",
      "Коды-приглашения и QR-ссылки для класса",
      "Настройка роадмапа и подтверждение навыков учеников",
    ],
  },
  {
    id: "school_pro",
    name: "School Pro",
    badge: "Для школы",
    tagline: "До 25 учителей, 300 учеников и отдельные группы классов",
    amountKzt: 49900,
    periodLabel: "в месяц",
    subjectType: "org",
    teacherLimit: 25,
    studentLimit: 300,
    supportsGroups: true,
    supportsSoloCheck: false,
    features: [
      "До 25 учителей и до 300 учеников",
      "Учебные группы и распределение учителей по классам",
      "Отдельные инвайты для учеников и преподавателей",
    ],
  },
] as const

export function isPlanId(value: unknown): value is PlanId {
  return value === "solo" || value === "school_mini" || value === "school_pro"
}

export function getPlanById(planId: unknown): BillingPlan | null {
  if (!isPlanId(planId)) return null
  return BILLING_PLANS.find((plan) => plan.id === planId) ?? null
}

export function formatKzt(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(amount))} ₸`
}

export function canRolePurchasePlan(
  role: string | null | undefined,
  plan: BillingPlan
): { allowed: true } | { allowed: false; code: string; message: string } {
  if (role === "parent") {
    return {
      allowed: false,
      code: "forbidden",
      message: "Подписка оформляется на аккаунт ученика или учителя.",
    }
  }
  if (plan.subjectType === "user" && role === "teacher") {
    return {
      allowed: false,
      code: "teacher_needs_school_plan",
      message: "Для учителя выберите тариф School Mini или School Pro.",
    }
  }
  if (plan.subjectType === "org" && role === "student") {
    return {
      allowed: false,
      code: "student_cannot_buy_school_plan",
      message: "Школьный тариф оформляется на аккаунт учителя.",
    }
  }
  return { allowed: true }
}
