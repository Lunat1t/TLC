"use client"

import { useEffect, useState } from "react"

const lines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]
type Mark = "X" | "O" | null
const empty = (): Mark[] => Array(9).fill(null)

function winningLine(cells: Mark[]) {
  return lines.find(([a, b, c]) => cells[a] && cells[a] === cells[b] && cells[b] === cells[c])
}

function computerMove(cells: Mark[]) {
  for (const mark of ["O", "X"] as const) {
    for (const line of lines) {
      const free = line.find(i => cells[i] === null)
      if (free !== undefined && line.filter(i => cells[i] === mark).length === 2) return free
    }
  }
  return [4, 0, 2, 6, 8, 1, 3, 5, 7].find(i => cells[i] === null)
}

export function TicTacToe() {
  const [cells, setCells] = useState(empty)
  const win = winningLine(cells)
  const full = cells.every(Boolean)
  const thinking = !win && !full && cells.filter(Boolean).length % 2 === 1
  useEffect(() => {
    if (!thinking) return
    const timer = window.setTimeout(() => {
      const move = computerMove(cells)
      if (move !== undefined) setCells(current => current === cells
        ? current.map((value, i) => i === move ? "O" : value)
        : current)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [cells, thinking])
  const status = win ? (cells[win[0]] === "X" ? "Твоя победа!" : "Победа компьютера")
    : full ? "Ничья!" : thinking ? "Компьютер ходит…" : "Твой ход · X"
  return <section className="tic-widget" aria-label="Крестики-нолики">
    <h3 className="tic-handle">Крестики-нолики</h3>
    <div className="tic-grid">
      {cells.map((mark, index) => <button key={index} type="button" data-mark={mark} data-win={win?.includes(index) || undefined}
        aria-label={`Строка ${1 + Math.floor(index / 3)}, столбец ${1 + index % 3}: ${mark || "пусто"}`}
        disabled={!!mark || !!win || full || thinking} onClick={() => setCells(cells.map((value, i) => i === index ? "X" : value))}>{mark}</button>)}
    </div>
    <footer><strong role="status">{status}</strong><button type="button" onClick={() => setCells(empty())}>Заново</button></footer>
  </section>
}
