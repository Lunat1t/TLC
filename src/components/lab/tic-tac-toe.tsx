"use client"

import { useState } from "react"

const lines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]
type Mark = "X" | "O" | null
const empty = (): Mark[] => Array(9).fill(null)

export function TicTacToe() {
  const [cells, setCells] = useState(empty)
  const win = lines.find(([a, b, c]) => cells[a] && cells[a] === cells[b] && cells[b] === cells[c])
  const full = cells.every(Boolean)
  const next = cells.filter(Boolean).length % 2 ? "O" : "X"
  const status = win ? `Победа ${cells[win[0]]}!` : full ? "Ничья!" : `Ход ${next}`
  return <section className="tic-widget" aria-label="Крестики-нолики">
    <h3 className="tic-handle">Крестики-нолики</h3>
    <div className="tic-grid">
      {cells.map((mark, index) => <button key={index} type="button" data-mark={mark} data-win={win?.includes(index) || undefined}
        aria-label={`Строка ${1 + Math.floor(index / 3)}, столбец ${1 + index % 3}: ${mark || "пусто"}`}
        disabled={!!mark || !!win || full} onClick={() => setCells(cells.map((value, i) => i === index ? next : value))}>{mark}</button>)}
    </div>
    <footer><strong role="status">{status}</strong><button type="button" onClick={() => setCells(empty())}>Заново</button></footer>
  </section>
}
