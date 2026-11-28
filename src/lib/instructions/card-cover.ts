import type { CatalogCard } from "./types"
import { SPIKE_COVER_CODES } from "./spike-cover-codes"

type CoverSource = Pick<CatalogCard, "id" | "slug" | "title" | "kit" | "coverAssetId" | "hasPdf">

/** Четырёхзначный номер SPIKE-инструкции: из названия «Робот (0263)» или из слага «spike-prime-0263». */
export function spikeCardCode(item: Pick<CatalogCard, "slug" | "title" | "kit">): string | null {
  if (item.kit !== "spike") return null
  return item.title.match(/\((\d{4})\)/)?.[1] ?? item.slug.match(/(\d{4})$/)?.[1] ?? null
}

/** Обложка карточки: загруженная вручную → готовая обложка из каталога → первая страница PDF. */
export function catalogCoverUrl(item: CoverSource): string | null {
  if (item.coverAssetId) return `/api/instruction-media/${item.id}/${item.coverAssetId}`
  const code = spikeCardCode(item)
  if (code && SPIKE_COVER_CODES.has(code)) return `/instruction-covers/spike/${code}.jpg`
  return item.hasPdf ? `/api/instructions/${encodeURIComponent(item.slug)}/preview` : null
}
