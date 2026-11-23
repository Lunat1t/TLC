import { mapKits } from "./map-kits"
import {
  clampRankIndex,
  isRoadmapKit,
  type RoadmapCard,
  type RoadmapCardProgress,
  type RoadmapKitId,
} from "./roadmap"

export interface RoadmapInstructionOption {
  id: string
  slug: string
  title: string
  summary: string
  kit: string
  coverAssetId: string | null
  hasPdf: boolean
}

export interface RoadmapStatePayload {
  role: string | null
  isEditor: boolean
  cards: RoadmapCard[]
  progress: Record<string, RoadmapCardProgress>
  savedRanks: Record<RoadmapKitId, number>
}

export function mapRpcCard(row: unknown): RoadmapCard | null {
  if (!row || typeof row !== "object") return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== "string" || !isRoadmapKit(r.kit)) return null
  return {
    id: r.id,
    kit: r.kit,
    rankIndex: clampRankIndex(Number(r.rank_index ?? r.rankIndex ?? 0)),
    position: Math.max(0, Math.trunc(Number(r.position ?? 0) || 0)),
    instructionId: typeof r.instruction_id === "string" ? r.instruction_id : null,
    instructionSlug: typeof r.instruction_slug === "string" ? r.instruction_slug : null,
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : "Робот",
    summary: typeof r.summary === "string" ? r.summary : "",
    coverAssetId: typeof r.cover_asset_id === "string" ? r.cover_asset_id : null,
    hasPdf: r.has_pdf === true,
    mechanicsPoints: Math.max(0, Math.trunc(Number(r.mechanics_points ?? 0) || 0)),
    logicPoints: Math.max(0, Math.trunc(Number(r.logic_points ?? 0) || 0)),
    creativityPoints: Math.max(0, Math.trunc(Number(r.creativity_points ?? 0) || 0)),
  }
}

export function mapRpcInstruction(row: unknown): RoadmapInstructionOption | null {
  if (!row || typeof row !== "object") return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== "string" || typeof r.slug !== "string") return null
  return {
    id: r.id,
    slug: r.slug,
    title: typeof r.title === "string" ? r.title : r.slug,
    summary: typeof r.summary === "string" ? r.summary : "",
    kit: typeof r.kit === "string" ? r.kit : "ev3",
    coverAssetId: typeof r.cover_asset_id === "string" ? r.cover_asset_id : null,
    hasPdf: r.has_pdf === true,
  }
}

export function mapRpcProgress(raw: unknown): Record<string, RoadmapCardProgress> {
  if (!raw || typeof raw !== "object") return {}
  const out: Record<string, RoadmapCardProgress> = {}
  for (const [cardId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue
    const v = value as Record<string, unknown>
    out[cardId] = {
      mechanicsDone: v.mechanicsDone === true,
      logicDone: v.logicDone === true,
      creativityDone: v.creativityDone === true,
    }
  }
  return out
}

export function mapRpcSavedRanks(raw: unknown): Record<RoadmapKitId, number> {
  const out: Record<RoadmapKitId, number> = { ev3: 0, vex: 0, spike: 0 }
  if (!raw || typeof raw !== "object") return out
  const r = raw as Record<string, unknown>
  for (const item of mapKits) {
    out[item.id] = clampRankIndex(Number(r[item.id] ?? 0))
  }
  return out
}

export function parseRoadmapStatePayload(raw: unknown): RoadmapStatePayload {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const rawCards = Array.isArray(obj.cards) ? obj.cards : []
  const cards = rawCards.map(mapRpcCard).filter((c): c is RoadmapCard => c !== null)
  return {
    role: typeof obj.role === "string" ? obj.role : null,
    isEditor: obj.is_editor === true,
    cards,
    progress: mapRpcProgress(obj.progress),
    savedRanks: mapRpcSavedRanks(obj.saved_ranks),
  }
}
