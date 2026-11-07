import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { errorResponse, InstructionError, requireAdmin } from "@/lib/instructions/access"
import { instructionBucket } from "@/lib/instructions/validation"
import { MAX_PDF_BYTES, publicDriveDownloadUrl } from "@/lib/instructions/google-drive"
import { MAX_AUTO_PREVIEW_PDF_BYTES, normalizeCoverImage, renderFirstPagePreview } from "@/lib/instructions/pdf-preview"

export const runtime = "nodejs"
export const maxDuration = 60

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_COVER_BYTES = 3 * 1024 * 1024
const coverTypes = {
  "image/jpeg": (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes: Uint8Array) => bytes.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10",
  "image/webp": (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP",
} as const

function driveFileId(value: unknown) {
  try {
    const url = new URL(String(value || ""))
    if (url.protocol !== "https:" || url.hostname !== "drive.google.com") return null
    const id = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]{10,200})(?:\/|$)/)?.[1] || url.searchParams.get("id")
    return id && /^[a-zA-Z0-9_-]{10,200}$/.test(id) ? id : null
  } catch { return null }
}

function parsedTopics(value: FormDataEntryValue | null) {
  let topics: unknown
  try { topics = JSON.parse(String(value || "[]")) } catch { throw new InstructionError(400, "invalid_topics", "Проверьте список тем.") }
  if (!Array.isArray(topics) || topics.length > 12) throw new InstructionError(400, "invalid_topics", "Укажите не более 12 тем.")
  const result = topics.map((topic) => String(topic).trim()).filter(Boolean)
  if (result.some((topic) => topic.length > 40)) throw new InstructionError(400, "invalid_topics", "Каждая тема должна быть не длиннее 40 символов.")
  return result
}

export async function GET(_request: Request, context: { params: Promise<{ instructionId: string }> }) {
  try {
    const { client } = await requireAdmin()
    const { instructionId } = await context.params
    if (!uuidPattern.test(instructionId)) throw new InstructionError(400, "invalid_instruction", "Некорректная карточка инструкции.")
    const { data: instruction, error } = await client.from("instructions")
      .select("id,slug,title,summary,kit,topics,status,cover_asset_id")
      .eq("id", instructionId).eq("status", "published").maybeSingle()
    if (error) throw new InstructionError(503, "instruction_unavailable", "Не удалось загрузить карточку инструкции.")
    if (!instruction) throw new InstructionError(404, "instruction_not_found", "Карточка инструкции не найдена.")
    const [{ data: document, error: documentError }, { data: cover, error: coverError }] = await Promise.all([
      client.from("instruction_assets").select("source_file_id,byte_size")
        .eq("instruction_id", instructionId).eq("kind", "document").eq("is_current", true).maybeSingle(),
      instruction.cover_asset_id
        ? client.from("instruction_assets").select("id").eq("id", instruction.cover_asset_id).eq("instruction_id", instructionId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (documentError || coverError) throw new InstructionError(503, "assets_unavailable", "Не удалось загрузить файлы карточки.")
    return NextResponse.json({
      instruction,
      fileId: document?.source_file_id || "",
      fileSize: Number(document?.byte_size || 0),
      coverUrl: cover ? `/api/instruction-media/${instructionId}/${cover.id}` : null,
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return errorResponse(error) }
}

export async function PATCH(request: Request, context: { params: Promise<{ instructionId: string }> }) {
  let uploadedCoverPath: string | null = null
  let cleanupUploadedCover: (() => Promise<void>) | null = null
  try {
    const { client } = await requireAdmin()
    const { instructionId } = await context.params
    if (!uuidPattern.test(instructionId)) throw new InstructionError(400, "invalid_instruction", "Некорректная карточка инструкции.")
    const body = await request.formData()
    const title = String(body.get("title") || "").trim()
    const summary = String(body.get("summary") || "").trim()
    const kit = String(body.get("kit") || "")
    const topics = parsedTopics(body.get("topics"))
    if (!title || title.length > 120 || summary.length > 1000 || !["spike", "ev3"].includes(kit)) {
      throw new InstructionError(400, "invalid_instruction", "Проверьте название, описание и набор LEGO.")
    }
    if (body.get("rights") !== "on") throw new InstructionError(400, "rights_required", "Подтвердите право на публикацию материала.")

    const { data: current, error: currentError } = await client.from("instructions")
      .select("id").eq("id", instructionId).eq("status", "published").maybeSingle()
    if (currentError) throw new InstructionError(503, "instruction_unavailable", "Не удалось загрузить карточку инструкции.")
    if (!current) throw new InstructionError(404, "instruction_not_found", "Карточка инструкции не найдена.")
    const { data: currentDocument, error: documentError } = await client.from("instruction_assets")
      .select("source_file_id,byte_size").eq("instruction_id", instructionId)
      .eq("kind", "document").eq("is_current", true).maybeSingle()
    if (documentError || !currentDocument?.source_file_id) {
      throw new InstructionError(503, "document_unavailable", "У этой карточки нет действующей ссылки на PDF.")
    }

    const fileId = driveFileId(body.get("url"))
    if (!fileId) throw new InstructionError(400, "invalid_drive_link", "Вставьте ссылку на PDF в Google Drive.")
    let fileSize = Number(currentDocument.byte_size)
    const pdfChanged = fileId !== currentDocument.source_file_id
    let downloadUrl: string | null = null
    if (pdfChanged) {
      downloadUrl = await publicDriveDownloadUrl(fileId)
      const response = await fetch(downloadUrl, { headers: { Range: "bytes=0-4" }, cache: "no-store", signal: AbortSignal.timeout(20_000) })
      const reader = response.body?.getReader()
      const first = await reader?.read()
      await reader?.cancel()
      fileSize = Number(response.headers.get("content-range")?.split("/").pop() || response.headers.get("content-length"))
      if (!response.ok || !first?.value || Buffer.from(first.value).subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new InstructionError(400, "pdf_not_public", "PDF недоступен. В Google Drive включите «Все, у кого есть ссылка — Читатель».")
      }
      if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_PDF_BYTES) {
        throw new InstructionError(400, "invalid_pdf_size", "Размер PDF должен быть до 100 МБ.")
      }
    }

    const coverValue = body.get("cover")
    const manualCover = coverValue instanceof File && coverValue.size > 0 ? coverValue : null
    let coverBytes: Uint8Array | null = null
    if (manualCover) {
      const validator = coverTypes[manualCover.type as keyof typeof coverTypes]
      if (!validator || manualCover.size > MAX_COVER_BYTES) throw new InstructionError(400, "invalid_cover", "Обложка должна быть JPG, PNG или WebP размером до 3 МБ.")
      const bytes = new Uint8Array(await manualCover.arrayBuffer())
      if (!validator(bytes)) throw new InstructionError(400, "invalid_cover", "Файл обложки повреждён или его формат не поддерживается.")
      try { coverBytes = await normalizeCoverImage(bytes) }
      catch { throw new InstructionError(400, "invalid_cover", "Не удалось прочитать изображение обложки.") }
    } else if (pdfChanged) {
      if (fileSize > MAX_AUTO_PREVIEW_PDF_BYTES) throw new InstructionError(413, "pdf_too_large_for_preview", "PDF больше 30 МБ. Загрузите для него отдельную обложку до 3 МБ.")
      try {
        const response = await fetch(downloadUrl!, { cache: "no-store", signal: AbortSignal.timeout(45_000) })
        if (!response.ok) throw new Error("download failed")
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength !== fileSize || Buffer.from(bytes).subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("invalid PDF")
        coverBytes = await renderFirstPagePreview(bytes)
      } catch {
        throw new InstructionError(422, "pdf_preview_failed", "Не удалось создать превью. Загрузите обложку JPG, PNG или WebP.")
      }
    }

    let coverMimeType: string | null = null
    if (coverBytes) {
      coverMimeType = "image/jpeg"
      uploadedCoverPath = `covers/${randomUUID()}.jpg`
      const { data, error } = await client.storage.from(instructionBucket).upload(uploadedCoverPath, coverBytes, {
        contentType: coverMimeType, cacheControl: "3600", upsert: false,
      })
      if (error || !data) throw new InstructionError(503, "cover_upload_failed", "Не удалось сохранить обложку. Повторите попытку.")
      cleanupUploadedCover = async () => { await client.storage.from(instructionBucket).remove([uploadedCoverPath!]) }
    }

    const { data, error } = await client.rpc("update_instruction_card_admin", {
      p_instruction_id: instructionId, p_title: title, p_summary: summary, p_kit: kit, p_topics: topics,
      p_file_id: fileId, p_file_size: fileSize,
      p_cover_object_key: uploadedCoverPath, p_cover_mime_type: coverMimeType,
      p_cover_size: coverBytes?.byteLength ?? null,
    })
    if (error?.code === "23505") throw new InstructionError(409, "duplicate_pdf", "Эта ссылка уже используется другой карточкой.")
    if (error || !data) throw new InstructionError(503, "update_failed", "Не удалось сохранить изменения.")
    cleanupUploadedCover = null
    revalidateTag("instruction-catalog")
    return NextResponse.json({ instructionId }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    await cleanupUploadedCover?.().catch(() => undefined)
    return errorResponse(error)
  }
}
