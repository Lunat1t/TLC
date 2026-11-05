const INSTRUCTION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function driveDownloadPath(slug: string, hasPdf: boolean) {
  if (!hasPdf || !INSTRUCTION_SLUG.test(slug)) return null
  return `/api/instructions/${encodeURIComponent(slug)}/download`
}
