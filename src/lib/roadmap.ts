import { mapKits, tokenSkills } from "./map-kits.ts"
import { rankNames } from "./student-level.ts"

export type RoadmapKitId = (typeof mapKits)[number]["id"]
export type RoadmapSkillId = (typeof tokenSkills)[number]["id"]

export const ROADMAP_TIER_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"] as const
export const SKILL_LEVEL_STEP = 5
export const TIER_UNLOCK_RATIO = 0.7

export interface RoadmapCard {
  id: string
  kit: RoadmapKitId
  rankIndex: number
  position: number
  instructionId: string | null
  instructionSlug: string | null
  title: string
  summary: string
  coverAssetId: string | null
  hasPdf: boolean
  mechanicsPoints: number
  logicPoints: number
  creativityPoints: number
}

export interface RoadmapCardProgress {
  mechanicsDone: boolean
  logicDone: boolean
  creativityDone: boolean
}

export interface SkillLevelSummary {
  id: RoadmapSkillId
  label: string
  color: string
  points: number
  level: number
  currentInLevel: number
  stepSize: number
  progressPct: number
}

export interface RoadmapTierSummary {
  rankIndex: number
  numeral: string
  rankName: string
  cards: RoadmapCard[]
  tierTotal: number
  stepCost: number
  threshold: number
  tierConfigured: boolean
  unlocked: boolean
  current: boolean
  pointsNeeded: number | null
}

export interface KitRoadmapState {
  kit: RoadmapKitId
  tiers: RoadmapTierSummary[]
  unlockedRank: number
  computedRank: number
  totalPoints: number
  skillPoints: Record<RoadmapSkillId, number>
  skillLevels: SkillLevelSummary[]
  nextRankIndex: number | null
  nextThreshold: number | null
  pointsToNext: number | null
  currentFloor: number
}

export function isRoadmapKit(value: unknown): value is RoadmapKitId {
  return mapKits.some((item) => item.id === value)
}

export function clampRankIndex(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(rankNames.length - 1, Math.trunc(value)))
}

export function cardTotalPoints(
  card: Pick<RoadmapCard, "mechanicsPoints" | "logicPoints" | "creativityPoints">
): number {
  const m = Math.max(0, Math.trunc(card.mechanicsPoints || 0))
  const l = Math.max(0, Math.trunc(card.logicPoints || 0))
  const t = Math.max(0, Math.trunc(card.creativityPoints || 0))
  return Math.max(1, m + l + t)
}

export function tierStepCost(tierTotal: number): number {
  if (!Number.isFinite(tierTotal) || tierTotal <= 0) return 0
  return Math.ceil(tierTotal * TIER_UNLOCK_RATIO)
}

export function computeSkillLevel(
  skill: (typeof tokenSkills)[number],
  points: number
): SkillLevelSummary {
  const safePoints = Number.isFinite(points) ? Math.max(0, Math.trunc(points)) : 0
  const level = 1 + Math.floor(safePoints / SKILL_LEVEL_STEP)
  const currentInLevel = safePoints % SKILL_LEVEL_STEP
  return {
    id: skill.id,
    label: skill.label,
    color: skill.color,
    points: safePoints,
    level,
    currentInLevel,
    stepSize: SKILL_LEVEL_STEP,
    progressPct: Math.round((currentInLevel / SKILL_LEVEL_STEP) * 100),
  }
}

export function isRoadmapCardCompleted(
  card: Pick<RoadmapCard, "mechanicsPoints" | "logicPoints" | "creativityPoints">,
  progress?: Partial<RoadmapCardProgress> | null
): boolean {
  const hasAnyReward =
    card.mechanicsPoints > 0 || card.logicPoints > 0 || card.creativityPoints > 0
  if (!hasAnyReward) return false
  return (
    (card.mechanicsPoints <= 0 || progress?.mechanicsDone === true) &&
    (card.logicPoints <= 0 || progress?.logicDone === true) &&
    (card.creativityPoints <= 0 || progress?.creativityDone === true)
  )
}

export function getRoadmapCardCoverUrl(
  card: Pick<RoadmapCard, "instructionId" | "instructionSlug" | "coverAssetId" | "hasPdf">
): string | null {
  if (card.instructionId && card.coverAssetId) {
    return `/api/instruction-media/${card.instructionId}/${card.coverAssetId}`
  }
  if (card.instructionSlug && card.hasPdf) {
    return `/api/instructions/${encodeURIComponent(card.instructionSlug)}/preview`
  }
  return null
}

export function computeKitRoadmapState(
  kit: RoadmapKitId,
  allCards: readonly RoadmapCard[],
  progressByCardId: Readonly<Record<string, Partial<RoadmapCardProgress>>> = {},
  savedUnlockedRank = 0
): KitRoadmapState {
  const kitCards = allCards.filter((card) => card.kit === kit)
  const grouped: RoadmapCard[][] = Array.from({ length: rankNames.length }, () => [])

  for (const card of kitCards) {
    const idx = clampRankIndex(card.rankIndex)
    grouped[idx].push(card)
  }

  for (const bucket of grouped) {
    bucket.sort(
      (a, b) =>
        a.position - b.position ||
        a.title.localeCompare(b.title, "ru") ||
        a.id.localeCompare(b.id)
    )
  }

  const skillPoints: Record<RoadmapSkillId, number> = {
    mechanics: 0,
    logic: 0,
    creativity: 0,
  }

  for (const card of kitCards) {
    const progress = progressByCardId[card.id]
    if (!progress) continue
    if (progress.mechanicsDone && card.mechanicsPoints > 0) {
      skillPoints.mechanics += card.mechanicsPoints
    }
    if (progress.logicDone && card.logicPoints > 0) {
      skillPoints.logic += card.logicPoints
    }
    if (progress.creativityDone && card.creativityPoints > 0) {
      skillPoints.creativity += card.creativityPoints
    }
  }

  const totalPoints =
    skillPoints.mechanics + skillPoints.logic + skillPoints.creativity

  const skillLevels = tokenSkills.map((skill) =>
    computeSkillLevel(skill, skillPoints[skill.id])
  )

  const tiers: RoadmapTierSummary[] = []
  for (let r = 0; r < rankNames.length; r++) {
    const tierCards = grouped[r]
    const tierTotal = tierCards.reduce((sum, card) => sum + cardTotalPoints(card), 0)
    const stepCost = tierStepCost(tierTotal)
    const prev = r > 0 ? tiers[r - 1] : null
    const canReach =
      r === 0
        ? true
        : Boolean(prev && prev.tierConfigured && prev.tierTotal > 0)
    const threshold = r === 0 ? 0 : (prev ? prev.threshold + prev.stepCost : 0)
    const tierConfigured = canReach && tierCards.length > 0

    tiers.push({
      rankIndex: r,
      numeral: ROADMAP_TIER_NUMERALS[r],
      rankName: rankNames[r],
      cards: tierCards,
      tierTotal,
      stepCost,
      threshold,
      tierConfigured,
      unlocked: false,
      current: false,
      pointsNeeded: null,
    })
  }

  let computedRank = 0
  for (let r = 1; r < tiers.length; r++) {
    if (tiers[r].tierConfigured && totalPoints >= tiers[r].threshold) {
      computedRank = r
    } else {
      break
    }
  }

  const unlockedRank = Math.max(clampRankIndex(savedUnlockedRank), computedRank)

  for (let r = 0; r < tiers.length; r++) {
    const tier = tiers[r]
    tier.unlocked = r <= unlockedRank
    tier.current = r === unlockedRank
    tier.pointsNeeded = tier.unlocked
      ? 0
      : tier.tierConfigured
        ? Math.max(0, tier.threshold - totalPoints)
        : null
  }

  const nextRankIndex = unlockedRank < rankNames.length - 1 ? unlockedRank + 1 : null
  const nextTier = nextRankIndex !== null ? tiers[nextRankIndex] : null
  const nextThreshold =
    nextTier && nextTier.tierConfigured ? nextTier.threshold : null
  const pointsToNext =
    nextThreshold !== null ? Math.max(0, nextThreshold - totalPoints) : null

  return {
    kit,
    tiers,
    unlockedRank,
    computedRank,
    totalPoints,
    skillPoints,
    skillLevels,
    nextRankIndex,
    nextThreshold,
    pointsToNext,
    currentFloor: tiers[unlockedRank]?.threshold ?? 0,
  }
}

export function isMissingRoadmapMigrationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as { code?: unknown }
  const code = typeof e.code === "string" ? e.code : ""
  return (
    code === "42883" ||
    code === "42P01" ||
    code === "PGRST202" ||
    code === "PGRST205"
  )
}
