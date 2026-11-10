"use client"
import {useRef,type ReactNode} from 'react'
import {Plus} from 'lucide-react'
export function VirtualDesktops({page,count,onChange,onAdd,children}:{page:number;count:number;onChange:(page:number)=>void;onAdd:()=>void;children:ReactNode}){
 function change(next:number){if(document.activeElement instanceof HTMLElement)document.activeElement.blur();onChange(next)}
 const start=useRef<{x:number;y:number}|null>(null)
 return <div className="virtual-desktops" onTouchStart={e=>{start.current=null;if(e.touches.length!==1||(e.target as Element).closest('a,button,input,textarea,select,.desktop-drag-handle,dialog'))return;start.current={x:e.touches[0].clientX,y:e.touches[0].clientY}}} onTouchCancel={()=>{start.current=null}} onTouchEnd={e=>{const origin=start.current;start.current=null;if(!origin||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-origin.x,dy=e.changedTouches[0].clientY-origin.y;if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.5)change(Math.min(count-1,Math.max(0,page+(dx<0?1:-1))))}}>
 <nav className="desktop-pages" aria-label="Рабочие столы">{Array.from({length:count},(_,index)=><button key={index} aria-label={`Рабочий стол ${index+1}`} aria-current={page===index?'page':undefined} title={`Рабочий стол ${index+1}`} onClick={()=>change(index)}><i/></button>)}{count<6&&<button aria-label="Добавить рабочий стол" title="Добавить рабочий стол" onClick={onAdd}><Plus size={17}/></button>}</nav>
 <span className="desktop-page-announcement" role="status">Рабочий стол {page+1} из {count}</span>{children}</div>
}
