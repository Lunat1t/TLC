"use client"
import { isWorkspaceMediaUrl } from "./workspace-media"

/** Guests retain browser-local data URLs; signed-in users store an owner-private file. */
export async function storeWorkspaceImage(dataUrl: string, userId: string | null, signal?: AbortSignal): Promise<string> {
  if (!userId) return dataUrl
  const response = await fetch("/api/workspace-media", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ userId, dataUrl }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message || "Не удалось загрузить картинку в аккаунт.")
  if (result.userId !== userId || !isWorkspaceMediaUrl(result.url)) throw new Error("Аккаунт изменился. Повторите загрузку картинки.")
  return result.url
}
