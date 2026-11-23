export function afterLoginPath(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard"

  const path = new URL(value, "https://studio.invalid")
  if (path.origin !== "https://studio.invalid") return "/dashboard"
  if (
    [
      "/map",
      "/dashboard",
      "/editor",
      "/instructions",
      "/admin/instructions/drive",
      "/settings",
      "/billing",
      "/join",
      "/teacher/school",
      "/teacher/roadmap",
    ].includes(path.pathname) ||
    path.pathname.startsWith("/instructions/")
  ) {
    return path.pathname + path.search
  }
  return "/dashboard"
}

export interface MiddlewareRouteInfo {
  registerPage: boolean
  loginPage: boolean
  uploadPage: boolean
  teacherRoadmapPage: boolean
  teacherSchoolPage: boolean
  guestWorkspacePage: boolean
  authRequiredPage: boolean
  protectedPage: boolean
}

export function classifyMiddlewareRoute(path: string, search = ""): MiddlewareRouteInfo {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const registerPage = path === "/register" && !params.has("student")
  const loginPage = path === "/login"
  const uploadPage = path === "/admin/instructions/drive"
  const teacherRoadmapPage = path === "/teacher/roadmap" || path.startsWith("/teacher/roadmap/")
  const teacherSchoolPage = path === "/teacher/school" || path.startsWith("/teacher/school/")
  const guestWorkspacePage =
    path === "/dashboard" || path === "/editor" || path === "/billing" || path === "/join"
  const authRequiredPage =
    path === "/map" ||
    uploadPage ||
    teacherRoadmapPage ||
    teacherSchoolPage ||
    path === "/instructions" ||
    path.startsWith("/instructions/")
  return {
    registerPage,
    loginPage,
    uploadPage,
    teacherRoadmapPage,
    teacherSchoolPage,
    guestWorkspacePage,
    authRequiredPage,
    protectedPage: guestWorkspacePage || authRequiredPage,
  }
}

export function getAnonymousRedirect(path: string, search = ""): string | null {
  const { authRequiredPage } = classifyMiddlewareRoute(path, search)
  if (!authRequiredPage) return null
  const next = search ? `${path}${search.startsWith("?") ? search : `?${search}`}` : path
  return `/login?${new URLSearchParams({ next })}`
}
