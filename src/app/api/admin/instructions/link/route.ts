import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { requireAdmin, errorResponse, InstructionError } from "@/lib/instructions/access"
import { publicDriveDownloadUrl, MAX_PDF_BYTES } from "@/lib/instructions/google-drive"
import { instructionBucket } from "@/lib/instructions/validation"

export const runtime = "nodejs"
const MAX_COVER_BYTES = 3 * 1024 * 1024
const coverTypes = {
  "image/jpeg": { extension: "jpg", signature: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", signature: (bytes: Uint8Array) => bytes.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10" },
  "image/webp": { extension: "webp", signature: (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP" },
} as const

export async function POST(request: Request) {
  try {
    const { client } = await requireAdmin()
    const body = await request.formData()
    const title = String(body.get("title") || "").trim()
    const kit = String(body.get("kit") || "")
    if (!title || title.length > 120 || !["spike", "ev3"].includes(kit) || body.get("rights") !== "on") {
      throw new InstructionError(400, "invalid_instruction", "Укажите название, набор и подтвердите право на публикацию.")
    }
    const cover = body.get("cover")
    if (!(cover instanceof File) || !cover.size || cover.size > MAX_COVER_BYTES || !Object.hasOwn(coverTypes, cover.type)) {
      throw new InstructionError(400, "invalid_cover", "Добавьте превью в формате JPG, PNG или WebP размером до 3 МБ.")
    }
    const coverBytes = new Uint8Array(await cover.arrayBuffer())
    const coverType = coverTypes[cover.type as keyof typeof coverTypes]
    if (!coverType.signature(coverBytes)) throw new InstructionError(400, "invalid_cover", "Файл превью повреждён или его формат не поддерживается.")
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
    const response = await fetch(await publicDriveDownloadUrl(fileId), {
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
    const objectKey = `covers/${randomUUID()}.${coverType.extension}`
    const { data: uploadedCover, error: uploadError } = await client.storage.from(instructionBucket).upload(objectKey, coverBytes, {
      contentType: cover.type, cacheControl: "3600", upsert: false,
    })
    if (uploadError || !uploadedCover) throw new InstructionError(503, "cover_upload_failed", "Не удалось сохранить превью. Повторите попытку.")
    try {
      const { data, error } = await client.rpc("publish_drive_instruction", {
        p_title: title, p_kit: kit, p_slug: `instruction-${randomUUID()}`, p_file_id: fileId, p_size: size,
        p_cover_object_key: uploadedCover.path, p_cover_mime_type: cover.type, p_cover_size: cover.size,
      })
      if (error) throw new InstructionError(error.code === "23505" ? 409 : 503, "publish_failed", error.code === "23505" ? "Этот PDF уже добавлен." : "Не удалось опубликовать инструкцию.")
      return NextResponse.json({ instruction: data }, { status: 201 })
    } catch (error) {
      await client.storage.from(instructionBucket).remove([uploadedCover.path])
      throw error
    }
  } catch (error) { return errorResponse(error) }
}
