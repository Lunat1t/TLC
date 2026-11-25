import Link from "next/link"
import { Sparkles, Map, Home } from "lucide-react"

export default function BattlePassPage() {
  return (
    <main className="grid min-h-full place-items-center bg-[#edf5f9] p-5 sm:p-10 text-[#242221]">
      <section className="battle-pass-card mx-auto grid max-w-xl gap-5 rounded-md border border-[#26242373] bg-white p-7 sm:p-9 shadow-sm text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-[#fef3c7] text-[#b45309]">
          <Sparkles size={28} aria-hidden="true" />
        </div>
        <span className="mx-auto inline-flex items-center rounded-md bg-[#e8f1f5] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#8350c4]">
          Скоро
        </span>
        <h1 className="text-3xl font-bold tracking-tight">Батл пас</h1>
        <p className="text-sm sm:text-base leading-relaxed text-[#625b6a]">
          Раздел сезонных заданий и наград пока находится в разработке. Здесь появятся уровни, челленджи по сборке и программированию роботов.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/map"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#402b47] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            <Map size={17} aria-hidden="true" />
            Открыть роадмап
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[#26242373] bg-[#f3f8fb] px-5 py-2.5 text-sm font-bold text-[#2d2a29] transition hover:bg-[#e9f2f6]"
          >
            <Home size={17} aria-hidden="true" />
            На рабочий стол
          </Link>
        </div>
      </section>
    </main>
  )
}
