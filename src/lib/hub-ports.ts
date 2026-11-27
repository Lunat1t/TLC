import type {SessionState} from './controller-runtime.ts'

export type PortKind='motor'|'ultrasonic'|'color'|'force'|'sensor'|'empty'|'unknown'
export type PortInfo={port:string;kind:PortKind;label:string}
export type HubPortsView={
  /** Данные о портах свежие: хаб на связи и уже прислал список устройств. */
  live:boolean
  ports:PortInfo[]
  motorCount:number
  sensorCount:number
}

const KIND_LABELS:Record<string,string>={
  motor:'Мотор',
  ultrasonic:'Расстояние',
  color:'Цвет',
  force:'Сила',
}

type PortsSource=Pick<SessionState,'transport'|'ports'|'sensorPorts'|'sensorTypes'|'sensorPortsKnown'>

/**
 * Что стоит на каждом порту. Пока хаб не на связи, порты помечаются «неизвестно»,
 * а не «пусто»: так прошлое состояние не выдаётся за текущее.
 */
export function describeHubPorts(state:PortsSource,portList:readonly string[]):HubPortsView{
  const live=state.transport==='ready'&&state.sensorPortsKnown
  let motorCount=0
  let sensorCount=0
  const ports=portList.map((port):PortInfo=>{
    if(!live)return {port,kind:'unknown',label:'—'}
    if(state.ports.includes(port)){motorCount++;return {port,kind:'motor',label:KIND_LABELS.motor}}
    if(state.sensorPorts.includes(port)){
      sensorCount++
      const type=state.sensorTypes[port]
      const kind:PortKind=type==='ultrasonic'||type==='color'||type==='force'?type:'sensor'
      return {port,kind,label:KIND_LABELS[type]??'Датчик'}
    }
    return {port,kind:'empty',label:'Пусто'}
  })
  return {live,ports,motorCount,sensorCount}
}

/** Короткая сводка для подсказок: «Моторов: 2 · датчиков: 1» либо причина, почему данных нет. */
export function hubPortsSummary(view:HubPortsView):string{
  if(!view.live)return 'Нет связи с хабом: порты неизвестны'
  return `Моторов: ${view.motorCount} · датчиков: ${view.sensorCount}`
}

/** Порт выбран в настройках, но мотора на нём сейчас нет (имеет смысл только на живой связи). */
export function isMissingMotor(view:HubPortsView,port:string):boolean{
  if(!view.live)return false
  return view.ports.find(item=>item.port===port)?.kind!=='motor'
}
