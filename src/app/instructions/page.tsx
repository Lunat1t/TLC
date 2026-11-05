import Link from "next/link"
import { listCatalog } from "@/lib/instructions/catalog"
import { driveDownloadPath } from "@/lib/instructions/drive-links"
import "./instructions.css"
import "./admin-link.css"

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
    <Link href="/" className="instruction-back">← На главную</Link>
    <Link href="/admin/instructions/drive" className="instruction-admin-link">Панель учителя</Link>
    <header className="instruction-heading"><p>Библиотека TLC</p><h1>Инструкции для роботов</h1><span>Нажмите на инструкцию — PDF сразу скачается с Google Drive.</span></header>
    <form action="/instructions" className="instruction-filters">
      <label>Набор<select name="kit" defaultValue={kit}><option value="">Все наборы</option><option value="spike">SPIKE Prime</option><option value="ev3">EV3</option></select></label>
      <label>Поиск<input name="q" type="search" defaultValue={q} placeholder="Название или тема" /></label>
      <button type="submit">Найти</button>
      {(kit || q) && <Link href="/instructions">Сбросить</Link>}
    </form>
    {error ? <p role="alert" className="instruction-message">Каталог пока недоступен. Попробуйте позже.</p> : result.items.length === 0 ? <p className="instruction-message">Инструкции не найдены. Измените запрос или <Link href="/instructions">сбросьте фильтр</Link>.</p> :
      <div className="instruction-grid">{result.items.map((item) => {
        const downloadUrl = driveDownloadPath(item.slug, item.hasPdf)
        const coverUrl = item.coverAssetId
          ? `/api/instruction-media/${item.id}/${item.coverAssetId}`
          : item.hasPdf ? `/api/instructions/${encodeURIComponent(item.slug)}/preview` : null
        const content = <>
          <div className="instruction-cover">{coverUrl ? <img src={coverUrl} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">◈</span>}</div>
          <div className="instruction-card-copy"><h2>{item.title}</h2><p>{item.summary}</p><div className="instruction-topics">{item.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div>
        </>
        return downloadUrl
          ? <a key={item.id} href={downloadUrl} className="instruction-card" rel="noreferrer" referrerPolicy="no-referrer">{content}</a>
          : <Link key={item.id} href={`/instructions/${item.slug}`} className="instruction-card">{content}</Link>
      })}</div>}
    {result.nextCursor && <Link className="instruction-next" href={`/instructions?${next.toString()}`}>Показать ещё</Link>}
  </main>
}
