export type NavIconKey =
  | "home"
  | "map"
  | "battle-pass"
  | "settings"
  | "instructions"
  | "avatar"
  | "profile"
  | "add-instruction"
  | "achievements"

export interface NavItem {
  path: string
  label: string
  iconKey: NavIconKey
}

export const MAIN_NAV_TABS: readonly NavItem[] = [
  { path: "/dashboard", label: "Рабочий стол", iconKey: "home" },
  { path: "/map", label: "Роадмап", iconKey: "map" },
  { path: "/battle-pass", label: "Батл пас", iconKey: "battle-pass" },
  { path: "/settings", label: "Настройки", iconKey: "settings" },
]

const TRANSITION_ROUTE_ORDER: readonly string[] = [
  "/dashboard",
  "/map",
  "/battle-pass",
  "/settings",
  "/instructions",
  "/avatar",
  "/profile",
  "/teacher/achievements",
  "/admin/instructions/drive",
  "/link-student",
]

const APP_PAGE_PREFIXES: readonly string[] = [
  "/dashboard",
  "/map",
  "/battle-pass",
  "/settings",
  "/instructions",
  "/avatar",
  "/profile",
  "/teacher",
  "/admin",
  "/link-student",
]

export function isNavigableAppPath(path: string): boolean {
  return APP_PAGE_PREFIXES.some(
    (base) => path === base || path.startsWith(`${base}/`)
  )
}

export function isNavPathActive(currentPath: string, targetPath: string): boolean {
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
}

export function getExtraNavPages(access: {
  role: string | null
  canPublish: boolean
  isAdmin: boolean
}): NavItem[] {
  const { role, canPublish, isAdmin } = access
  const items: NavItem[] = []
  if (role === "student" || role === "teacher") {
    items.push(
      { path: "/instructions", label: "Инструкции", iconKey: "instructions" },
      { path: "/avatar", label: "Персонажи", iconKey: "avatar" }
    )
  }
  items.push({ path: "/profile", label: "Профиль", iconKey: "profile" })
  if (canPublish) {
    items.push({
      path: "/admin/instructions/drive",
      label: "Добавить инструкцию",
      iconKey: "add-instruction",
    })
  }
  if (role === "teacher" || isAdmin) {
    items.push({
      path: "/teacher/achievements",
      label: isAdmin ? "Прогресс учеников" : "Достижения учеников",
      iconKey: "achievements",
    })
  }
  return items
}

function resolveRouteOrderIndex(path: string | null): number {
  if (!path) return -1
  return TRANSITION_ROUTE_ORDER.findIndex(
    (base) => path === base || path.startsWith(`${base}/`)
  )
}

export function getRouteTransitionDirection(
  prevPath: string | null,
  nextPath: string
): -1 | 0 | 1 {
  if (!prevPath || prevPath === nextPath) return 0
  const prevIndex = resolveRouteOrderIndex(prevPath)
  const nextIndex = resolveRouteOrderIndex(nextPath)
  if (prevIndex === -1 || nextIndex === -1 || prevIndex === nextIndex) return 0
  return nextIndex > prevIndex ? 1 : -1
}

export function getRoleLabel(role: string | null, isAdmin: boolean): string {
  if (isAdmin) return "Администратор"
  if (role === "teacher") return "Учитель"
  if (role === "student") return "Ученик"
  if (role === "parent") return "Родитель"
  return "Аккаунт"
}
