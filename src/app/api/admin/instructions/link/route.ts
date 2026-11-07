import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { requireInstructionPublisher, errorResponse, InstructionError } from "@/lib/instructions/access"
import { publicDriveDownloadUrl, MAX_PDF_BYTES } from "@/lib/instructions/google-drive"
import { instructionBucket } from "@/lib/instructions/validation"
import { MAX_AUTO_PREVIEW_PDF_BYTES, normalizeCoverImage, renderFirstPagePreview } from "@/lib/instructions/pdf-preview"

export const runtime = "nodejs"
export const maxDuration = 60
const MAX_COVER_BYTES = 3 * 1024 * 1024
const coverTypes = {
  "image/jpeg": { extension: "jpg", signature: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", signature: (bytes: Uint8Array) => bytes.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10" },
  "image/webp": { extension: "webp", signature: (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP" },
} as const

export async function POST(request: Request) {
  try {
    const { client } = await requireInstructionPublisher()
    const body = await request.formData()
    const title = String(body.get("title") || "").trim()
    const kit = String(body.get("kit") || "")
    const summary = String(body.get("summary") || "").trim()
    let topics: string[] = []
    try {
      const parsed = JSON.parse(String(body.get("topics") || "[]"))
      if (Array.isArray(parsed)) topics = parsed.map((topic) => String(topic).trim()).filter(Boolean)
    } catch {}
    if (!title || title.length > 120 || !["spike", "ev3"].includes(kit) || body.get("rights") !== "on") {
      throw new InstructionError(400, "invalid_instruction", "Укажите название, набор и подтвердите право на публикацию.")
    }
    if (summary.length > 1000 || topics.length > 12 || topics.some((topic) => topic.length > 40)) {
      throw new InstructionError(400, "invalid_instruction_details", "Описание должно быть до 1000 символов, тем — не больше 12 (до 40 символов каждая).")
    }
    const coverValue = body.get("cover")
    const manualCover = coverValue instanceof File && coverValue.size > 0 ? coverValue : null
    let coverBytes: Uint8Array | null = null
    let coverMimeType = "image/jpeg"
    let coverExtension = "jpg"
    if (manualCover) {
      if (manualCover.size > MAX_COVER_BYTES || !Object.hasOwn(coverTypes, manualCover.type)) {
        throw new InstructionError(400, "invalid_cover", "Своя обложка должна быть JPG, PNG или WebP размером до 3 МБ.")
      }
      const manualBytes = new Uint8Array(await manualCover.arrayBuffer())
      const manualType = coverTypes[manualCover.type as keyof typeof coverTypes]
      if (!manualType.signature(manualBytes)) throw new InstructionError(400, "invalid_cover", "Файл обложки повреждён или его формат не поддерживается.")
      try { coverBytes = await normalizeCoverImage(manualBytes) }
      catch { throw new InstructionError(400, "invalid_cover", "Не удалось прочитать изображение обложки.") }
    }
    let fileId: string | undefined
    try {
      const url = new URL(String(body.get("url") || ""))
      if (url.protocol === "https:" && url.hostname === "drive.google.com") {
        fileId = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]{10,200})(?:\/|$)/)?.[1] || url.searchParams.get("id") || undefined
      }
    } catch {}
    if (!fileId || !/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) {
      throw new InstructionError(400, "invalid_drive_link", "Вставьте ссылку на PDF в Google Drive.")
    }
    const downloadUrl = await publicDriveDownloadUrl(fileId)
    const response = await fetch(downloadUrl, {
      headers: { Range: "bytes=0-4" }, cache: "no-store", signal: AbortSignal.timeout(20_000),
    })
    const reader = response.body?.getReader()
    const first = await reader?.read()
    await reader?.cancel()
    const size = Number(response.headers.get("content-range")?.split("/").pop() || response.headers.get("content-length"))
    if (!response.ok || !first?.value || Buffer.from(first.value).subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new InstructionError(400, "pdf_not_public", "PDF недоступен для скачивания. В Google Drive включите «Все, у кого есть ссылка — Читатель».")
    }
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PDF_BYTES) {
      throw new InstructionError(400, "invalid_pdf_size", "Не удалось подтвердить размер PDF (до 100 МБ).")
    }
    if (!coverBytes) {
      if (size > MAX_AUTO_PREVIEW_PDF_BYTES) {
        throw new InstructionError(413, "pdf_too_large_for_preview", "PDF больше 30 МБ. Сожмите его или загрузите свою обложку размером до 3 МБ.")
      }
      try {
        const pdfResponse = await fetch(downloadUrl, { cache: "no-store", signal: AbortSignal.timeout(45_000) })
        if (!pdfResponse.ok) throw new Error("download failed")
        const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer())
        if (pdfBytes.byteLength !== size || Buffer.from(pdfBytes).subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("invalid PDF response")
        coverBytes = await renderFirstPagePreview(pdfBytes)
      } catch {
        throw new InstructionError(422, "pdf_preview_failed", "Не удалось создать превью из этого PDF. Проверьте доступ по ссылке или загрузите свою обложку.")
      }
    }
    const objectKey = `covers/${randomUUID()}.${coverExtension}`
    const { data: uploadedCover, error: uploadError } = await client.storage.from(instructionBucket).upload(objectKey, coverBytes, {
      contentType: coverMimeType, cacheControl: "3600", upsert: false,
    })
    if (uploadError || !uploadedCover) throw new InstructionError(503, "cover_upload_failed", "Не удалось сохранить превью. Повторите попытку.")
    try {
      const { data, error } = await client.rpc("publish_drive_instruction", {
        p_title: title, p_kit: kit, p_slug: `instruction-${randomUUID()}`, p_file_id: fileId, p_size: size,
        p_summary: summary, p_topics: topics,
        p_cover_object_key: uploadedCover.path, p_cover_mime_type: coverMimeType, p_cover_size: coverBytes.byteLength,
      })
      if (error) throw new InstructionError(error.code === "23505" ? 409 : 503, "publish_failed", error.code === "23505" ? "Этот PDF уже добавлен." : "Не удалось опубликовать инструкцию.")
      revalidateTag("instruction-catalog")
      return NextResponse.json({ instruction: data }, { status: 201 })
    } catch (error) {
      await client.storage.from(instructionBucket).remove([uploadedCover.path])
      throw error
    }
  } catch (error) { return errorResponse(error) }
}
