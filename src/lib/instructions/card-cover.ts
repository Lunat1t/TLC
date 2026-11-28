import type { CatalogCard } from "./types"
import { EV3_COVER_CODES } from "./ev3-cover-codes"
import { SPIKE_COVER_CODES } from "./spike-cover-codes"

type CoverSource = Pick<CatalogCard, "id" | "slug" | "title" | "kit" | "coverAssetId" | "hasPdf">

/** Четырёхзначный номер инструкции: из названия «Робот (0263)» или из слага «spike-prime-0263» / «ev3-0263». */
export function cardCode(item: Pick<CatalogCard, "slug" | "title">): string | null {
  return item.title.match(/\((\d{4})\)/)?.[1] ?? item.slug.match(/(\d{4})$/)?.[1] ?? null
}

/** Обложка карточки: загруженная вручную → готовая обложка из каталога → первая страница PDF. */
export function catalogCoverUrl(item: CoverSource): string | null {
  if (item.coverAssetId) return `/api/instruction-media/${item.id}/${item.coverAssetId}`
  const code = cardCode(item)
  const bundled = item.kit === "ev3" ? EV3_COVER_CODES : SPIKE_COVER_CODES
  if (code && bundled.has(code)) return `/instruction-covers/${item.kit}/${code}.jpg`
  return item.hasPdf ? `/api/instructions/${encodeURIComponent(item.slug)}/preview` : null
}
