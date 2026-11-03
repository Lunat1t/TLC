import Link from "next/link"
import { notFound } from "next/navigation"
import { publishedCard } from "@/lib/instructions/detail"
import "../instructions.css"

export default async function InstructionCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const card = await publishedCard(slug)
  if (!card) notFound()
  return <main className="instruction-page instruction-detail">
    <Link href="/instructions" className="instruction-back">← К инструкциям</Link>
    <div className="instruction-detail-layout">
      <div className="instruction-cover instruction-detail-cover">{card.coverAssetId ? <img src={`/api/instruction-media/${card.id}/${card.coverAssetId}`} alt="" /> : <span aria-hidden="true">◈</span>}</div>
      <div><p className="instruction-kit">{card.kit === "spike" ? "SPIKE Prime" : "LEGO EV3"}</p><h1>{card.title}</h1><p>{card.summary}</p><div className="instruction-topics">{card.topics.map((topic) => <span key={topic}>{topic}</span>)}</div><p className="instruction-hint">Выберите инструкцию для занятия. Шаги сборки появятся после запуска преподавателем.</p><div id="instruction-selection-slot"><Link href="/login" className="instruction-next">Войти, чтобы выбрать</Link></div></div>
    </div>
  </main>
}
