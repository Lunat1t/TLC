export type NavIconKey =
  | "home"
  | "map"
  | "projects"
  | "battle-pass"
  | "settings"
  | "instructions"
  | "add-instruction"
  | "roadmap-admin"
  | "billing"
  | "school"

export interface NavItem {
  path: string
  label: string
  iconKey: NavIconKey
}

export const MAIN_NAV_TABS: readonly NavItem[] = [
  { path: "/dashboard", label: "Рабочий стол", iconKey: "home" },
  { path: "/projects", label: "Проекты", iconKey: "projects" },
  { path: "/map", label: "Роадмап", iconKey: "map" },
]

const TRANSITION_ROUTE_ORDER: readonly string[] = [
  "/dashboard",
  "/projects",
  "/map",
  "/battle-pass",
  "/settings",
  "/instructions",
  "/billing",
  "/join",
  "/teacher/school",
  "/teacher/roadmap",
  "/admin/instructions/drive",
  "/link-student",
]

const APP_PAGE_PREFIXES: readonly string[] = [
  "/dashboard",
  "/projects",
  "/map",
  "/battle-pass",
  "/settings",
  "/instructions",
  "/billing",
  "/join",
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
  isAdmin?: boolean
  canManageSchool?: boolean
}): NavItem[] {
  const { role, canPublish, canManageSchool } = access
  const items: NavItem[] = []
  if (role === "student" || role === "teacher") {
    items.push({ path: "/instructions", label: "Инструкции", iconKey: "instructions" })
  }
  if (role === "student" || role === "teacher") {
    items.push(
      { path: "/billing", label: "Тарифы и подписка", iconKey: "billing" },
      { path: "/join", label: "Код школы", iconKey: "school" }
    )
  }
  if (canManageSchool || canPublish) {
    items.push({
      path: "/teacher/school",
      label: "Школа и коды",
      iconKey: "school",
    })
  }
  if (canPublish) {
    items.push(
      {
        path: "/admin/instructions/drive",
        label: "Добавить инструкцию",
        iconKey: "add-instruction",
      },
      {
        path: "/teacher/roadmap",
        label: "Настроить роадмап",
        iconKey: "roadmap-admin",
      }
    )
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

export function shouldShowMainNavTabs(role: string | null): boolean {
  return Boolean(role && role !== "parent")
}

export function getVisibleMainNavTabs(access: {
  userId: string | null
  role: string | null
}): NavItem[] {
  if (access.role === "parent") return []
  if (access.userId) {
    return access.role ? [...MAIN_NAV_TABS] : []
  }
  return MAIN_NAV_TABS.filter((tab) => tab.path !== "/map")
}

export function getTopbarBrandTarget(access: {
  userId: string | null
  role: string | null
}): { href: string; label: string } {
  if (access.role === "parent" || (access.userId && !access.role)) {
    return { href: "/settings", label: "Brick Studio — Настройки" }
  }
  return { href: "/dashboard", label: "Brick Studio — Рабочий стол" }
}

export function getRoleLabel(role: string | null, isAdmin: boolean): string {
  if (isAdmin) return "Администратор"
  if (role === "teacher") return "Учитель"
  if (role === "student") return "Ученик"
  if (role === "parent") return "Родитель"
  return "Аккаунт"
}
