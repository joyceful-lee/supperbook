"use client";
import { useCallback,useEffect,useState } from 'react';
export function useNotificationCount(userId?:string) {
 const [count,setCount]=useState(0),[version,setVersion]=useState(0);
 const refresh=useCallback(()=>setVersion(value=>value+1),[]);
 useEffect(()=>{
  if(!userId){setCount(0);return;}let active=true;
  async function load(){if(document.visibilityState==='hidden')return;try{const response=await fetch('/api/notifications?summary=1',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(response.ok){const result=await response.json();if(active)setCount(result.unreadCount||0);}}catch{}}
  void load();const timer=setInterval(load,30000);window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load);};
 },[userId,version]);
 return {count,refresh};
}
