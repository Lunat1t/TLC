"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { PDFDocumentProxy } from "pdfjs-dist"
export function PdfReader({slug,title}:{slug:string;title:string}){
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[zoom,setZoom]=useState(1),[error,setError]=useState(""),[busy,setBusy]=useState(true)
 const canvas=useRef<HTMLCanvasElement>(null),area=useRef<HTMLDivElement>(null),[width,setWidth]=useState(600)
 useEffect(()=>{let alive=true;let task:ReturnType<typeof import("pdfjs-dist")["getDocument"]>|undefined
 setBusy(true);setError("")
 void import("pdfjs-dist").then(lib=>{if(!alive)return;lib.GlobalWorkerOptions.workerSrc="/vendor/pdf.worker.min.mjs";task=lib.getDocument({url:`/api/instructions/${encodeURIComponent(slug)}/document`});return task.promise}).then(doc=>{if(!alive||!doc)return;setPdf(doc);try{const saved=Number(localStorage.getItem(`tlc-pdf-page:${slug}`));setPage(Math.max(1,Math.min(doc.numPages,Math.trunc(saved)||1)))}catch{};setBusy(false)}).catch(()=>{if(alive){setError("Не удалось открыть PDF. Повторите загрузку страницы или скачайте оригинал.");setBusy(false)}})
 return()=>{alive=false;void task?.destroy()}
 },[slug])
 useEffect(()=>{const el=area.current;if(!el)return;const observer=new ResizeObserver(()=>setWidth(Math.max(200,el.clientWidth-24)));observer.observe(el);return()=>observer.disconnect()},[])
 useEffect(()=>{if(!pdf)return;let cancelled=false;let render:ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>|undefined
 setBusy(true);setError("");void pdf.getPage(page).then(p=>{if(cancelled||!canvas.current)return;const view=p.getViewport({scale:1});const viewport=p.getViewport({scale:Math.min(width/view.width,1.6)*zoom});const el=canvas.current;const ratio=Math.min(window.devicePixelRatio||1,2);el.width=viewport.width*ratio;el.height=viewport.height*ratio;el.style.width=`${viewport.width}px`;el.style.height=`${viewport.height}px`;render=p.render({canvas:el,viewport,transform:[ratio,0,0,ratio,0,0]});return render.promise}).then(()=>{if(!cancelled)setBusy(false)}).catch(()=>{if(!cancelled){setError("Не удалось показать страницу.");setBusy(false)}})
 try{localStorage.setItem(`tlc-pdf-page:${slug}`,String(page))}catch{}
 return()=>{cancelled=true;render?.cancel()}
 },[pdf,page,width,zoom,slug])
 return <main className="pdf-reader"><header><Link href={`/instructions/${slug}`}>← Инструкция</Link><strong>{title}</strong><a href={`/api/instructions/${slug}/download`}>Скачать PDF</a></header><div className="pdf-controls"><button disabled={!pdf||page<=1} onClick={()=>setPage(p=>p-1)} aria-label="Предыдущая страница">←</button><label>Страница <input aria-label="Номер страницы" type="number" min={1} max={pdf?.numPages||1} value={page} onChange={e=>{if(pdf)setPage(Math.max(1,Math.min(pdf.numPages,Math.trunc(Number(e.target.value))||1)))}}/> / {pdf?.numPages||"…"}</label><button disabled={!pdf||page>=pdf.numPages} onClick={()=>setPage(p=>p+1)} aria-label="Следующая страница">→</button><label>Масштаб <select value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>По ширине</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label></div><div ref={area} className="pdf-paper-area" aria-busy={busy}>{busy&&<p role="status">Загрузка страницы…</p>}{error&&<p role="alert">{error}</p>}<canvas ref={canvas} aria-label={`Страница ${page}: ${title}`}/></div></main>
}
