import { NextResponse } from "next/server"
import { serverClient, errorResponse, InstructionError } from "@/lib/instructions/access"
import { instructionBucket } from "@/lib/instructions/validation"
import { streamConfiguredPdfRevision } from "@/lib/instructions/google-drive"

export async function GET(request: Request, context: { params: Promise<{ instructionId: string; assetId: string }> }) {
  try {
    const { instructionId, assetId } = await context.params
    const client = await serverClient()
    const { data: coverKey, error: coverError } = await client.rpc("catalog_cover_object", { p_instruction_id: instructionId, p_asset_id: assetId })
    if (coverError) throw new InstructionError(503, "media_unavailable", "Файл временно недоступен.")
    let objectKey = coverKey as string | null
    let mimeType = "image/jpeg"
    let driveFileId: string | null = null
    let driveRevisionId: string | null = null
    if (!objectKey) {
      const { data: role } = await client.rpc("is_instruction_admin")
      if (role === true) {
        const { data: asset } = await client.from("instruction_assets")
          .select("object_key,mime_type,instruction_id,kind,source_provider,source_file_id,source_revision,source_revision_verified").eq("id", assetId).eq("instruction_id", instructionId).maybeSingle()
        objectKey = asset?.object_key || null
        mimeType = asset?.mime_type || mimeType
        if (asset?.kind === "document" && asset.source_provider === "google_drive") {
          if (asset.source_revision_verified !== true) throw new InstructionError(409, "drive_revision_not_retained", "Версия PDF ещё не подтверждена для безопасной выдачи.")
          driveFileId = asset.source_file_id
          driveRevisionId = asset.source_revision
        }
      }
    }
    if (driveFileId) {
      if (!driveRevisionId) throw new InstructionError(409, "drive_revision_not_retained", "У PDF не записана закреплённая версия.")
      const file = await streamConfiguredPdfRevision(driveFileId, driveRevisionId, request.headers.get("Range"))
      const headers: Record<string, string> = {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
      }
      if (file.contentRange) headers["Content-Range"] = file.contentRange
      if (file.contentLength) headers["Content-Length"] = file.contentLength
      return new NextResponse(file.body, { status: file.status, headers })
    }
    if (!objectKey) throw new InstructionError(404, "not_found", "Файл не найден.")
    const { data: blob, error } = await client.storage.from(instructionBucket).download(objectKey)
    if (error || !blob) throw new InstructionError(503, "media_unavailable", "Файл временно недоступен.")
    return new NextResponse(await blob.arrayBuffer(), { headers: { "Content-Type": blob.type || mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch (error) { return errorResponse(error) }
}
