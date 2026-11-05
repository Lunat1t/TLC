import { NextResponse } from "next/server"
import { errorResponse, InstructionError, serverClient } from "@/lib/instructions/access"
import { publicDriveDownloadUrl } from "@/lib/instructions/google-drive"

export const runtime = "nodejs"

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new InstructionError(404, "not_found", "Инструкция не найдена.")
    }
    const client = await serverClient()
    const { data: fileId, error } = await client.rpc("published_instruction_drive_file", { p_slug: slug })
    if (error) throw new InstructionError(503, "catalog_unavailable", "Каталог временно недоступен.")
    if (typeof fileId !== "string") throw new InstructionError(404, "not_found", "PDF этой опубликованной инструкции не найден.")
    const downloadUrl = await publicDriveDownloadUrl(fileId)
    return NextResponse.redirect(downloadUrl, {
      status: 302,
      headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
