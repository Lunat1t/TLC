import { NextResponse } from "next/server"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"

export async function GET() {
  try {
    const { client, user } = await verifiedUser()
    const [{ data, error }, { data: profile, error: profileError }] = await Promise.all([
      client.rpc("is_instruction_admin"),
      client.from("profiles").select("role,onboarding_complete").eq("id", user.id).single(),
    ])
    if (error) throw new InstructionError(503, "dependency_unavailable", "Не удалось проверить права доступа.")
    if (profileError) throw new InstructionError(503, "dependency_unavailable", "Не удалось проверить роль.")
    return NextResponse.json({ isAdmin: data === true, role: profile.onboarding_complete ? profile.role : null, canPublish: data === true || (profile.onboarding_complete && profile.role === "teacher") }, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
