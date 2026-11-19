export const rankNames = ["Junior", "Junior+", "Midle", "Midle+", "Senior", "Senior+", "King"] as const

export function studentLevel(totalXp: number) {
  let remaining = Math.max(0, Math.floor(totalXp))
  let rank = 0
  let required = 50
  while (rank < rankNames.length - 1 && remaining >= required * 10) {
    remaining -= required * 10
    rank += 1
    required += 50
  }
  return {
    rank,
    level: rank * 10 + 1 + Math.floor(remaining / required),
    earned: remaining % required,
    required,
  }
}
