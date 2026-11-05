import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { errorResponse, InstructionError, requireAdmin } from "@/lib/instructions/access"
import { asKit, asText } from "@/lib/instructions/validation"
import { deleteDriveFile, MAX_PDF_BYTES, ownedUploadPdf, pinConfiguredPdfRevision } from "@/lib/instructions/google-drive"

export const runtime = "nodejs"

const transliteration: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
}

function makeSlug(title: string) {
  const normalized = [...title.toLowerCase()].map((character) => transliteration[character] ?? character).join("")
  const base = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "instruction"
  return `${base}-${randomUUID().slice(0, 8)}`
}

export async function POST(request: Request) {
  let driveFileId: string | null = null
  try {
    const { client } = await requireAdmin()
    const body = await request.json() as Record<string, unknown>
    const title = asText(body.title, "Название", 120)
    const kit = asKit(body.kit)
    const fileId = typeof body.fileId === "string" ? body.fileId : ""
    const uploadId = typeof body.uploadId === "string" ? body.uploadId : ""
    const expectedSize = Number(body.size)
    if (!/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) throw new InstructionError(400, "invalid_drive_file", "Google Drive не подтвердил загруженный файл.")
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX_PDF_BYTES) {
      throw new InstructionError(413, "file_too_large", "PDF должен быть размером до 100 000 000 байт.")
    }

    const ownedFile = await ownedUploadPdf(fileId, uploadId)
    driveFileId = ownedFile.id
    const { file, revisionId, revisionVerified } = await pinConfiguredPdfRevision(fileId, uploadId)
    if (Number(file.size || 0) !== expectedSize) {
      throw new InstructionError(400, "size_mismatch", "Размер файла в Google Drive не совпал с выбранным PDF.")
    }
    const { data: duplicate, error: duplicateError } = await client.from("instruction_assets")
      .select("instruction_id").eq("source_provider", "google_drive").eq("source_file_id", file.id).maybeSingle()
    if (duplicateError) throw new InstructionError(503, "asset_lookup_failed", "Не удалось проверить, добавляли ли этот PDF раньше.")
    if (duplicate) {
      driveFileId = null
      throw new InstructionError(409, "already_imported", "Этот PDF уже добавлен в библиотеку.")
    }

    const { data: draft, error: draftError } = await client.from("instructions").insert({
      slug: makeSlug(title), title, summary: "", kit, topics: [], status: "draft",
    }).select("id,slug,title,kit,status").single()
    if (draftError || !draft) throw new InstructionError(503, "draft_create_failed", "Не удалось сохранить черновик инструкции.")

    const { data: asset, error: assetError } = await client.from("instruction_assets").insert({
      instruction_id: draft.id,
      kind: "document",
      object_key: null,
      mime_type: "application/pdf",
      byte_size: expectedSize,
      source_provider: "google_drive",
      source_file_id: file.id,
      source_revision: revisionId,
      source_revision_verified: revisionVerified,
    }).select("id,instruction_id,byte_size,source_revision_verified").single()
    if (assetError || !asset) {
      await client.from("instructions").delete().eq("id", draft.id)
      throw new InstructionError(503, "asset_save_failed", "Не удалось сохранить PDF в каталоге.")
    }

    driveFileId = null
    return NextResponse.json({ draft, asset }, { status: 201, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (driveFileId) await deleteDriveFile(driveFileId).catch(() => undefined)
    return errorResponse(error)
  }
}
