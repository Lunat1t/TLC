import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { verifiedUser, errorResponse, InstructionError } from "@/lib/instructions/access"
import { WORKSPACE_MEDIA_BUCKET, WORKSPACE_MEDIA_FILENAME, workspaceImageType } from "@/lib/workspace-media"

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await context.params
    if (!WORKSPACE_MEDIA_FILENAME.test(filename)) throw new InstructionError(404, "not_found", "Картинка не найдена.")
    const { client, user } = await verifiedUser()
    const { data, error } = await client.storage.from(WORKSPACE_MEDIA_BUCKET).download(`${user.id}/${filename}`)
    if (error || !data) throw new InstructionError(404, "not_found", "Картинка не найдена.")
    const bytes = new Uint8Array(await data.arrayBuffer()), type = workspaceImageType(bytes)
    if (!type || !filename.endsWith(`.${type.extension}`) || createHash("sha256").update(bytes).digest("hex") !== filename.split(".")[0]) throw new InstructionError(503, "media_invalid", "Не удалось проверить картинку.")
    return new NextResponse(data, { headers: { "Content-Type": type.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Vary": "Cookie" } })
  } catch (error) { return errorResponse(error) }
}
