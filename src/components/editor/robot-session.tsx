"use client"
import * as React from 'react'
import {createBluetoothTransport,createControllerSession,type SessionState} from '@/lib/controller-runtime'

const initial:SessionState={viewMode:'edit',transport:'disconnected',program:'idle',message:'Не подключён',log:[],ports:[],protocol:null}
export function useRobotSession(){
  const [state,setState]=React.useState(initial)
  const ref=React.useRef<ReturnType<typeof createControllerSession>|null>(null)
  React.useEffect(()=>{
    const session=createControllerSession(createBluetoothTransport());ref.current=session
    const unsubscribe=session.subscribe(setState)
    return ()=>{unsubscribe();if(ref.current===session)ref.current=null;void session.dispose()}
  },[])
  return {state,ref}
}
