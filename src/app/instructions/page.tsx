import Link from "next/link"
import { listCatalog } from "@/lib/instructions/catalog"
import { InstructionCatalogCards } from "@/components/instructions/instruction-catalog-cards"
import "./instructions.css"

export default async function InstructionsPage({ searchParams }: { searchParams: Promise<{ kit?: string; q?: string; cursor?: string }> }) {
  const params = await searchParams
  let result: Awaited<ReturnType<typeof listCatalog>> = { items: [], nextCursor: null }
  let error = false
  try { result = await listCatalog(params) } catch { error = true }
  const kit = params.kit === "spike" || params.kit === "ev3" ? params.kit : ""
  const q = String(params.q || "").slice(0, 100)
  const next = new URLSearchParams()
  if (kit) next.set("kit", kit)
  if (q) next.set("q", q)
  if (result.nextCursor) next.set("cursor", result.nextCursor)
  return <main className="instruction-page">
    <form action="/instructions" className="instruction-filters">
      <label>Набор<select name="kit" defaultValue={kit}><option value="">Все наборы</option><option value="spike">SPIKE Prime</option><option value="ev3">EV3</option></select></label>
      <label>Поиск<input name="q" type="search" defaultValue={q} placeholder="Название или тема" /></label>
      <button type="submit">Найти</button>
      {(kit || q) && <Link href="/instructions">Сбросить</Link>}
    </form>
    {error && <p role="alert" className="instruction-message">Каталог пока недоступен. Попробуйте позже.</p>}
    {!error && result.items.length === 0 && <p className="instruction-message">Инструкции не найдены. Измените запрос или <Link href="/instructions">сбросьте фильтр</Link>.</p>}
    <InstructionCatalogCards items={result.items} />
    {result.nextCursor && <Link className="instruction-next" href={`/instructions?${next.toString()}`}>Показать ещё</Link>}
  </main>
}
