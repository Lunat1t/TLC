import { NextResponse } from "next/server"
import { publishedCard } from "@/lib/instructions/detail"
import { errorResponse } from "@/lib/instructions/access"
import { requireInstructionGate } from "@/lib/instructions/roadmap-gate"

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params
    const card = await publishedCard(slug)
    if (!card) return NextResponse.json({ error: { code: "not_found", message: "Инструкция не найдена." } }, { status: 404 })
    await requireInstructionGate(slug)
    return NextResponse.json(card, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return errorResponse(error) }
}
