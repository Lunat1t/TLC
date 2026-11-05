import { serverClient, InstructionError } from "./access"
import type { CatalogCard } from "./types"

export async function publishedCard(slug: string): Promise<CatalogCard | null> {
  const client = await serverClient()
  const { data, error } = await client.from("instructions")
    .select("id,slug,title,summary,kit,topics,cover_asset_id")
    .eq("slug", slug).eq("status", "published").maybeSingle()
  if (error) throw new InstructionError(503, "catalog_unavailable", "Каталог временно недоступен.")
  if (!data) return null
  const { data: fileId, error: documentError } = await client.rpc("published_instruction_drive_file", { p_slug: slug })
  if (documentError) throw new InstructionError(503, "catalog_unavailable", "Каталог временно недоступен.")
  return { id: data.id, slug: data.slug, title: data.title, summary: data.summary,
    kit: data.kit, topics: data.topics || [], coverAssetId: data.cover_asset_id,
    hasPdf: typeof fileId === "string" }
}
