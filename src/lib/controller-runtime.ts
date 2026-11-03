import {commandsFor, controllerHandler, controllerRuntimeErrors, describeAction, type ControllerAction, type ControllerEvent, type ControllerProgram} from './controller-program.ts'
import {SERVICE, COMMAND_EVENT, commandBytes, parseEvent} from '../../public/pybricks-protocol.js'
import {subscribeNotifications} from '../../public/notifications.js'

type Target = {controlId:string;input:string}
type Transport = {
  connect(onLine:(line:string)=>void,onDisconnect:()=>void):Promise<void>
  startHub():Promise<void>
  write(line:string):Promise<void>
  disconnect():Promise<void>
}
type Status = 'disconnected'|'connecting'|'connected'|'starting-hub'|'ready'|'fault'
export type SessionState={viewMode:'edit'|'check';transport:Status; program:'idle'|'trial-running'|'live-running'|'stopped';message:string; log:string[];ports:string[];protocol:2|3|null}
type Clock={now:()=>number;setTimeout:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;clearTimeout:(id:ReturnType<typeof setTimeout>)=>void;setInterval:(fn:()=>void,ms:number)=>ReturnType<typeof setInterval>;clearInterval:(id:ReturnType<typeof setInterval>)=>void}
const systemClock:Clock={now:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id),setInterval:(fn,ms)=>setInterval(fn,ms),clearInterval:id=>clearInterval(id)}
const sleep=(ms:number,signal?:AbortSignal,clock:Clock=systemClock)=>new Promise<void>((resolve,reject)=>{
  if(signal?.aborted)return reject(new Error('Отменено'))
  const timer=clock.setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms)
  const abort=()=>{clock.clearTimeout(timer);reject(new Error('Отменено'))}
  signal?.addEventListener('abort',abort,{once:true})
})

function withTimeout<T>(promise:Promise<T>,ms:number,message:string,clock:Clock=systemClock):Promise<T>{
  return new Promise<T>((resolve,reject)=>{const timer=clock.setTimeout(()=>reject(new Error(message)),ms);promise.then(value=>{clock.clearTimeout(timer);resolve(value)},error=>{clock.clearTimeout(timer);reject(error)})})
}

/** One owner for the transport, queues, motors and cancellation epoch. */
export function createControllerSession(transport:Transport,clock:Clock=systemClock) {
  let state:SessionState={viewMode:'edit',transport:'disconnected',program:'idle',message:'Не подключён',log:[],ports:[],protocol:null}
  const listeners=new Set<(s:SessionState)=>void>();let epoch=0;let connection=0;let disposed=false
  let queue:Promise<void>=Promise.resolve();let stopPromise:Promise<void>|null=null;let writeFailed=false
  let heartbeat:ReturnType<typeof setInterval>|null=null;let lastAck=0;let lastHeartbeat=0
  let readyWait:{resolve:()=>void;reject:(e:Error)=>void}|null=null
  let stopWait:{resolve:()=>void;reject:(e:Error)=>void}|null=null
  let snapshot:ControllerProgram|null=null
  const runners=new Map<string,AbortController>();const owners=new Map<string,AbortController>();const held=new Set<string>()
  const publish=(patch:Partial<SessionState>)=>{if(disposed)return;state={...state,...patch};for(const f of listeners)f(state)}
  const log=(line:string)=>publish({log:[...state.log,line].slice(-30)})
  const clear=()=>{epoch++;for(const run of runners.values())run.abort();runners.clear();owners.clear();held.clear();snapshot=null;if(heartbeat)clock.clearInterval(heartbeat);heartbeat=null}
  const disconnectTransport=async()=>{connection++;readyWait?.reject(new Error('Соединение закрыто'));readyWait=null;stopWait?.reject(new Error('Соединение закрыто'));stopWait=null;await transport.disconnect().catch(()=>{})}
  const fault=async(message:string)=>{clear();publish({transport:'fault',program:'stopped',message,ports:[],protocol:null});await disconnectTransport()}
  const line=(text:string,serial:number)=>{
    if(disposed||serial!==connection)return
    if(text==='SOCER2_ACK'){lastAck=clock.now();return}
    if(text.startsWith('SOCER3_READY|')||text.startsWith('SOCER2_READY|')){
      const protocol:2|3=text.startsWith('SOCER3')?3:2;const ports=text.slice(text.indexOf('|')+1).split(',').filter(Boolean)
      lastAck=clock.now();publish({transport:'ready',protocol,ports,message:'Хаб готов. Нажмите «Старт программы».'});readyWait?.resolve();readyWait=null;return
    }
    if(text==='SOCER2_STOP' && stopWait){const waiting=stopWait;stopWait=null;waiting.resolve();return}
    if(text==='SOCER2_LINK_LOST'||(text==='SOCER2_STOP'&&state.program==='live-running')){void fault('Связь с программой хаба потеряна; остановка не подтверждена.')}
  }
  const write=(command:string,valid:()=>boolean=()=>true)=>{
    const serial=connection
    const next=queue.catch(()=>{}).then(async()=>{
      if(!valid())return
      if(writeFailed || serial!==connection)throw new Error('Соединение больше не действительно')
      try {await withTimeout(transport.write(command),1200,'Нет ответа при записи',clock)}
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
        await Promise.race([acknowledged,new Promise<void>((_,reject)=>{timeout=clock.setTimeout(()=>reject(new Error('Нет подтверждения остановки')),1200)})])
        publish({message:'Моторы остановлены.'})
      } catch {await fault('Остановка не подтверждена. Переподключите хаб.')}
      finally {if(timeout)clock.clearTimeout(timeout);stopWait=null;stopPromise=null}
    })()
    return stopPromise
  }
  async function runActions(key:string,actions:ControllerAction[],generation:number) {
    runners.get(key)?.abort()
    const runner=new AbortController();runners.set(key,runner)
    for(const action of actions)if('port' in action)owners.set(action.port,runner)
    try {
      for(const action of actions){
        if(runner.signal.aborted||epoch!==generation)break
        if(action.kind==='wait'){await sleep(action.ms,runner.signal,clock);continue}
        const port='port' in action?action.port:null
        for(const command of commandsFor(action,state.protocol||3)){
          await write(command,()=>!runner.signal.aborted&&epoch===generation&&(!port||owners.get(port)===runner))
        }
      }
    } catch(error){if(!runner.signal.aborted&&epoch===generation)await fault(`Ошибка связи: ${error instanceof Error?error.message:String(error)}`)}
    finally{if(runners.get(key)===runner)runners.delete(key)}
  }
  function beginHeartbeat() {
    if(heartbeat)clock.clearInterval(heartbeat)
    lastAck=clock.now();lastHeartbeat=0
    heartbeat=clock.setInterval(()=>{
      if(state.transport!=='ready'||state.program!=='live-running')return
      const now=clock.now(),generation=epoch
      if(now-lastAck>1800){void fault('Хаб не отвечает. Остановка не подтверждена.');return}
      if(now-lastHeartbeat>=150){lastHeartbeat=now;void write('k\n',()=>generation===epoch&&state.program==='live-running').catch(()=>fault('Ошибка связи. Остановка не подтверждена.'))}
    },80)
  }
  return {
    subscribe(fn:(s:SessionState)=>void){listeners.add(fn);fn(state);return ()=>{listeners.delete(fn)}},
    async setViewMode(mode:'edit'|'check'){if(mode==='edit')await stop('Редактирование');publish({viewMode:mode})},
    async connect(){
      if(disposed||!['disconnected','fault'].includes(state.transport))return
      publish({transport:'connecting',message:'Подключение…'});writeFailed=false;const serial=++connection
      try{await transport.connect(text=>line(text,serial),()=>{if(serial===connection)void fault('Связь потеряна. Остановка не подтверждена.')});if(serial===connection)publish({transport:'connected',message:'Хаб подключён.'})}
      catch(error){await fault(error instanceof Error?error.message:'Не удалось подключиться')}
    },
    async startHub(){
      if(state.transport!=='connected')return
      publish({transport:'starting-hub',message:'Ожидание программы хаба…'})
      try {
        const ready=new Promise<void>((resolve,reject)=>{readyWait={resolve,reject}})
        void ready.catch(()=>{})
        await transport.startHub();await write('h\n');await withTimeout(ready,8000,'Хаб не ответил. Запустите программу хаба.',clock)
      } catch(error){readyWait=null;await fault(error instanceof Error?error.message:'Ошибка запуска')}
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
      publish({program:live?'live-running':'trial-running',message:live?'Программа запущена':'Пробный режим: команды роботу не отправляются'})
      if(program.startup.length){log('Запуск → '+program.startup.map(describeAction).filter(Boolean).join(' · '));if(live)void runActions('startup',program.startup,generation)}
      if(live)beginHeartbeat()
    },
    dispatch(target:Target,event:ControllerEvent){
      if(!snapshot||state.viewMode!=='check'||!['trial-running','live-running'].includes(state.program))return
      const key=`${target.controlId}:${target.input}`
      if(event==='pressed'){if(held.has(key))return;held.add(key)}else{if(!held.delete(key))return}
      const errors=[...snapshot.errors,...(state.program==='live-running'?controllerRuntimeErrors(snapshot,state.protocol,new Set(state.ports)):[])]
      const error=errors.find(e=>e.severity!=='warning'&&e.target?.controlId===target.controlId&&e.target?.input===target.input)
      if(error){log(`⚠ ${error.message}`);return}
      const handler=controllerHandler(snapshot,target,event);const actions=handler?.actions||[]
      log(`${target.input} ${event==='pressed'?'нажата':'отпущена'} → ${actions.map(describeAction).filter(Boolean).join(' · ')||'нет действий'}`)
      if(state.program==='live-running'&&actions.length)void runActions(key,actions,epoch)
    },
    stop,
    async disconnect(){await stop();clear();await disconnectTransport();publish({transport:'disconnected',program:'stopped',message:'Хаб отключён.',ports:[],protocol:null})},
    async dispose(){if(disposed)return;await stop();clear();await disconnectTransport();disposed=true;listeners.clear()},
    getState(){return state},
  }
}

/** Web Bluetooth transport, isolated from session logic and replaceable in tests. */
export function createBluetoothTransport():Transport {
  // Web Bluetooth is not part of the standard TypeScript DOM declarations.
  let device:any=null,characteristic:any=null,active:any=null,handler:((e:any)=>void)|null=null,buffer='',programRunning=false
  let disconnectHandler:(()=>void)|null=null
  return {
    async connect(onLine,onDisconnect){
      const bluetooth=(navigator as Navigator & {bluetooth?:any}).bluetooth
      if(!bluetooth||!window.isSecureContext)throw new Error('Нужен HTTPS и браузер с Web Bluetooth.')
      device=await bluetooth.requestDevice({filters:[{services:[SERVICE]}]})
      disconnectHandler=onDisconnect;device.addEventListener('gattserverdisconnected',disconnectHandler)
      const server=await device.gatt.connect();const service=await server.getPrimaryService(SERVICE);characteristic=await service.getCharacteristic(COMMAND_EVENT)
      handler=(event:any)=>{const parsed=parseEvent(event.target.value);if(parsed.type==='status'){if(!parsed.running&&programRunning)onLine('SOCER2_LINK_LOST');programRunning=Boolean(parsed.running);return}if(parsed.type!=='stdout')return;buffer+=parsed.text;while(buffer.includes('\n')){const i=buffer.indexOf('\n');const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);if(line.startsWith('SOCER2_READY|')||line.startsWith('SOCER3_READY|'))programRunning=true;if(line)onLine(line)}if(buffer.length>1000)buffer=''}
      active=await subscribeNotifications(characteristic,handler)
    },
    async startHub(){if(!characteristic)throw new Error('Хаб не подключён');try{await characteristic.writeValueWithResponse(Uint8Array.of(1))}catch{}await sleep(350)},
    async write(line){if(!characteristic)throw new Error('Хаб не подключён');const bytes=commandBytes(line);if(characteristic.writeValueWithResponse)await characteristic.writeValueWithResponse(bytes);else await characteristic.writeValue(bytes)},
    async disconnect(){if(active&&handler)active.removeEventListener('characteristicvaluechanged',handler);if(device&&disconnectHandler)device.removeEventListener('gattserverdisconnected',disconnectHandler);if(device?.gatt?.connected)device.gatt.disconnect();device=null;characteristic=null;active=null;handler=null;disconnectHandler=null;buffer='';programRunning=false},
  }
}
