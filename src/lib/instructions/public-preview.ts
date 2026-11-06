import { unstable_cache } from "next/cache"
import { createPublicClient } from "@/utils/supabase/public"
import { publicDriveDownloadUrl } from "./google-drive"
import { MAX_AUTO_PREVIEW_PDF_BYTES, renderFirstPagePreview } from "./pdf-preview"

const pending = new Map<string, Promise<string>>()

const cachedPreview = unstable_cache(async (slug: string) => {
  const client = createPublicClient()
  const { data: fileId, error } = await client.rpc("published_instruction_drive_file", { p_slug: slug })
  if (error || typeof fileId !== "string") throw new Error("Published PDF unavailable")
  const response = await fetch(await publicDriveDownloadUrl(fileId), {
    cache: "no-store", signal: AbortSignal.timeout(25_000),
  })
  const length = Number(response.headers.get("content-length"))
  if (!response.ok || !response.body || length > MAX_AUTO_PREVIEW_PDF_BYTES) {
    await response.body?.cancel()
    throw new Error("PDF unavailable or too large")
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_AUTO_PREVIEW_PDF_BYTES) throw new Error("PDF too large")
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const pdfBytes = Buffer.concat(chunks, size)
  if (pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("Invalid PDF")
  const image = await renderFirstPagePreview(new Uint8Array(pdfBytes))
  return Buffer.from(image).toString("base64")
}, ["published-pdf-preview-v2"], { revalidate: 86400, tags: ["instruction-catalog"] })

export async function publishedPreview(slug: string) {
  let promise = pending.get(slug)
  if (!promise) {
    promise = cachedPreview(slug)
    pending.set(slug, promise)
  }
  try { return Buffer.from(await promise, "base64") }
  finally { if (pending.get(slug) === promise) pending.delete(slug) }
}
