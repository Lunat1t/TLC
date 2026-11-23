export function isApplicationPath(path: string) {
  return ["/map", "/battle-pass", "/dashboard", "/instructions", "/editor", "/teacher", "/admin", "/link-student"]
    .some(base => path === base || path.startsWith(`${base}/`))
}

export function createRouteWarmer(prefetch: (path: string) => void, now = Date.now) {
  const warmed = new Map<string, number>()
  return {
    warm(path: string) {
      if (!path.startsWith("/") || path.startsWith("//")) return
      if (now() - (warmed.get(path) ?? -Infinity) < 30_000) return
      warmed.set(path, now())
      try { prefetch(path) }
      catch { warmed.delete(path) } // A failed background preload never blocks navigation.
    },
    clear() { warmed.clear() },
  }
}
