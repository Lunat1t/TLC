import { unstable_cache } from "next/cache"
import { createPublicClient } from "@/utils/supabase/public"
import { InstructionError } from "./access"
import type { CatalogCard } from "./types"

export const publishedCard = unstable_cache(async (slug: string): Promise<CatalogCard | null> => {
  const client = createPublicClient()
  const [{ data, error }, { data: fileId, error: documentError }] = await Promise.all([
    client.from("instructions")
    .select("id,slug,title,summary,kit,topics,cover_asset_id")
    .eq("slug", slug).eq("status", "published").maybeSingle(),
    client.rpc("published_instruction_drive_file", { p_slug: slug }),
  ])
  if (error) throw new InstructionError(503, "catalog_unavailable", "Каталог временно недоступен.")
  if (!data) return null
  if (documentError) throw new InstructionError(503, "catalog_unavailable", "Каталог временно недоступен.")
  return { id: data.id, slug: data.slug, title: data.title, summary: data.summary,
    kit: data.kit, topics: data.topics || [], coverAssetId: data.cover_asset_id,
    hasPdf: typeof fileId === "string" }
}, ["published-instruction-detail-v1"], { revalidate: 60, tags: ["instruction-catalog"] })
