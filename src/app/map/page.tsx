import Link from "next/link"
import { mapKits } from "@/lib/map-kits"

export default async function MapPage({ searchParams }: { searchParams: Promise<{ kit?: string }> }) {
  const { kit } = await searchParams
  const selected = mapKits.find(item => item.id === kit)
  return <main className="min-h-full bg-[#f3ead7] p-5 sm:p-10">
    <section className="mx-auto grid max-w-2xl gap-5 rounded-3xl bg-white p-6">
      <h1 className="text-3xl font-black">Карта</h1>
      <nav aria-label="Выбор набора" className="flex flex-wrap gap-2">
        {mapKits.map(item => <Link key={item.id} href={'/map?kit=' + item.id} aria-current={item === selected ? "page" : undefined} className="rounded-xl bg-stone-100 px-4 py-3 font-bold aria-[current=page]:bg-cyan-800 aria-[current=page]:text-white">{item.label}</Link>)}
      </nav>
      <p>{selected ? selected.label + " · Пока нет заданий" : "Выбери набор"}</p>
    </section>
  </main>
}
