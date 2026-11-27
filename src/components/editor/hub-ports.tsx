"use client"
import * as React from 'react'
import {describeHubPorts,hubPortsSummary,type PortKind,type PortInfo} from '@/lib/hub-ports'
import type {SessionState} from '@/lib/controller-runtime'

const TILE_STYLE:Record<PortKind,string>={
  motor:'border-[#555049] bg-[#f6eee1] text-[#252221]',
  ultrasonic:'border-[#555049] bg-white text-[#252221]',
  color:'border-[#555049] bg-white text-[#252221]',
  force:'border-[#555049] bg-white text-[#252221]',
  sensor:'border-[#555049] bg-white text-[#252221]',
  empty:'border-dashed border-[#1d1b1a40] bg-transparent text-[#9a9389]',
  unknown:'border-dashed border-[#1d1b1a40] bg-[#f3efe8] text-[#9a9389]',
}

function Tile({info}:{info:PortInfo}){
  return (
    <li
      className={`flex min-w-0 flex-col items-center rounded-md border px-1 py-1.5 text-center ${TILE_STYLE[info.kind]}`}
      data-port={info.port}
      data-kind={info.kind}
    >
      <span className="text-sm font-extrabold leading-none">{info.port}</span>
      <span className="mt-1 max-w-full truncate text-[10px] font-semibold leading-tight">{info.label}</span>
    </li>
  )
}

/**
 * Живая панель портов хаба A–F. Обновляется сама: хаб присылает список устройств при каждом
 * подключении и отключении кабеля, поэтому перезагружать страницу или хаб не нужно.
 */
export function HubPortsPanel({state,portList,className=''}:{state:Pick<SessionState,'transport'|'ports'|'sensorPorts'|'sensorTypes'|'sensorPortsKnown'>;portList:readonly string[];className?:string}){
  const view=React.useMemo(()=>describeHubPorts(state,portList),[state,portList])
  return (
    <section aria-label="Порты хаба" className={className}>
      <p className="mb-1 text-[11px] font-semibold text-[#726b62]" role="status" aria-live="polite">
        {hubPortsSummary(view)}
      </p>
      <ul className="grid gap-1" style={{gridTemplateColumns:`repeat(${Math.max(1,portList.length)}, minmax(0, 1fr))`}}>
        {view.ports.map(info=><Tile key={info.port} info={info}/>)}
      </ul>
    </section>
  )
}
