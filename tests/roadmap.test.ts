import assert from "node:assert/strict"
import { rankNames } from "../src/lib/student-level.ts"
import test from "node:test"
import {
  cardTotalPoints,
  computeKitRoadmapState,
  computeSkillLevel,
  isMissingRoadmapMigrationError,
  isRoadmapCardCompleted,
  tierStepCost,
  type RoadmapCard,
} from "../src/lib/roadmap.ts"
import { tokenSkills } from "../src/lib/map-kits.ts"

function makeCard(
  id: string,
  kit: RoadmapCard["kit"],
  rankIndex: number,
  position: number,
  m: number,
  l: number,
  t: number
): RoadmapCard {
  return {
    id,
    kit,
    rankIndex,
    position,
    instructionId: `inst-${id}`,
    instructionSlug: `slug-${id}`,
    title: `Robot ${id}`,
    summary: "",
    coverAssetId: null,
    hasPdf: true,
    mechanicsPoints: m,
    logicPoints: l,
    creativityPoints: t,
  }
}

test("tier step cost uses 70% ceil of tier reward points", () => {
  assert.equal(tierStepCost(0), 0)
  assert.equal(tierStepCost(1), 1)
  assert.equal(tierStepCost(2), 2)
  assert.equal(tierStepCost(5), 4)
  assert.equal(tierStepCost(7), 5)
  assert.equal(tierStepCost(10), 7)
  assert.equal(cardTotalPoints({ mechanicsPoints: 4, logicPoints: 2, creativityPoints: 1 }), 7)
})

test("skill levels advance every 5 points independently of rank", () => {
  const mech = tokenSkills[0]
  assert.equal(computeSkillLevel(mech, 0).level, 1)
  assert.equal(computeSkillLevel(mech, 4).level, 1)
  assert.equal(computeSkillLevel(mech, 4).currentInLevel, 4)
  assert.equal(computeSkillLevel(mech, 5).level, 2)
  assert.equal(computeSkillLevel(mech, 5).currentInLevel, 0)
  assert.equal(computeSkillLevel(mech, 12).level, 3)
  assert.equal(computeSkillLevel(mech, 12).currentInLevel, 2)
})

test("rank progression is per-kit, uses any skill points, and unlocks next tier at cumulative 70% thresholds", () => {
  const cards = [
    // Rank 0 (Junior): total 7 -> stepCost = ceil(7 * 0.7) = 5 -> unlocks Rank 1 at 5 pts
    makeCard("c0", "ev3", 0, 0, 4, 2, 1),
    // Rank 1 (Junior+): total 10 -> stepCost = 7 -> unlocks Rank 2 at 5 + 7 = 12 pts
    makeCard("c1", "ev3", 1, 0, 5, 3, 2),
    // Rank 2 (Middle): total 5
    makeCard("c2", "ev3", 2, 0, 2, 2, 1),
    // Different kit (spike) should stay isolated
    makeCard("s0", "spike", 0, 0, 3, 2, 0),
    makeCard("s1", "spike", 1, 0, 3, 2, 0),
  ]

  // Only 4 mechanics points on EV3 -> still Junior (needs 5)
  let state = computeKitRoadmapState("ev3", cards, {
    c0: { mechanicsDone: true },
  })
  assert.equal(state.totalPoints, 4)
  assert.equal(state.unlockedRank, 0)
  assert.equal(state.nextThreshold, 5)
  assert.equal(state.pointsToNext, 1)

  // Add 1 creativity point -> total 5 -> unlocks Junior+ (Rank 1) regardless of which skills
  state = computeKitRoadmapState("ev3", cards, {
    c0: { mechanicsDone: true, creativityDone: true },
  })
  assert.equal(state.totalPoints, 5)
  assert.equal(state.unlockedRank, 1)
  assert.equal(state.nextThreshold, 12)
  assert.equal(state.pointsToNext, 7)

  // Spike kit remains at Junior (0 pts) independently of EV3
  const spikeState = computeKitRoadmapState("spike", cards, {
    c0: { mechanicsDone: true, creativityDone: true },
    c1: { mechanicsDone: true, logicDone: true, creativityDone: true },
  })
  assert.equal(spikeState.totalPoints, 0)
  assert.equal(spikeState.unlockedRank, 0)
  assert.equal(spikeState.nextThreshold, 4)
})

test("empty rank blocks jumping straight to higher ranks", () => {
  const cards = [
    makeCard("c0", "ev3", 0, 0, 6, 0, 0), // step = 5
    // Rank 1 intentionally empty!
    makeCard("c2", "ev3", 2, 0, 6, 0, 0),
  ]

  const state = computeKitRoadmapState("ev3", cards, {
    c0: { mechanicsDone: true },
  })
  assert.equal(state.totalPoints, 6)
  assert.equal(state.unlockedRank, 0)
  assert.equal(state.tiers[1].tierConfigured, false)
  assert.equal(state.tiers[2].tierConfigured, false)
  assert.equal(state.nextThreshold, null)
})

test("ratchet rule prevents rank rollback when new cards are added to already passed tiers", () => {
  const cardsAfterAddition = [
    makeCard("c0a", "ev3", 0, 0, 4, 1, 0), // 5
    makeCard("c0b", "ev3", 0, 1, 5, 5, 0), // +10 added later -> tier 0 total 15 -> step 11
    makeCard("c1", "ev3", 1, 0, 5, 0, 0),  // tier 1 step 4 -> threshold(2) = 15
    makeCard("c2", "ev3", 2, 0, 5, 0, 0),
  ]

  // Student previously unlocked Rank 1 with 4 pts; now threshold(1) jumped to 11
  const state = computeKitRoadmapState(
    "ev3",
    cardsAfterAddition,
    { c0a: { mechanicsDone: true } },
    1
  )
  assert.equal(state.computedRank, 0)
  assert.equal(state.unlockedRank, 1)
  assert.equal(state.tiers[1].unlocked, true)
  assert.equal(state.tiers[2].unlocked, false)
  assert.equal(state.nextThreshold, 15)
  assert.equal(state.pointsToNext, 11)
})

test("1-2 card tiers unlock cleanly without fractional deadlocks and completion helper checks positive rewards", () => {
  const oneCard = makeCard("single", "vex", 0, 0, 1, 0, 0)
  const twoCardsA = makeCard("a", "vex", 1, 0, 1, 1, 0) // 2
  const twoCardsB = makeCard("b", "vex", 1, 1, 1, 0, 0) // 1 -> tier 1 total = 3, step = ceil(2.1) = 3
  const r2 = makeCard("r2", "vex", 2, 0, 2, 0, 0)

  const cards = [oneCard, twoCardsA, twoCardsB, r2]
  const s1 = computeKitRoadmapState("vex", cards, { single: { mechanicsDone: true } })
  assert.equal(s1.unlockedRank, 1)
  assert.equal(isRoadmapCardCompleted(oneCard, { mechanicsDone: true }), true)
  assert.equal(isRoadmapCardCompleted(twoCardsA, { mechanicsDone: true }), false)
  assert.equal(isRoadmapCardCompleted(twoCardsA, { mechanicsDone: true, logicDone: true }), true)
})

test("isMissingRoadmapMigrationError only matches explicit missing schema/function codes", () => {
  assert.equal(isMissingRoadmapMigrationError({ code: "42883", message: "function does not exist" }), true)
  assert.equal(isMissingRoadmapMigrationError({ code: "42P01", message: "relation does not exist" }), true)
  assert.equal(isMissingRoadmapMigrationError({ code: "PGRST202", message: "missing rpc" }), true)
  assert.equal(isMissingRoadmapMigrationError({ code: "PGRST205", message: "missing table" }), true)

  assert.equal(isMissingRoadmapMigrationError({ code: "42501", message: "tlc_instruction_access permission denied" }), false)
  assert.equal(isMissingRoadmapMigrationError({ code: "57014", message: "canceling statement due to statement timeout in roadmap_cards" }), false)
  assert.equal(isMissingRoadmapMigrationError(new Error("tlc_roadmap_state failed")), false)
})

test("student level rank names spell Middle and Middle+ correctly", () => {
  assert.deepEqual([...rankNames], ["Junior", "Junior+", "Middle", "Middle+", "Senior", "Senior+", "King"])
})
