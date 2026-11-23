export function afterLoginPath(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard"

  const path = new URL(value, "https://studio.invalid")
  if (path.origin !== "https://studio.invalid") return "/dashboard"
  if (
    ["/map", "/dashboard", "/editor", "/instructions", "/admin/instructions/drive", "/settings"].includes(path.pathname)
    || path.pathname.startsWith("/instructions/")
  ) {
    return path.pathname + path.search
  }
  return "/dashboard"
}
