import { createHash } from "node:crypto"
import { InstructionError, type verifiedUser } from "@/lib/instructions/access"
import { decodeWorkspaceImage, WORKSPACE_MEDIA_BUCKET } from "./workspace-media"

type UserClient = Awaited<ReturnType<typeof verifiedUser>>["client"]
export function assertWorkspaceMediaOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) throw new InstructionError(403, "origin", "Недопустимый источник.")
}
export async function parseWorkspaceMediaRequest(request: Request, userId: string, maxBytes: number) {
  const declared = Number(request.headers.get("content-length") || 0)
  if (declared > maxBytes) throw new InstructionError(413, "size", "Изображение слишком большое.")
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new InstructionError(413, "size", "Изображение слишком большое.")
  let body: Record<string, unknown>
  try { body = JSON.parse(raw); if (!body || typeof body !== "object" || Array.isArray(body)) throw Error() }
  catch { throw new InstructionError(400, "invalid", "Неверные данные изображения.") }
  if (body.userId !== userId) throw new InstructionError(409, "account_changed", "Аккаунт изменился. Повторите загрузку.")
  return body
}
export async function uploadWorkspaceImage(client: UserClient, userId: string, dataUrl: unknown) {
  let image: ReturnType<typeof decodeWorkspaceImage>
  try { image = decodeWorkspaceImage(dataUrl) }
  catch (error) { throw new InstructionError(400, "invalid_image", error instanceof Error ? error.message : "Неверное изображение.") }
  const hash = createHash("sha256").update(image.bytes).digest("hex")
  const filename = `${hash}.${image.extension}`, path = `${userId}/${filename}`
  const bucket = client.storage.from(WORKSPACE_MEDIA_BUCKET)
  const { error } = await bucket.upload(path, image.bytes, { contentType: image.mime, cacheControl: "0", upsert: false })
  if (error) {
    // A concurrent/retried content-addressed upload may already exist. Verify its
    // actual bytes under the same owner's RLS before acknowledging deduplication.
    const existing = await bucket.download(path)
    if (existing.error || !existing.data || createHash("sha256").update(new Uint8Array(await existing.data.arrayBuffer())).digest("hex") !== hash) {
      throw new InstructionError(503, "media_unavailable", "Не удалось сохранить картинку в аккаунте. Исходное изображение не изменено.")
    }
  }
  return `/api/workspace-media/${filename}`
}
