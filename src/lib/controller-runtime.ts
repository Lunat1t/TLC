import {commandsFor, controllerHandler, controllerRuntimeErrors, describeAction, DRIVE_PORTS, type ControllerAction, type ControllerEvent, type ControllerHandler, type ControllerProgram} from './controller-program.ts'
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
}
type Status = 'disconnected'|'connecting'|'connected'|'uploading'|'starting-hub'|'ready'|'fault'
export type SessionState={
  viewMode:'edit'|'check'
  transport:Status
  program:'idle'|'trial-running'|'live-running'|'stopped'
  message:string
  log:string[]
  ports:string[]
  protocol:2|3|null
  uploadProgress:number|null
  hubName:string|null
  needsManualHubProgram?:boolean
}
type SessionOptions={
  compileHubProgram?:()=>Promise<Uint8Array>
  expectedVersion?:string
  probeTimeoutMs?:number
  heartbeatTimeoutMs?:number
}
type Clock={now:()=>number;setTimeout:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;clearTimeout:(id:ReturnType<typeof setTimeout>)=>void;setInterval:(fn:()=>void,ms:number)=>ReturnType<typeof setInterval>;clearInterval:(id:ReturnType<typeof setInterval>)=>void}
const systemClock:Clock={now:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id),setInterval:(fn,ms)=>setInterval(fn,ms),clearInterval:id=>clearInterval(id)}
const sleep=(ms:number,signal?:AbortSignal,clock:Clock=systemClock)=>new Promise<void>((resolve,reject)=>{
  if(signal?.aborted)return reject(abortError('Отменено'))
  const timer=clock.setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms)
  const abort=()=>{clock.clearTimeout(timer);reject(abortError('Отменено'))}
  signal?.addEventListener('abort',abort,{once:true})
})

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
  let snapshot:ControllerProgram|null=null
  const runners=new Map<string,AbortController>();const owners=new Map<string,AbortController>();const held=new Set<string>()
  type ActiveHold={key:string;handler:ControllerHandler;ports:string[];ownedRunners:Set<AbortController>}
  const activeHolds=new Map<string,ActiveHold>()
  const isStopHold = (hold: ActiveHold, port: string) =>
    hold.ports.includes(port) && hold.handler.actions.every(action => action.kind === 'stop' || action.kind === 'stopAll')
  const collectDrivenPorts=(actions:ControllerAction[])=>{
    const acc=new Set<string>()
    for(const a of actions){
      if(a.kind==='stopAll') for(const port of stopAllPorts()) acc.add(port)
      else if('port' in a && a.port) acc.add(a.port)
    }
    return [...acc]
  }
  const publish=(patch:Partial<SessionState>)=>{if(disposed)return;state={...state,...patch};for(const f of listeners)f(state)}
  const log=(line:string)=>publish({log:[...state.log,line].slice(-30)})
  const clear=()=>{epoch++;for(const run of runners.values())run.abort();runners.clear();owners.clear();held.clear();activeHolds.clear();snapshot=null;if(heartbeat)clock.clearInterval(heartbeat);heartbeat=null}
  const disconnectTransport=async()=>{
    connection++
    startAbort?.abort();startAbort=null
    readyWait?.reject(new Error('Соединение закрыто'));readyWait=null
    stopWait?.reject(new Error('Соединение закрыто'));stopWait=null
    lastHubVersion=null;uploadedThisConnect=false
    await transport.disconnect().catch(()=>{})
  }
  const fault=async(message:string,extra?:Partial<SessionState>)=>{
    clear()
    publish({transport:'fault',program:'stopped',uploadProgress:null,message,ports:[],protocol:null,...extra})
    await disconnectTransport()
  }
  const line=(text:string,serial:number)=>{
    if(disposed||serial!==connection)return
    if(text==='SOCER2_ACK'){lastAck=clock.now();return}
    if(text.startsWith('SOCER_VER|')){lastHubVersion=text.slice('SOCER_VER|'.length).trim();return}
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
      if(state.transport==='starting-hub' && transport.uploadProgram && !uploadedThisConnect && readyWait){
        const waiting=readyWait;readyWait=null
        waiting.reject(new ProbeNeedsUploadError('Программа на хабе завершилась до запуска контроллера.'))
        return
      }
      void fault('Связь с программой хаба потеряна; остановка не подтверждена.')
    }
  }
  const write=(command:string,valid:()=>boolean=()=>true)=>{
    const serial=connection
    const next=queue.catch(()=>{}).then(async()=>{
      if(!valid())return
      if(writeFailed || serial!==connection)throw new Error('Соединение больше не действительно')
      try {
        await withTimeout(transport.write(command),2000,'Нет ответа при записи',clock)
        lastWriteAt=clock.now()
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
  function startActions(key:string,actions:ControllerAction[],generation:number):AbortController {
    runners.get(key)?.abort()
    const runner=new AbortController();runners.set(key,runner)
    for(const action of actions){
      if(action.kind==='stopAll'){for(const port of stopAllPorts())owners.set(port,runner)}
      else if('port' in action && action.port){
        if(action.kind==='stop' || !Array.from(activeHolds.values()).some(hold => isStopHold(hold, action.port))){
          owners.set(action.port,runner)
        }
      }
    }
    void (async()=>{
      try {
        for(const action of actions){
          if(runner.signal.aborted||epoch!==generation)break
          if(action.kind==='wait'){await sleep(action.ms,runner.signal,clock);continue}
          if(action.kind==='stopAll'){
            for(const port of stopAllPorts()){
              for(const command of commandsFor({kind:'stop',port},state.protocol||3)){
                await write(command,()=>!runner.signal.aborted&&epoch===generation&&owners.get(port)===runner)
              }
            }
            continue
          }
          const port='port' in action?action.port:null
          for(const command of commandsFor(action,state.protocol||3)){
            await write(command,()=>!runner.signal.aborted&&epoch===generation&&(!port||owners.get(port)===runner))
          }
        }
      } catch(error){if(!runner.signal.aborted&&epoch===generation)await fault(`Ошибка связи: ${error instanceof Error?error.message:String(error)}`)}
      finally{if(runners.get(key)===runner)runners.delete(key)}
    })()
    return runner
  }
  function runActions(key:string,actions:ControllerAction[],generation:number){
    startActions(key,actions,generation)
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
      publish({transport:'connecting',uploadProgress:null,needsManualHubProgram:false,message:'Подключение…'});writeFailed=false;lastHubVersion=null;uploadedThisConnect=false;const serial=++connection
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
      writeFailed=false;lastHubVersion=null;lastWriteAt=0
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
    async startProgram(program:ControllerProgram){
      if(disposed||stopPromise||state.transport==='fault'||state.viewMode!=='check')return
      if(state.program==='trial-running'||state.program==='live-running')await stop()
      if((state as SessionState).transport==='fault')return
      const blocking=program.errors.find(e=>e.severity!=='warning'&&e.scope!=='handler')
      if(blocking){publish({message:blocking.message});return}
      const live=state.transport==='ready'
      if(live){
        const errors=controllerRuntimeErrors({...program,handlers:[{button:'up',event:'pressed',sourceBlockId:'startup',actions:program.startup}]},state.protocol,new Set(state.ports))
        if(errors.length){publish({message:errors[0].message});return}
      }
      clear();snapshot=structuredClone(program);const generation=epoch
      publish({program:live?'live-running':'trial-running',uploadProgress:null,message:live?'Программа запущена':'Пробный режим: команды роботу не отправляются'})
      if(program.startup.length){log('Запуск → '+program.startup.map(describeAction).filter(Boolean).join(' · '));if(live)void runActions('startup',program.startup,generation)}
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
              const continuous=other.handler.actions.filter((a):a is Extract<ControllerAction,{kind:'run'|'dc'}> => (a.kind==='run'||a.kind==='dc')&&a.port===port)
              const last=continuous[continuous.length-1]
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
      const errors=[...snapshot.errors,...(state.program==='live-running'?controllerRuntimeErrors(snapshot,state.protocol,new Set(state.ports)):[])]
      const error=errors.find(e=>e.severity!=='warning'&&e.target?.controlId===target.controlId&&e.target?.input===target.input)
      if(error){held.delete(key);log(`⚠ ${error.message}`);return}
      const handler = event==='pressed'
        ? (controllerHandler(snapshot,target,'hold') || controllerHandler(snapshot,target,'pressed'))
        : controllerHandler(snapshot,target,event)
      const actions = handler?.driveAreaId ? driveActions(handler, snapshot.handlers, held) : handler?.actions || []
      const runnerKey = handler?.driveAreaId ? `drive-area:${handler.driveAreaId}` : `input:${key}`
      log(`${target.input} ${event==='pressed'?'нажата':'отпущена'} → ${actions.map(describeAction).filter(Boolean).join(' · ')||'нет действий'}`)
      let startedRunner:AbortController|null=null
      if(state.program==='live-running'&&actions.length)startedRunner=startActions(runnerKey,actions,epoch)
      if(event==='pressed' && handler?.event==='hold'){
        const drivenPorts=collectDrivenPorts(actions)
        const ownedRunners=new Set<AbortController>()
        if(startedRunner)ownedRunners.add(startedRunner)
        activeHolds.set(key,{key,handler,ports:drivenPorts,ownedRunners})
      }
    },
    stop,
    async disconnect(){await stop();clear();await disconnectTransport();publish({transport:'disconnected',program:'stopped',uploadProgress:null,hubName:null,needsManualHubProgram:false,message:'Хаб отключён.',ports:[],protocol:null})},
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
