import type { HubType, RobotProject } from "./projects.ts"

export type HubFilter = "all" | HubType
export type ProjectSort = "updated" | "created" | "name"

export function countLabel(count: number): string {
  const ending =
    count % 10 === 1 && count % 100 !== 11
      ? "проект"
      : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)
        ? "проекта"
        : "проектов"
  return `${count} ${ending}`
}

/** Search by name, filter by robot type and sort; never mutates the input. */
export function filterProjects(
  projects: readonly RobotProject[],
  options: { query: string; hub: HubFilter; sort: ProjectSort }
): RobotProject[] {
  const needle = options.query.trim().toLocaleLowerCase("ru-RU")
  const result = projects.filter(
    (p) =>
      (options.hub === "all" || p.hub === options.hub) &&
      (!needle || p.name.toLocaleLowerCase("ru-RU").includes(needle))
  )
  const byDate = (key: "updatedAt" | "createdAt") => (a: RobotProject, b: RobotProject) =>
    String(b[key] || b.createdAt).localeCompare(String(a[key] || a.createdAt))
  if (options.sort === "name") return result.sort((a, b) => a.name.localeCompare(b.name, "ru"))
  return result.sort(byDate(options.sort === "created" ? "createdAt" : "updatedAt"))
}
