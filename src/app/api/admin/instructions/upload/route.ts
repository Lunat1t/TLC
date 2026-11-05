import { NextResponse } from "next/server"
import { errorResponse, InstructionError, requireAdmin } from "@/lib/instructions/access"
import { asKit, asText } from "@/lib/instructions/validation"
import { createPdfUploadSession } from "@/lib/instructions/google-drive"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = await request.json() as Record<string, unknown>
    const title = asText(body.title, "Название", 120)
    asKit(body.kit)
    const size = Number(body.size)
    const upload = await createPdfUploadSession(`${title}.pdf`, size)
    return NextResponse.json(upload, {
      status: 201,
      headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    })
  } catch (error) { return errorResponse(error) }
}
