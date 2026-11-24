export const WORKSPACE_MEDIA_BUCKET = "workspace-media"
export const MAX_WORKSPACE_IMAGE_BYTES = 2_000_000
export const WORKSPACE_MEDIA_FILENAME = /^[a-f0-9]{64}\.(jpg|png|webp)$/
export type WorkspaceImageType = { mime: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" }
export function isWorkspaceMediaUrl(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("/api/workspace-media/") && WORKSPACE_MEDIA_FILENAME.test(value.slice("/api/workspace-media/".length))
}
export function workspaceImageType(bytes: Uint8Array): WorkspaceImageType | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return { mime: "image/jpeg", extension: "jpg" }
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return { mime: "image/png", extension: "png" }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return { mime: "image/webp", extension: "webp" }
  return null
}
export function decodeWorkspaceImage(dataUrl: unknown) {
  if (typeof dataUrl !== "string" || dataUrl.length > Math.ceil(MAX_WORKSPACE_IMAGE_BYTES / 3) * 4 + 100) throw new Error("Изображение слишком большое. Выберите картинку поменьше.")
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || match[2].length % 4 !== 0) throw new Error("Нужна картинка JPG, PNG или WebP.")
  let binary: string
  try { binary = atob(match[2]) } catch { throw new Error("Файл изображения повреждён.") }
  if (!binary.length || binary.length > MAX_WORKSPACE_IMAGE_BYTES) throw new Error("Изображение слишком большое. Выберите картинку поменьше.")
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  const type = workspaceImageType(bytes)
  if (!type || type.mime !== match[1]) throw new Error("Содержимое файла не соответствует формату изображения.")
  return { bytes, ...type }
}
/** Prepare a complete section before the caller attempts its guarded CAS write. */
export async function prepareWorkspaceMediaSection(section: "settings" | "board", source: unknown, upload: (dataUrl: string) => Promise<string>) {
  let migrated = 0
  async function replace(value: unknown) {
    if (typeof value !== "string" || !value.startsWith("data:image/")) return value
    const url = await upload(value)
    if (!isWorkspaceMediaUrl(url)) throw new Error("Хранилище не подтвердило загрузку картинки.")
    migrated++
    return url
  }
  if (section === "settings") {
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Настройки рабочего места повреждены.")
    const next = { ...source } as Record<string, unknown>
    for (const field of ["wallpaper", "profilePhoto"]) if (field in next) next[field] = await replace(next[field])
    return { value: next, migrated }
  }
  if (!Array.isArray(source)) throw new Error("Доска рабочего места повреждена.")
  const value = await Promise.all(source.map(async item => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.image !== "string") return item
    return { ...item, image: await replace(item.image) }
  }))
  return { value, migrated }
}
