import { NextResponse } from "next/server"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== new URL(request.url).origin) throw new InstructionError(403, "origin", "Недопустимый источник.")
    const { client, user } = await verifiedUser()
    const { data: profile, error: profileError } = await client.from("profiles").select("role,onboarding_complete").eq("id", user.id).single()
    if (profileError) throw new InstructionError(503, "profile_unavailable", "Не удалось проверить профиль.")
    if (profile.role !== "student" || !profile.onboarding_complete) throw new InstructionError(403, "student_required", "Бонус доступен ученикам.")
    const { data, error } = await client.rpc("claim_daily_activity")
    if (error) throw new InstructionError(503, "activity_unavailable", "Не удалось загрузить баланс и стрик. Попробуйте ещё раз.")
    return NextResponse.json({ userId: user.id, ...data }, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
