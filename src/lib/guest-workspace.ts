export type WorkspaceSection = "settings" | "layout" | "board"
export type WorkspaceValues = Partial<Record<WorkspaceSection, unknown>>

export const GUEST_WORKSPACE_PREFIX = "tlc-workspace-guest:v1"

export function guestWorkspaceKey(section: WorkspaceSection): string {
  return `${GUEST_WORKSPACE_PREFIX}:${section}`
}

export function isValidWorkspaceSectionValue(section: WorkspaceSection, value: unknown): boolean {
  if (section === "board") return Array.isArray(value)
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

export function readGuestWorkspaceValues(storage: Pick<Storage, "getItem">): WorkspaceValues {
  const initial: WorkspaceValues = {}
  for (const section of ["settings", "layout", "board"] as const) {
    try {
      const raw = storage.getItem(guestWorkspaceKey(section))
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (isValidWorkspaceSectionValue(section, parsed)) {
        initial[section] = parsed
      }
    } catch {
      // Ignore corrupt guest browser entries so the workspace always opens cleanly.
    }
  }
  return initial
}

export function writeGuestWorkspaceSection(
  storage: Pick<Storage, "setItem">,
  section: WorkspaceSection,
  value: unknown,
): boolean {
  try {
    storage.setItem(guestWorkspaceKey(section), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
