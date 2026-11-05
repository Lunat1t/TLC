import { NextResponse } from "next/server"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"

export async function GET() {
  try {
    const { client } = await verifiedUser()
    const { data, error } = await client.rpc("is_instruction_admin")
    if (error) throw new InstructionError(503, "dependency_unavailable", "Не удалось проверить права доступа.")
    return NextResponse.json({ isAdmin: data === true }, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
