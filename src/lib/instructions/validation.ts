import { InstructionError } from "./access"
import type { Kit } from "./types"

const allowedImages = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"])
export const instructionBucket = "instruction-assets"

export function asKit(value: unknown): Kit {
  if (value === "spike" || value === "ev3") return value
  throw new InstructionError(400, "invalid_kit", "Выберите SPIKE Prime или EV3.")
}

export function asText(value: unknown, label: string, max = 200) {
  const text = String(value ?? "").trim()
  if (!text || text.length > max) throw new InstructionError(400, "invalid_field", `${label}: укажите текст не длиннее ${max} символов.`)
  return text
}

export function asTopics(value: unknown) {
  if (!Array.isArray(value) || value.length > 12) throw new InstructionError(400, "invalid_topics", "Укажите не более 12 тем.")
  return value.map((topic) => asText(topic, "Тема", 40))
}

export function asSlug(value: unknown) {
  const slug = String(value ?? "").trim().toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    throw new InstructionError(400, "invalid_slug", "Адрес должен содержать латинские буквы, цифры и дефисы.")
  }
  return slug
}

export function validateUpload(file: File) {
  const limit = file.type === "application/pdf" ? 100_000_000 : 8 * 1024 * 1024
  if (!(allowedImages.has(file.type) || file.type === "application/pdf") || file.size <= 0 || file.size > limit) {
    throw new InstructionError(400, "invalid_file", "Допустимы изображения до 8 МБ и PDF до 100 000 000 байт.")
  }
  return { mimeType: file.type, byteSize: file.size }
}

export function validatePublish(input: { title: unknown; summary: unknown; kit: unknown; rightsAttested: unknown; hasMaterial: boolean }) {
  const title = asText(input.title, "Название", 160)
  const summary = asText(input.summary, "Описание", 1000)
  const kit = asKit(input.kit)
  if (input.rightsAttested !== true) throw new InstructionError(400, "rights_required", "Подтвердите право на публикацию материалов.")
  if (!input.hasMaterial) throw new InstructionError(400, "material_required", "Добавьте хотя бы один шаг или документ.")
  return { title, summary, kit }
}
