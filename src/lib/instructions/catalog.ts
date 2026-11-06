import { unstable_cache } from "next/cache"
import { createPublicClient } from "@/utils/supabase/public"
import { InstructionError } from "./access"
import { asKit } from "./validation"
import type { CatalogCard, Kit } from "./types"

interface CatalogRow extends CatalogCard { cover_asset_id: string | null; has_pdf: boolean; published_at: string }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function decodeCursor(cursor?: string | null) {
  if (!cursor) return { time: null, id: null }
  try {
    const raw = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { time: string; id: string }
    if (!uuidPattern.test(raw.id) || !Number.isFinite(Date.parse(raw.time))) throw new Error("invalid")
    return { time: raw.time, id: raw.id }
  } catch {
    throw new InstructionError(400, "invalid_cursor", "Неверная страница каталога.")
  }
}

export async function listCatalog(input: { kit?: string | null; q?: string | null; cursor?: string | null }) {
  const kit: Kit | null = input.kit ? asKit(input.kit) : null
  const q = String(input.q || "").trim().slice(0, 100)
  const after = decodeCursor(input.cursor)
  return cachedCatalog(kit, q, after.time, after.id)
}

const cachedCatalog = unstable_cache(async (kit: Kit | null, q: string, afterTime: string | null, afterId: string | null) => {
  const client = createPublicClient()
  const { data, error } = await client.rpc("search_instruction_cards", {
    p_kit: kit,
    p_query: q || null,
    p_after_time: afterTime,
    p_after_id: afterId,
    p_limit: 21,
  })
  if (error) throw new InstructionError(503, "catalog_unavailable", "Каталог временно недоступен.")
  const rows = (data || []) as CatalogRow[]
  const items: CatalogCard[] = rows.slice(0, 20).map((row) => ({
    id: row.id, slug: row.slug, title: row.title, summary: row.summary,
    kit: row.kit, topics: row.topics || [], coverAssetId: row.cover_asset_id,
    hasPdf: row.has_pdf === true,
  }))
  const last = rows[19]
  const nextCursor = rows.length > 20 && last
    ? Buffer.from(JSON.stringify({ time: last.published_at, id: last.id }), "utf8").toString("base64url")
    : null
  return { items, nextCursor }
}, ["published-instruction-catalog-v1"], { revalidate: 60, tags: ["instruction-catalog"] })
