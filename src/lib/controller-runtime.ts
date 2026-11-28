import {commandsFor, controllerHandler, controllerRuntimeErrors, describeAction, DRIVE_PORTS, type ControllerAction, type ControllerEvent, type ControllerHandler, type ControllerProgram, type SensorCheck, type SensorCondition} from './controller-program.ts'
import {
  SERVICE,
  COMMAND_EVENT,
  HUB_CAPABILITIES,
  FEATURE_MULTI_MPY_V6,
  HUB_PROGRAM_VERSION,
  commandBytes,
  parseEvent,
  parseHubCapabilities,
  stopProgramBytes,
  startProgramBytes,
  writeProgramMetaBytes,
  writeUserRamBytes,
} from '../../public/pybricks-protocol.js'
import {soundSteps} from './sound/presets.ts'
import {subscribeNotifications} from '../../public/notifications.js'

type Target = {controlId:string;input:string}
type ConnectResult = {hubName?:string|null}|void
type StartHubOptions = {signal?:AbortSignal;probe?:boolean}
type Transport = {
  connect(onLine:(line:string)=>void,onDisconnect:()=>void):Promise<ConnectResult>
  startHub(options?:StartHubOptions):Promise<void>
  write(line:string):Promise<void>
  disconnect():Promise<void>
  uploadProgram?(blob:Uint8Array,onProgress:(percent:number)=>void,signal?:AbortSignal):Promise<void>
  stopProgram?():Promise<void>
}
export type SensorTelemetry={
  color?:string
  reflection?:number
  pressed?:boolean
  force?:number
  heading?:number
  pitch?:number
  roll?:number
}
type Status = 'disconnected'|'connecting'|'connected'|'uploading'|'starting-hub'|'ready'|'fault'
export type SessionState={
  viewMode:'edit'|'check'
  transport:Status
  program:'idle'|'trial-running'|'live-running'|'custom-running'|'stopped'
  message:string
  log:string[]
  ports:string[]
  sensorPorts:string[]
  sensorPortsKnown:boolean
  sensorDistances:Record<string,number|null>
  sensorTypes:Record<string,string>
  sensorTelemetry:Record<string,SensorTelemetry>
  protocol:2|3|null
  uploadProgress:number|null
  hubName:string|null
  needsManualHubProgram?:boolean
}
const TONE_OVERLAP_MS=100
type SoundAction=Extract<ControllerAction,{kind:'sound'}>
type SessionOptions={
  compileHubProgram?:()=>Promise<Uint8Array>
  compileCustomProgram?:(source:string)=>Promise<Uint8Array>
  expectedVersion?:string
  probeTimeoutMs?:number
  heartbeatTimeoutMs?:number
}
type Clock={now:()=>number;setTimeout:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;clearTimeout:(id:ReturnType<typeof setTimeout>)=>void;setInterval:(fn:()=>void,ms:number)=>ReturnType<typeof setInterval>;clearInterval:(id:ReturnType<typeof setInterval>)=>void}
const systemClock:Clock={now:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id),setInterval:(fn,ms)=>setInterval(fn,ms),clearInterval:id=>clearInterval(id)}
const LOOP_TICK_MS=10
/** Есть ли в списке то, что зависит от датчиков: тогда программа идёт и в пробном режиме. */
const hasSensorFlow=(list:ControllerAction[]):boolean=>list.some(a=>a.kind==='branch'||a.kind==='waitSensor'||(a.kind==='loop'&&(Boolean(a.condition)||hasSensorFlow(a.bodyActions))))
const sleep=(ms:number,signal?:AbortSignal,clock:Clock=systemClock)=>new Promise<void>((resolve,reject)=>{
  if(signal?.aborted)return reject(abortError('Отменено'))
  const timer=clock.setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms)
  const abort=()=>{clock.clearTimeout(timer);reject(abortError('Отменено'))}
  signal?.addEventListener('abort',abort,{once:true})
})

/** Разбор строки «A:motor,C:ultrasonic,…» из SOCER_PORTS: моторы отдельно, датчики с типами отдельно. */
export function parsePortsReport(body:string){
  const ports:string[]=[]
  const sensorPorts:string[]=[]
  const sensorTypes:Record<string,string>={}
  for(const token of body.split(',').filter(Boolean)){
    const sep=token.indexOf(':')
    if(sep<=0)continue
    const port=token.slice(0,sep).trim()
    const kind=token.slice(sep+1).trim()
    if(!port||!kind)continue
    if(kind==='motor')ports.push(port)
    else{sensorPorts.push(port);sensorTypes[port]=kind}
  }
  return {ports,sensorPorts,sensorTypes}
}

export class ProbeNeedsUploadError extends Error {}
class UnsupportedFirmwareError extends Error {
  code='UNSUPPORTED_FIRMWARE'
}

function abortError(message:string) {
  const err=new Error(message)
  err.name='AbortError'
  return err
}

function isUserCancelError(error:unknown) {
  return Boolean(error && typeof error==='object' && 'name' in error && ((error as {name?:string}).name==='NotFoundError' || (error as {name?:string}).name==='AbortError'))
}

function withTimeout<T>(promise:Promise<T>,ms:number,message:string,clock:Clock=systemClock):Promise<T>{
  return new Promise<T>((resolve,reject)=>{const timer=clock.setTimeout(()=>reject(new Error(message)),ms);promise.then(value=>{clock.clearTimeout(timer);resolve(value)},error=>{clock.clearTimeout(timer);reject(error)})})
}

function targetKey(target: Target) {
  return `${target.controlId}:${target.input}`
}

function driveActions(handler: ControllerHandler, handlers: ControllerHandler[], held: ReadonlySet<string>): ControllerAction[] {
  const speeds = new Map<string, number>()
  for (const action of handler.actions) {
    if ('port' in action) speeds.set(action.port, 0)
  }

  const directions = new Set<ControllerHandler['button']>()
  let maxSpeed = 1
  for (const candidate of handlers) {
    if (candidate.driveAreaId !== handler.driveAreaId || candidate.event !== 'pressed' ||
        !candidate.target || !held.has(targetKey(candidate.target)) || directions.has(candidate.button)) continue
    directions.add(candidate.button)
    for (const action of candidate.actions) {
      if (action.kind !== 'run') continue
      speeds.set(action.port, (speeds.get(action.port) ?? 0) + action.speed)
      maxSpeed = Math.max(maxSpeed, Math.abs(action.speed))
    }
  }

  const scale = Math.max(1, ...Array.from(speeds.values(), speed => Math.abs(speed) / maxSpeed))
  return Array.from(speeds, ([port, total]) => {
    const speed = Math.round(total / scale)
    return speed ? {kind:'run', port, speed} : {kind:'stop', port}
  })
}

/** One owner for the transport, queues, motors and cancellation epoch. */
export function createControllerSession(transport:Transport,clock:Clock=systemClock,options?:SessionOptions) {
  let state:SessionState={
    viewMode:'edit',
    transport:'disconnected',
    program:'idle',
    message:'Не подключён',
    log:[],
    ports:[],
    sensorPorts:[],
    sensorPortsKnown:false,
    sensorDistances:{},
    sensorTypes:{},
    sensorTelemetry:{},
    protocol:null,
    uploadProgress:null,
    hubName:null,
    needsManualHubProgram:false,
  }
  const expectedVersion=options?.expectedVersion ?? (transport.uploadProgram ? HUB_PROGRAM_VERSION : undefined)
  const probeTimeoutMs=options?.probeTimeoutMs ?? 1200
  const heartbeatTimeoutMs=options?.heartbeatTimeoutMs ?? 3500
  const listeners=new Set<(s:SessionState)=>void>();let epoch=0;let connection=0;let disposed=false
  let queue:Promise<void>=Promise.resolve();let stopPromise:Promise<void>|null=null;let writeFailed=false
  let heartbeat:ReturnType<typeof setInterval>|null=null;let lastAck=0;let lastHeartbeat=0;let lastWriteAt=0
  let readyWait:{resolve:()=>void;reject:(e:Error)=>void}|null=null
  let stopWait:{resolve:()=>void;reject:(e:Error)=>void}|null=null
  let startAbort:AbortController|null=null
  let lastHubVersion:string|null=null
  let uploadedThisConnect=false
  let customProgramActive=false
  let snapshot:ControllerProgram|null=null
  // Динамик один: новый звук прерывает предыдущий.
  let sound:{key:string;abort:AbortController;done:Promise<void>}|null=null
  const runners=new Map<string,AbortController>();const owners=new Map<string,AbortController>();const held=new Set<string>()
  type ActiveHold={key:string;handler:ControllerHandler;ports:string[];ownedRunners:Set<AbortController>}
  const activeHolds=new Map<string,ActiveHold>()
  const isStopHold = (hold: ActiveHold, port: string) =>
    hold.ports.includes(port) && hold.handler.actions.every(action => action.kind === 'stop' || action.kind === 'stopAll')
  const sensorWaiters=new Set<()=>void>()
  const notifySensorWaiters=()=>{for(const wake of Array.from(sensorWaiters))wake()}
  const evalCheck=(check:SensorCheck)=>{
    const tel=state.sensorTelemetry[check.port]
    if(!tel)return false
    switch(check.kind){
      case 'color':return tel.color===check.color
      case 'reflection':return tel.reflection!==undefined&&(check.op==='lt'?tel.reflection<check.value:tel.reflection>check.value)
      case 'pressed':return tel.pressed!==undefined&&tel.pressed===check.pressed
      case 'force':return tel.force!==undefined&&(check.op==='lt'?tel.force<check.value:tel.force>check.value)
      case 'heading':return tel.heading!==undefined&&(check.op==='lt'?tel.heading<check.value:tel.heading>check.value)
      case 'tilt':{
        const val=check.axis==='roll'?tel.roll:tel.pitch
        return val!==undefined&&(check.op==='lt'?val<check.value:val>check.value)
      }
      default:return false
    }
  }
  const evalCondition=(cond:SensorCondition|{port:string;op?:'lt'|'gt';cm?:number;checks?:SensorCheck[]})=>{
    if('checks' in cond && Array.isArray(cond.checks) && cond.checks.length>0){
      return cond.checks.every(evalCheck)
    }
    const port='port' in cond ? cond.port : 'C'
    const op='op' in cond && cond.op==='gt' ? 'gt' : 'lt'
    const cm='cm' in cond && typeof cond.cm==='number' ? cond.cm : 20
    const dist=state.sensorDistances[port]
    if(op==='lt')return dist!==undefined&&dist!==null&&dist<cm
    if(dist===null)return true
    return dist!==undefined&&dist>cm
  }
  const collectDrivenPorts=(actions:ControllerAction[],acc=new Set<string>()):string[]=>{
    for(const a of actions){
      if(a.kind==='stopAll') for(const port of stopAllPorts()) acc.add(port)
      if((a.kind==='stop'||a.kind==='run'||a.kind==='dc'||a.kind==='angle'||a.kind==='time'||a.kind==='dcTime')&&a.port)acc.add(a.port)
      if(a.kind==='branch'){collectDrivenPorts(a.thenActions,acc);collectDrivenPorts(a.elseActions,acc)}
      if(a.kind==='loop')collectDrivenPorts(a.bodyActions,acc)
    }
    return [...acc]
  }
  const findContinuousForPort=(actions:ControllerAction[],port:string):Extract<ControllerAction,{kind:'run'|'dc'}>|undefined=>{
    let found:Extract<ControllerAction,{kind:'run'|'dc'}>|undefined
    for(const a of actions){
      if((a.kind==='run'||a.kind==='dc')&&a.port===port)found=a
      else if(a.kind==='branch'){
        const chosen=evalCondition(a.condition)?a.thenActions:a.elseActions
        const nested=findContinuousForPort(chosen,port)
        if(nested)found=nested
      }
      else if(a.kind==='loop'){
        const nested=findContinuousForPort(a.bodyActions,port)
        if(nested)found=nested
      }
    }
    return found
  }
  const publish=(patch:Partial<SessionState>)=>{if(disposed)return;state={...state,...patch};for(const f of listeners)f(state)}
  const log=(line:string)=>publish({log:[...state.log,line].slice(-30)})
  const clear=()=>{epoch++;sound?.abort.abort();sound=null;for(const run of runners.values())run.abort();runners.clear();owners.clear();held.clear();activeHolds.clear();snapshot=null;notifySensorWaiters();if(heartbeat)clock.clearInterval(heartbeat);heartbeat=null}
  const disconnectTransport=async()=>{
    connection++
    startAbort?.abort();startAbort=null
    readyWait?.reject(new Error('Соединение закрыто'));readyWait=null
    stopWait?.reject(new Error('Соединение закрыто'));stopWait=null
    lastHubVersion=null;uploadedThisConnect=false;customProgramActive=false
    await transport.disconnect().catch(()=>{})
  }
  const fault=async(message:string,extra?:Partial<SessionState>)=>{
    clear()
    publish({transport:'fault',program:'stopped',uploadProgress:null,message,ports:[],sensorPorts:[],sensorPortsKnown:false,sensorDistances:{},sensorTypes:{},sensorTelemetry:{},protocol:null,...extra})
    await disconnectTransport()
  }
  const line=(text:string,serial:number)=>{
    if(disposed||serial!==connection)return
    if(text==='SOCER2_ACK'){lastAck=clock.now();return}
    if(text.startsWith('SOCER_VER|')){lastHubVersion=text.slice('SOCER_VER|'.length).trim();return}
    if(text.startsWith('SOCER_SENSORS|')){
      const sensorPorts:string[]=[]
      const sensorTypes:Record<string,string>={}
      for(const token of text.slice('SOCER_SENSORS|'.length).split(',').filter(Boolean)){
        const sep=token.indexOf(':')
        const port=(sep>0?token.slice(0,sep):token).trim()
        const stype=(sep>0?token.slice(sep+1):'ultrasonic').trim()
        if(!port)continue
        sensorTypes[port]=stype
        if(port!=='IMU')sensorPorts.push(port)
      }
      publish({sensorPorts,sensorTypes,sensorPortsKnown:true})
      return
    }
    if(text.startsWith('SOCER_PORTS|')){
      // Живой список устройств на портах A–F: приходит при запуске и при каждом подключении/отключении.
      const parsed=parsePortsReport(text.slice('SOCER_PORTS|'.length))
      const sensorTypes:Record<string,string>={...parsed.sensorTypes}
      if(state.sensorTypes.IMU)sensorTypes.IMU=state.sensorTypes.IMU
      const keep=<T>(source:Record<string,T>)=>Object.fromEntries(Object.entries(source).filter(([port])=>port==='IMU'||parsed.sensorPorts.includes(port))) as Record<string,T>
      publish({ports:parsed.ports,sensorPorts:parsed.sensorPorts,sensorTypes,sensorPortsKnown:true,sensorDistances:keep(state.sensorDistances),sensorTelemetry:keep(state.sensorTelemetry)})
      return
    }
    if(text.startsWith('SOCER_SNS|')){
      const next={...state.sensorTelemetry}
      for(const entry of text.slice('SOCER_SNS|'.length).split(',')){
        const sep=entry.indexOf(':')
        if(sep<=0)continue
        const port=entry.slice(0,sep).trim()
        const body=entry.slice(sep+1).trim()
        if(!port||!body)continue
        const tel:SensorTelemetry={...(next[port]||{})}
        for(const kv of body.split('&')){
          const eq=kv.indexOf('=')
          if(eq<=0)continue
          const k=kv.slice(0,eq),v=kv.slice(eq+1)
          if(k==='c')tel.color=v
          else if(k==='r'){const n=Number(v);if(Number.isFinite(n)){if(port==='IMU')tel.roll=n;else tel.reflection=n}}
          else if(k==='p'){const n=Number(v);if(Number.isFinite(n)){if(port==='IMU')tel.pitch=n;else tel.pressed=n!==0}}
          else if(k==='f'){const n=Number(v);if(Number.isFinite(n))tel.force=n/10}
          else if(k==='h'){const n=Number(v);if(Number.isFinite(n))tel.heading=n}
        }
        next[port]=tel
      }
      publish({sensorTelemetry:next})
      notifySensorWaiters()
      return
    }
    if(text.startsWith('SOCER_DIST|')){
      const next={...state.sensorDistances}
      for(const pair of text.slice('SOCER_DIST|'.length).split(',')){
        const sep=pair.indexOf(':')
        if(sep<=0)continue
        const port=pair.slice(0,sep).trim()
        const mm=Number(pair.slice(sep+1).trim())
        if(!port||!Number.isFinite(mm))continue
        next[port]=mm>=2000?null:Math.max(0,Math.min(200,Math.round(mm/10)))
      }
      publish({sensorDistances:next})
      notifySensorWaiters()
      return
    }
    if(text.startsWith('SOCER3_READY|')||text.startsWith('SOCER2_READY|')){
      if(transport.uploadProgram && expectedVersion && !uploadedThisConnect && lastHubVersion!==expectedVersion){
        const waiting=readyWait;readyWait=null
        waiting?.reject(new ProbeNeedsUploadError('На хабе установлена устаревшая программа контроллера.'))
        return
      }
      const protocol:2|3=text.startsWith('SOCER3')?3:2;const ports=text.slice(text.indexOf('|')+1).split(',').filter(Boolean)
      lastAck=clock.now();publish({transport:'ready',uploadProgress:null,protocol,ports,message:'Хаб готов к запуску.'});readyWait?.resolve();readyWait=null;return
    }
    if(text==='SOCER2_STOP' && stopWait){const waiting=stopWait;stopWait=null;waiting.resolve();return}
    if(text==='SOCER2_LINK_LOST'||(text==='SOCER2_STOP'&&state.program==='live-running')){
      if(state.transport==='uploading' && transport.uploadProgram) return
      if(state.transport==='starting-hub' && customProgramActive){
        customProgramActive=false
        return
      }
      if(state.transport==='connected' && customProgramActive){
        customProgramActive=false
        publish({program:'stopped',uploadProgress:null,message:'Программа Pybricks завершена.'})
        return
      }
      if(state.transport==='starting-hub' && transport.uploadProgram && !uploadedThisConnect && readyWait){
        const waiting=readyWait;readyWait=null
        waiting.reject(new ProbeNeedsUploadError('Программа на хабе завершилась до запуска контроллера.'))
        return
      }
      void fault('Связь с программой хаба потеряна; остановка не подтверждена.')
    }
  }
  // `countsAsHeartbeat` = false для тонов: они не заменяют хабу сигнал связи.
  const write=(command:string,valid:()=>boolean=()=>true,countsAsHeartbeat=true)=>{
    const serial=connection
    const next=queue.catch(()=>{}).then(async()=>{
      if(!valid())return
      if(writeFailed || serial!==connection)throw new Error('Соединение больше не действительно')
      try {
        await withTimeout(transport.write(command),2000,'Нет ответа при записи',clock)
        if(countsAsHeartbeat)lastWriteAt=clock.now()
      }
      catch(error){writeFailed=true;throw error}
    })
    queue=next;return next
  }
  async function stop(reason='Остановлено') {
    if(stopPromise)return stopPromise
    const wasReady=state.transport==='ready';clear();publish({program:'stopped',message:reason})
    if(!wasReady)return
    stopPromise=(async()=>{
      let timeout:ReturnType<typeof setTimeout>|undefined
      try {
        // Register before writing: notification may arrive before write resolves.
        const acknowledged=new Promise<void>((resolve,reject)=>{stopWait={resolve,reject}})
        void acknowledged.catch(()=>{})
        await write('x\n')
        await Promise.race([acknowledged,new Promise<void>((_,reject)=>{timeout=clock.setTimeout(()=>reject(new Error('Нет подтверждения остановки')),1500)})])
        publish({message:'Моторы остановлены.'})
      } catch {await fault('Остановка не подтверждена. Переподключите хаб.')}
      finally {if(timeout)clock.clearTimeout(timeout);stopWait=null;stopPromise=null}
    })()
    return stopPromise
  }
  function stopAllPorts(){
    return state.ports.length?state.ports:(snapshot?.ports?.length?snapshot.ports:[...DRIVE_PORTS])
  }
  /** Посылает хабу тоны звука по очереди; обещание завершается, когда звук доиграл. */
  function playOnHub(action:SoundAction,signal?:AbortSignal):Promise<void> {
    const key=`${action.soundId}|${action.volume}|${action.times}`
    // Тот же звук уже играет: не начинаем заново, иначе цикл без паузы держал бы первую ноту.
    if(sound?.key===key&&!sound.abort.signal.aborted)return sound.done
    sound?.abort.abort()
    const abort=new AbortController();const generation=epoch
    const cancel=()=>abort.abort()
    signal?.addEventListener('abort',cancel,{once:true})
    const current={key,abort,done:Promise.resolve()}
    sound=current
    const valid=()=>generation===epoch&&!abort.signal.aborted
    current.done=(async()=>{
      try {
        const steps=soundSteps(action.soundId)
        for(let round=0;round<action.times&&valid();round++){
          for(const step of steps){
            if(!valid())break
            // Хаб держит тон чуть дольше шага, чтобы задержка Bluetooth не рвала звук.
            await write(`n,${step.freq},${step.freq?step.ms+TONE_OVERLAP_MS:0},${action.volume}\n`,valid,false)
            await sleep(step.ms,abort.signal,clock)
          }
        }
      } catch(error){
        if(!abort.signal.aborted&&generation===epoch)throw error
      } finally {
        signal?.removeEventListener('abort',cancel)
        if(sound===current){
          sound=null
          // После полной остановки тишину обеспечивает команда `x`.
          if(generation===epoch)await write('n,0,0,0\n',()=>generation===epoch&&!sound,false)
        }
      }
    })()
    return current.done
  }
  function startActions(key:string,actions:ControllerAction[],generation:number,sendWrites=true):AbortController {
    runners.get(key)?.abort()
    const runner=new AbortController();runners.set(key,runner)
    const claimMotorOwners=(list:ControllerAction[])=>{
      for(const action of list){
        if(action.kind==='stopAll'){for(const port of stopAllPorts())owners.set(port,runner)}
        else if(['run','dc','angle','time','dcTime','stop'].includes(action.kind)&&'port' in action&&action.port){
          if(action.kind === 'stop' || !Array.from(activeHolds.values()).some(hold => isStopHold(hold, action.port))) {
            owners.set(action.port,runner)
          }
        }
      }
    }
    claimMotorOwners(actions)
    const runList=async(list:ControllerAction[])=>{
      for(const action of list){
        if(runner.signal.aborted||epoch!==generation)break
        if(action.kind==='sound'){
          log(describeAction(action))
          // Без робота играть нечем: звук идёт только в динамик хаба.
          if(!sendWrites)continue
          const played=playOnHub(action,runner.signal)
          if(action.wait)await played
          else void played.catch(error=>{if(epoch===generation)void fault(`Ошибка связи: ${error instanceof Error?error.message:String(error)}`)})
          continue
        }
        if(action.kind==='wait'){if(sendWrites)await sleep(action.ms,runner.signal,clock);continue}
        if(action.kind==='waitSensor'){
          while(!runner.signal.aborted&&epoch===generation&&!evalCondition(action)){
            await new Promise<void>(resolve=>{
              let done=false
              let timer:ReturnType<typeof setTimeout>|undefined
              const wake=()=>{
                if(done)return
                done=true
                sensorWaiters.delete(wake)
                runner.signal.removeEventListener('abort',wake)
                if(timer)clock.clearTimeout(timer)
                resolve()
              }
              sensorWaiters.add(wake)
              runner.signal.addEventListener('abort',wake,{once:true})
              timer=clock.setTimeout(wake,100)
            })
          }
          continue
        }
        if(action.kind==='loop'){
          log(describeAction(action))
          claimMotorOwners(action.bodyActions)
          let round=0
          while(!runner.signal.aborted&&epoch===generation){
            if(action.times!==undefined&&round>=action.times)break
            if(action.condition&&!evalCondition(action.condition))break
            await runList(action.bodyActions)
            round++
            // Короткая пауза: пустое или быстрое тело не должно занимать всё время.
            await sleep(LOOP_TICK_MS,runner.signal,clock)
          }
          continue
        }
        if(action.kind==='branch'){
          const passed=evalCondition(action.condition)
          const chosen=passed?action.thenActions:action.elseActions
          const summary=chosen.map(describeAction).filter(Boolean).join(' · ')||'нет действий'
          log(`${describeAction({kind:'branch',condition:action.condition,thenActions:[],elseActions:[]})} → ${passed?'да':'нет'} (${summary})`)
          claimMotorOwners(chosen)
          await runList(chosen)
          continue
        }
        if(action.kind==='stopAll'){
          if(!sendWrites)continue
          for(const port of stopAllPorts()){
            for(const command of commandsFor({kind:'stop',port},state.protocol||3)){
              await write(command,()=>!runner.signal.aborted&&epoch===generation&&owners.get(port)===runner)
            }
          }
          continue
        }
        if(!sendWrites)continue
        const port='port' in action?action.port:null
        const isMotorOwned=['run','dc','angle','time','dcTime','stop'].includes(action.kind)
        for(const command of commandsFor(action,state.protocol||3)){
          await write(command,()=>!runner.signal.aborted&&epoch===generation&&(!port||!isMotorOwned||owners.get(port)===runner))
        }
      }
    }
    void (async()=>{
      try {
        await runList(actions)
      } catch(error){if(!runner.signal.aborted&&epoch===generation)await fault(`Ошибка связи: ${error instanceof Error?error.message:String(error)}`)}
      finally{if(runners.get(key)===runner)runners.delete(key)}
    })()
    return runner
  }
  function runActions(key:string,actions:ControllerAction[],generation:number,sendWrites=true){
    startActions(key,actions,generation,sendWrites)
  }
  function beginHeartbeat() {
    if(heartbeat)clock.clearInterval(heartbeat)
    lastAck=clock.now();lastHeartbeat=0
    heartbeat=clock.setInterval(()=>{
      if(state.transport!=='ready'||state.program!=='live-running')return
      const now=clock.now(),generation=epoch
      if(now-lastAck>heartbeatTimeoutMs){void fault('Хаб не отвечает. Остановка не подтверждена.');return}
      if(now-Math.max(lastHeartbeat,lastWriteAt)>=200){lastHeartbeat=now;void write('k\n',()=>generation===epoch&&state.program==='live-running').catch(()=>fault('Ошибка связи. Остановка не подтверждена.'))}
    },80)
  }
  return {
    subscribe(fn:(s:SessionState)=>void){listeners.add(fn);fn(state);return ()=>{listeners.delete(fn)}},
    async setViewMode(mode:'edit'|'check'){if(mode==='edit')await stop('Редактирование');publish({viewMode:mode})},
    async connect(){
      if(disposed||!['disconnected','fault'].includes(state.transport))return
      publish({transport:'connecting',uploadProgress:null,needsManualHubProgram:false,sensorPorts:[],sensorPortsKnown:false,sensorDistances:{},sensorTypes:{},sensorTelemetry:{},message:'Подключение…'});writeFailed=false;lastHubVersion=null;uploadedThisConnect=false;const serial=++connection
      try{
        const info=await transport.connect(text=>line(text,serial),()=>{if(serial===connection)void fault('Связь потеряна. Остановка не подтверждена.')})
        if(serial===connection){
          publish({transport:'connected',uploadProgress:null,hubName:info && 'hubName' in info ? info.hubName ?? null : state.hubName,message:'Хаб подключён.'})
        }
      }
      catch(error){
        if(serial!==connection||disposed)return
        if(isUserCancelError(error)){
          connection++
          publish({transport:'disconnected',program:'idle',uploadProgress:null,message:'Подключение отменено.'})
          return
        }
        await fault(error instanceof Error?error.message:'Не удалось подключиться')
      }
    },
    async startHub(){
      if(state.transport!=='connected')return
      const serial=connection
      const abortController=new AbortController()
      startAbort=abortController
      writeFailed=false;lastHubVersion=null;lastWriteAt=0;customProgramActive=false
      publish({transport:'starting-hub',uploadProgress:null,needsManualHubProgram:false,message:transport.uploadProgram?'Проверка программы хаба…':'Ожидание программы хаба…'})
      const waitForReady=(timeoutMs:number,timeoutMessage:string,probe:boolean)=>{
        const ready=new Promise<void>((resolve,reject)=>{readyWait={resolve,reject}})
        void ready.catch(()=>{})
        return Promise.resolve().then(async()=>{
          if(abortController.signal.aborted)throw abortError('Запуск отменён.')
          await transport.startHub({signal:abortController.signal,probe})
          if(abortController.signal.aborted)throw abortError('Запуск отменён.')
          await write('h\n',()=>!abortController.signal.aborted)
          if(abortController.signal.aborted)throw abortError('Запуск отменён.')
          await withTimeout(ready,timeoutMs,timeoutMessage,clock)
        })
      }
      try {
        await waitForReady(transport.uploadProgram?probeTimeoutMs:8000,transport.uploadProgram?'__PROBE_TIMEOUT__':'Хаб не ответил. Запустите программу хаба.',true)
      } catch(probeError){
        readyWait=null
        if(disposed||serial!==connection)return
        if(abortController.signal.aborted||isUserCancelError(probeError)){
          writeFailed=false
          publish({transport:'connected',uploadProgress:null,message:'Запуск отменён.'})
          return
        }
        const canAutoUpload=Boolean(transport.uploadProgram) && (probeError instanceof ProbeNeedsUploadError || (probeError instanceof Error && probeError.message==='__PROBE_TIMEOUT__'))
        if(!canAutoUpload || !transport.uploadProgram){
          await fault(probeError instanceof Error?probeError.message:'Ошибка запуска')
          return
        }
        try {
          writeFailed=false
          publish({transport:'uploading',uploadProgress:0,message:'Подготовка программы для хаба…'})
          const compile=options?.compileHubProgram ?? (()=>import('./mpy-compiler.ts').then(m=>m.compileBundledHubProgram()))
          const blob=await compile()
          if(abortController.signal.aborted||disposed||serial!==connection)throw abortError('Загрузка отменена.')
          publish({transport:'uploading',uploadProgress:0,message:'Загрузка программы на хаб… 0%'})
          await transport.uploadProgram(
            blob,
            pct=>{if(!disposed&&serial===connection&&!abortController.signal.aborted)publish({uploadProgress:pct,message:`Загрузка программы на хаб… ${pct}%`})},
            abortController.signal
          )
          if(abortController.signal.aborted||disposed||serial!==connection)throw abortError('Загрузка отменена.')
          uploadedThisConnect=true
          publish({transport:'starting-hub',uploadProgress:100,message:'Запуск программы на хабе…'})
          await waitForReady(6000,'Хаб не ответил после загрузки программы.',false)
        } catch(uploadError){
          readyWait=null
          if(disposed||serial!==connection)return
          if(abortController.signal.aborted||isUserCancelError(uploadError)){
            writeFailed=false
            publish({transport:'connected',uploadProgress:null,message:'Загрузка отменена.'})
            return
          }
          const needsManual=uploadError instanceof UnsupportedFirmwareError || (uploadError instanceof Error && 'code' in uploadError && (uploadError as {code?:string}).code==='UNSUPPORTED_FIRMWARE')
          await fault(uploadError instanceof Error?uploadError.message:'Ошибка загрузки на хаб',{needsManualHubProgram:needsManual})
        }
      } finally {
        if(startAbort===abortController)startAbort=null
      }
    },
    cancelStart(){
      startAbort?.abort()
      if(readyWait){const waiting=readyWait;readyWait=null;waiting.reject(abortError('Запуск отменён.'))}
      if(state.viewMode!=='edit')publish({viewMode:'edit'})
    },
    async runCustomProgram(source:string):Promise<{ok:boolean;error?:string}>{
      if(disposed)return {ok:false,error:'Сессия закрыта.'}
      if(!['connected','ready'].includes(state.transport)){
        return {ok:false,error:'Сначала подключите SPIKE Prime по Bluetooth.'}
      }
      if(!transport.uploadProgram){
        return {ok:false,error:'Прямой запуск кода доступен только для SPIKE Prime с прошивкой Pybricks.'}
      }
      if(state.program==='trial-running'||state.program==='live-running'){
        await stop('Запуск кода Pybricks')
      }
      if((state as SessionState).transport==='fault'){
        return {ok:false,error:state.message}
      }
      let blob:Uint8Array
      try {
        const compile=options?.compileCustomProgram ?? ((code:string)=>import('./mpy-compiler.ts').then(m=>m.compilePythonToMultiMpy6(code,{cache:false})))
        blob=await compile(source)
      } catch(compileError){
        const msg=compileError instanceof Error?compileError.message:'Не удалось скомпилировать программу.'
        publish({message:msg})
        return {ok:false,error:msg}
      }
      const serial=connection
      const abortController=new AbortController()
      startAbort=abortController
      writeFailed=false;lastHubVersion=null;uploadedThisConnect=false;customProgramActive=false
      clear()
      publish({transport:'uploading',program:'stopped',uploadProgress:0,protocol:null,ports:[],sensorPorts:[],sensorPortsKnown:false,sensorDistances:{},sensorTypes:{},sensorTelemetry:{},needsManualHubProgram:false,message:'Загрузка программы Pybricks… 0%'})
      try {
        await transport.uploadProgram(
          blob,
          pct=>{if(!disposed&&serial===connection&&!abortController.signal.aborted)publish({uploadProgress:pct,message:`Загрузка программы Pybricks… ${pct}%`})},
          abortController.signal
        )
        if(abortController.signal.aborted||disposed||serial!==connection)throw abortError('Загрузка отменена.')
        publish({transport:'starting-hub',uploadProgress:100,message:'Запуск программы на хабе…'})
        customProgramActive=true
        await transport.startHub({signal:abortController.signal,probe:false})
        if(abortController.signal.aborted||disposed||serial!==connection)throw abortError('Запуск отменён.')
        publish({
          transport:'connected',
          program:customProgramActive?'custom-running':'stopped',
          uploadProgress:null,
          message:customProgramActive?'Программа Pybricks запущена на хабе.':'Программа Pybricks завершена.',
        })
        return {ok:true}
      } catch(uploadError){
        customProgramActive=false
        if(disposed||serial!==connection)return {ok:false,error:'Соединение закрыто.'}
        if(abortController.signal.aborted||isUserCancelError(uploadError)){
          writeFailed=false
          publish({transport:'connected',program:'stopped',uploadProgress:null,message:'Запуск отменён.'})
          return {ok:false,error:'Запуск отменён.'}
        }
        const msg=uploadError instanceof Error?uploadError.message:'Ошибка загрузки на хаб.'
        const needsManual=uploadError instanceof UnsupportedFirmwareError || (uploadError instanceof Error && 'code' in uploadError && (uploadError as {code?:string}).code==='UNSUPPORTED_FIRMWARE')
        if(needsManual){
          await fault(msg,{needsManualHubProgram:true})
        } else {
          publish({transport:'connected',program:'stopped',uploadProgress:null,message:msg})
        }
        return {ok:false,error:msg}
      } finally {
        if(startAbort===abortController)startAbort=null
      }
    },
    async stopCustomProgram(){
      startAbort?.abort()
      customProgramActive=false
      if(transport.stopProgram && state.transport==='connected'){
        await transport.stopProgram().catch(()=>{})
      }
      if(!disposed){
        publish({program:'stopped',uploadProgress:null,message:'Программа Pybricks остановлена.'})
      }
    },
    async startProgram(program:ControllerProgram){
      if(disposed||stopPromise||state.transport==='fault'||state.viewMode!=='check')return
      if(state.program==='trial-running'||state.program==='live-running')await stop()
      if((state as SessionState).transport==='fault')return
      const blocking=program.errors.find(e=>e.severity!=='warning'&&e.scope!=='handler')
      if(blocking){publish({message:blocking.message});return}
      const live=state.transport==='ready'
      if(live){
        const errors=controllerRuntimeErrors({...program,handlers:[{button:'up',event:'pressed',sourceBlockId:'startup',actions:program.startup}]},state.protocol,new Set(state.ports),state.sensorPortsKnown?new Set(state.sensorPorts):undefined,state.sensorPortsKnown?state.sensorTypes:undefined)
        if(errors.length){publish({message:errors[0].message});return}
      }
      clear();snapshot=structuredClone(program);const generation=epoch
      publish({program:live?'live-running':'trial-running',uploadProgress:null,message:live?'Программа запущена':'Пробный режим: команды роботу не отправляются'})
      if(program.startup.length){log('Запуск → '+program.startup.map(describeAction).filter(Boolean).join(' · '));if(live||hasSensorFlow(program.startup))void runActions('startup',program.startup,generation,live)}
      if(live)beginHeartbeat()
    },
    dispatch(target:Target,event:ControllerEvent){
      if(!snapshot||state.viewMode!=='check'||!['trial-running','live-running'].includes(state.program))return
      const key=targetKey(target)
      if(event==='pressed'){if(held.has(key))return;held.add(key)}else{if(!held.delete(key))return}
      if(event==='released'){
        const holdEntry=activeHolds.get(key)
        if(holdEntry){
          activeHolds.delete(key)
          runners.get(`input:${key}`)?.abort()
          const remainingHolds=Array.from(activeHolds.values()).reverse()
          const stopActions:ControllerAction[]=[]
          const resumeRuns:{hold:ActiveHold;action:ControllerAction}[]=[]
          for(const port of holdEntry.ports){
            const currentOwner=owners.get(port)
            if(state.program==='live-running' && currentOwner && !holdEntry.ownedRunners.has(currentOwner))continue
            const otherStop = remainingHolds.find(hold => isStopHold(hold, port))
            if (otherStop) {
              resumeRuns.push({hold: otherStop, action: {kind:'stop', port}})
              continue
            }
            let resumed=false
            for(const other of remainingHolds){
              const last=findContinuousForPort(other.handler.actions,port)
              if(last){resumeRuns.push({hold:other,action:last});resumed=true;break}
            }
            if(!resumed)stopActions.push({kind:'stop',port})
          }
          const summary=[...stopActions,...resumeRuns.map(r=>r.action)].map(describeAction).filter(Boolean).join(' · ')||'нет действий'
          log(`${target.input} отпущена → ${summary}`)
          if(state.program==='live-running'){
            if(stopActions.length)startActions(`hold-stop:${key}`,stopActions,epoch)
            for(const {hold,action} of resumeRuns){
              if('port' in action){
                const runner=startActions(`hold-resume:${hold.key}:${action.port}`,[action],epoch)
                hold.ownedRunners.add(runner)
              }
            }
          }
          return
        }
      }
      const errors=[...snapshot.errors,...(state.program==='live-running'?controllerRuntimeErrors(snapshot,state.protocol,new Set(state.ports),state.sensorPortsKnown?new Set(state.sensorPorts):undefined,state.sensorPortsKnown?state.sensorTypes:undefined):[])]
      const error=errors.find(e=>e.severity!=='warning'&&e.target?.controlId===target.controlId&&e.target?.input===target.input)
      if(error){held.delete(key);log(`⚠ ${error.message}`);return}
      const handler = event==='pressed'
        ? (controllerHandler(snapshot,target,'hold') || controllerHandler(snapshot,target,'pressed'))
        : controllerHandler(snapshot,target,event)
      const actions = handler?.driveAreaId ? driveActions(handler, snapshot.handlers, held) : handler?.actions || []
      const runnerKey = handler?.driveAreaId ? `drive-area:${handler.driveAreaId}` : `input:${key}`
      log(`${target.input} ${event==='pressed'?'нажата':'отпущена'} → ${actions.map(describeAction).filter(Boolean).join(' · ')||'нет действий'}`)
      let startedRunner:AbortController|null=null
      const hasSensorFlowNow=hasSensorFlow(actions)
      if(actions.length&&(state.program==='live-running'||hasSensorFlowNow))startedRunner=startActions(runnerKey,actions,epoch,state.program==='live-running')
      if(event==='pressed' && handler?.event==='hold'){
        const drivenPorts=collectDrivenPorts(actions)
        const ownedRunners=new Set<AbortController>()
        if(startedRunner)ownedRunners.add(startedRunner)
        activeHolds.set(key,{key,handler,ports:drivenPorts,ownedRunners})
      }
    },
    setSensorDistance(port:string,cm:number|null){
      if(!port)return
      const normalized=cm===null?null:Math.max(0,Math.min(200,Math.round(cm)))
      publish({sensorDistances:{...state.sensorDistances,[port]:normalized}})
      notifySensorWaiters()
    },
    setSensorTelemetry(port:string,patch:SensorTelemetry){
      if(!port)return
      publish({sensorTelemetry:{...state.sensorTelemetry,[port]:{...(state.sensorTelemetry[port]||{}),...patch}}})
      notifySensorWaiters()
    },
    stop,
    /** Прослушивание из библиотеки: играет на подключённом роботе без запуска программы. */
    async previewSound(soundId:string,volume:number):Promise<{ok:boolean;error?:string}>{
      if(state.program!=='idle'&&state.program!=='stopped')return {ok:false,error:'Остановите программу, чтобы прослушать звук.'}
      if(state.transport==='connected')await this.startHub()
      if((state as SessionState).transport!=='ready'){
        const busy=['connecting','uploading','starting-hub'].includes(state.transport)
        return {ok:false,error:busy?'Робот ещё готовится. Подождите.':state.transport==='fault'?state.message:'Подключите робота: кнопка «Робот» вверху.'}
      }
      try {
        await playOnHub({kind:'sound',soundId,volume,times:1,wait:true})
        return {ok:true}
      } catch(error){
        const message=`Ошибка связи: ${error instanceof Error?error.message:String(error)}`
        await fault(message)
        return {ok:false,error:message}
      }
    },
    async stopSound(){
      if(!sound)return
      sound.abort.abort();sound=null
      if(state.transport==='ready')await write('n,0,0,0\n',()=>!sound,false).catch(()=>{})
    },
    async disconnect(){await stop();clear();await disconnectTransport();publish({transport:'disconnected',program:'stopped',uploadProgress:null,hubName:null,needsManualHubProgram:false,message:'Хаб отключён.',ports:[],sensorPorts:[],sensorPortsKnown:false,sensorDistances:{},sensorTypes:{},sensorTelemetry:{},protocol:null})},
    async dispose(){if(disposed)return;await stop();clear();await disconnectTransport();disposed=true;listeners.clear()},
    getState(){return state},
  }
}

/** Web Bluetooth transport, isolated from session logic and replaceable in tests. */
export function createBluetoothTransport():Transport {
  // Web Bluetooth is not part of the standard TypeScript DOM declarations.
  let device:any=null,characteristic:any=null,active:any=null,handler:((e:any)=>void)|null=null,buffer='',programRunning=false
  let disconnectHandler:(()=>void)|null=null
  let capabilities:{maxCharSize:number;featureFlags:number;maxUserProgramSize:number;numOfSlots:number}|null=null
  let writeChain:Promise<void>=Promise.resolve()
  let stopStatusWait:(()=>void)|null=null
  let suppressStopEvent=false

  function enqueueGatt<T>(fn:()=>Promise<T>):Promise<T>{
    const run=writeChain.catch(()=>{}).then(fn)
    writeChain=run.then(()=>{},()=>{})
    return run
  }

  async function gattWrite(bytes:Uint8Array){
    if(!characteristic)throw new Error('Хаб не подключён')
    if(characteristic.writeValueWithResponse)await characteristic.writeValueWithResponse(bytes)
    else await characteristic.writeValue(bytes)
  }

  return {
    async connect(onLine,onDisconnect){
      const bluetooth=(navigator as Navigator & {bluetooth?:any}).bluetooth
      if(!bluetooth||!window.isSecureContext)throw new Error('Нужен HTTPS и браузер с Web Bluetooth.')
      device=await bluetooth.requestDevice({filters:[{services:[SERVICE]}]})
      disconnectHandler=onDisconnect;device.addEventListener('gattserverdisconnected',disconnectHandler)
      const server=await device.gatt.connect();const service=await server.getPrimaryService(SERVICE);characteristic=await service.getCharacteristic(COMMAND_EVENT)
      try {
        const capChar=await service.getCharacteristic(HUB_CAPABILITIES)
        capabilities=parseHubCapabilities(await capChar.readValue())
      } catch {
        capabilities=null
      }
      handler=(event:any)=>{
        const parsed=parseEvent(event.target.value)
        if(parsed.type==='status'){
          const wasRunning=programRunning
          programRunning=Boolean(parsed.running)
          if(!programRunning && stopStatusWait){const resolve=stopStatusWait;stopStatusWait=null;resolve()}
          if(!programRunning && wasRunning && !suppressStopEvent)onLine('SOCER2_LINK_LOST')
          return
        }
        if(parsed.type!=='stdout')return
        buffer+=parsed.text
        while(buffer.includes('\n')){
          const i=buffer.indexOf('\n')
          const line=buffer.slice(0,i).trim()
          buffer=buffer.slice(i+1)
          if(line.startsWith('SOCER2_READY|')||line.startsWith('SOCER3_READY|'))programRunning=true
          if(line)onLine(line)
        }
        if(buffer.length>2000)buffer=''
      }
      active=await subscribeNotifications(characteristic,handler)
      return {hubName:device?.name || 'SPIKE Prime'}
    },
    async startHub(options){
      const signal=options?.signal
      const probe=Boolean(options?.probe)
      if(signal?.aborted)throw abortError('Запуск отменён.')
      await enqueueGatt(async()=>{
        if(signal?.aborted)throw abortError('Запуск отменён.')
        if(!characteristic)throw new Error('Хаб не подключён')
        if(!programRunning){
          try{await gattWrite(startProgramBytes())}
          catch(err){
            if(programRunning)return
            // Clean Pybricks hubs reject START_USER_PROGRAM (0x01) when no user program is stored.
            if(probe && device?.gatt?.connected && capabilities && (capabilities.featureFlags & FEATURE_MULTI_MPY_V6)!==0){
              throw new ProbeNeedsUploadError('На хабе ещё не установлена программа контроллера.')
            }
            throw err
          }
        }
      })
      await sleep(180,signal)
    },
    async uploadProgram(blob,onProgress,signal){
      if(!capabilities || (capabilities.featureFlags & FEATURE_MULTI_MPY_V6)===0){
        throw new UnsupportedFirmwareError('Прошивка хаба не поддерживает автозагрузку. Обновите Pybricks на хабе или загрузите программу вручную.')
      }
      if(blob.byteLength>capabilities.maxUserProgramSize){
        throw new Error('Программа превышает доступную память хаба.')
      }
      await enqueueGatt(async()=>{
        if(signal?.aborted)throw abortError('Загрузка отменена.')
        if(programRunning){
          suppressStopEvent=true
          try {
            const stopped=new Promise<void>(resolve=>{stopStatusWait=resolve})
            await gattWrite(stopProgramBytes())
            await Promise.race([stopped,sleep(500).catch(()=>{})])
          } finally {
            stopStatusWait=null
            suppressStopEvent=false
          }
          await sleep(80,signal)
        }
        if(signal?.aborted)throw abortError('Загрузка отменена.')
        await gattWrite(writeProgramMetaBytes(0))
        const chunkLimit=Math.max(15,Math.min(200,capabilities!.maxCharSize-5))
        let offset=0
        while(offset<blob.byteLength){
          if(signal?.aborted)throw abortError('Загрузка отменена.')
          const chunk=blob.subarray(offset,offset+chunkLimit)
          await gattWrite(writeUserRamBytes(offset,chunk))
          offset+=chunk.byteLength
          onProgress(Math.min(99,Math.round((offset/blob.byteLength)*100)))
        }
        if(signal?.aborted)throw abortError('Загрузка отменена.')
        await gattWrite(writeProgramMetaBytes(blob.byteLength))
        onProgress(100)
      })
    },
    async stopProgram(){
      await enqueueGatt(async()=>{
        if(!characteristic||!programRunning)return
        suppressStopEvent=true
        try {
          const stopped=new Promise<void>(resolve=>{stopStatusWait=resolve})
          await gattWrite(stopProgramBytes())
          await Promise.race([stopped,sleep(500).catch(()=>{})])
        } finally {
          stopStatusWait=null
          suppressStopEvent=false
        }
      })
    },
    async write(line){
      await enqueueGatt(async()=>{
        await gattWrite(commandBytes(line))
      })
    },
    async disconnect(){
      suppressStopEvent=false
      stopStatusWait?.();stopStatusWait=null
      if(active&&handler)active.removeEventListener('characteristicvaluechanged',handler)
      if(device&&disconnectHandler)device.removeEventListener('gattserverdisconnected',disconnectHandler)
      if(device?.gatt?.connected)device.gatt.disconnect()
      device=null;characteristic=null;capabilities=null;active=null;handler=null;disconnectHandler=null;buffer='';programRunning=false
    },
  }
}
