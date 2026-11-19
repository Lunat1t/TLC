"use client"

import { useEffect, useRef, useState } from "react"

export function CameraGame() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    function stopWhenHidden() {
      if (document.hidden) dialog.current?.close()
    }
    document.addEventListener("visibilitychange", stopWhenHidden)
    return () => document.removeEventListener("visibilitychange", stopWhenHidden)
  }, [])
  return <section className="tic-widget rps-widget">
    <h3 className="tic-handle">Камень, ножницы, бумага</h3>
    <div aria-hidden="true" className="rps-moves">✊ ✌️ ✋</div>
    <button type="button" onClick={() => { dialog.current?.showModal(); setPlaying(true) }}>Играть</button>
    <dialog ref={dialog} className="rps-dialog" aria-label="Камень, ножницы, бумага" onClose={() => setPlaying(false)}>
      <header><strong>Камень, ножницы, бумага</strong><button autoFocus type="button" onClick={() => dialog.current?.close()}>Закрыть</button></header>
      {playing && <iframe title="Игра с камерой" allow="camera 'self'" src="/games/camera-rps/index.html" />}
    </dialog>
  </section>
}
