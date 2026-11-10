import type { BuddyMode } from './companion-brain'
import { walkPose } from './walk-pose'

const TAU=Math.PI*2
const ease=(n:number)=>{const v=Math.max(0,Math.min(1,n));return v*v*(3-2*v)}
const fmt=(n:number)=>n.toFixed(2)
export type BodyPose=ReturnType<typeof walkPose> & { face:string; eyeY:number; mouth:string; expression:'neutral'|'happy'|'sleep'|'surprised' }
function limb(hipX:number,ankleX:number,ankleY:number,bend:number,direction:number,hipY=560) {
  return {path:`M ${hipX} ${hipY} Q ${fmt((hipX+ankleX)/2+bend*direction)} ${fmt((hipY+ankleY)/2)} ${fmt(ankleX)} ${fmt(ankleY)}`,foot:`translate(${fmt(ankleX)} ${fmt(ankleY)}) rotate(0) scale(${direction} 1)`}
}
/** Whole-body acting: pose anticipation, follow-through and expression share one clock. */
export function bodyPose(mode:BuddyMode,time:number,age:number,distance:number,direction:number,perched:boolean,jumpProgress:number):BodyPose {
  const pulse=Math.sin(time*TAU/.8), breath=Math.sin(time*TAU/3.8)
  const base=walkPose(distance,direction)
  let x=0,y=0,sx=1,sy=1,tilt=0,armL=0,armR=0,faceX=direction*10,faceY=0,eyeY=1
  let left=limb(265,240,970,12,direction),right=limb(423,450,970,12,direction)
  let expression:BodyPose['expression']='neutral'
  let mouth='M 310 365 Q 345 378 380 365'
  if(mode==='walk'){ const n=base.torso.match(/-?\d*\.?\d+/g)!.map(Number); const torso=`translate(${n[0]} ${n[1]}) translate(344 565) rotate(${n[2]}) scale(1 1) translate(-344 -565)`; return {...base,torso,armLeft:`${torso} rotate(${direction*Math.sin(distance/64*TAU)*-11+3} 112 370)`,armRight:`${torso} rotate(${direction*Math.sin(distance/64*TAU)*11-3} 576 370)`,face:`translate(${direction*14} ${fmt(-Math.sin(time*TAU/1.3)*3)})`,eyeY:1,mouth,expression} }
  if(mode==='idle'){sy=1+breath*.012;tilt=Math.sin(time*.7)*.8;armL=breath*2;armR=-breath*2}
  if(mode==='climb'){
    tilt=-direction*6;armL=115+pulse*26;armR=-115+pulse*26;faceY=-20
    left=limb(265,235+pulse*40,900+pulse*48,70,direction);right=limb(423,450-pulse*40,900-pulse*48,70,direction)
  }
  if(mode==='jump'){
    const p=jumpProgress
    if(p<.18){const t=ease(p/.18);sx=1+.12*t;sy=1-.13*t;y=60*t;armL=-18*t;armR=18*t}
    else {const up=Math.sin(Math.min(1,(p-.18)/.82)*Math.PI);sx=1-.08*up;sy=1+.12*up;y=-12*up;armL=130;armR=-130;faceY=-15;expression='surprised'}
    left=limb(265,205,945,60,direction);right=limb(423,480,930,-55,direction)
  }
  if(mode==='fall'){sx=.93;sy=1.08;armL=55;armR=-55;faceY=24;expression='surprised';left=limb(265,235,970,20,direction);right=limb(423,460,970,-20,direction)}
  if(mode==='sit'||mode==='sleep'||mode==='inspect'){
    y=perched?430:200;sx=1.04;sy=.97
    left=limb(265,195,perched?1110:970,perched?80:170,direction,560+y);right=limb(423,510,perched?1110:970,-(perched?80:170),direction,560+y)
    if(perched){left.foot=left.foot.replace('rotate(0)',`rotate(${fmt(pulse*4)})`);right.foot=right.foot.replace('rotate(0)',`rotate(${fmt(-pulse*4)})`)}
    armL=-12;armR=12
    if(mode==='sleep'){tilt=-7;sy=.96+breath*.016;eyeY=.12;faceY=22;expression='sleep';mouth='M 331 365 Q 345 375 359 365'}
    if(mode==='inspect'){tilt=Math.sin(time*1.7)*7;faceX=direction*22;faceY=14;armR=-35+Math.sin(time*2)*8}
  }
  if(mode==='wave'){
    const arrival=1-Math.exp(-age*8);sy=1+Math.sin(age*8)*.025*Math.exp(-age);tilt=-4*arrival;armR=(-110+Math.sin(age*18)*17)*arrival;armL=10;expression='happy';eyeY=.7;mouth='M 300 350 Q 345 420 390 350'
  }
  if(mode==='held'){tilt=Math.sin(time*4)*6;sx=.95;sy=1.05;armL=155;armR=-155;left=limb(265,245,970,Math.sin(time*5)*45,direction);right=limb(423,445,970,-Math.sin(time*5)*45,direction);expression='surprised'}
  // The spring after a footfall compresses the body, then settles without moving the feet.
  if((mode==='idle'||mode==='sit')&&age<.55){const recoil=Math.sin(age/.55*Math.PI*2)*Math.exp(-age*7);sx+=Math.max(0,recoil)*.09;sy-=Math.max(0,recoil)*.09;y+=Math.max(0,recoil)*38}
  const torso=`translate(${fmt(x)} ${fmt(y)}) translate(344 565) rotate(${fmt(tilt)}) scale(${fmt(sx)} ${fmt(sy)}) translate(-344 -565)`
  return {left,right,torso,armLeft:`${torso} rotate(${fmt(armL)} 112 370)`,armRight:`${torso} rotate(${fmt(armR)} 576 370)`,shadow:mode==='jump'?'.72':'1',face:`translate(${fmt(faceX)} ${fmt(faceY)})`,eyeY,mouth,expression}
}

// All rig poses share path topology and transform order, so transitions can ease numerically.
export function easePoseValue(previous:string|undefined,target:string,amount:number):string {
  if(!previous)return target
  const pattern=/-?\d*\.?\d+(?:e[-+]?\d+)?/gi
  const from=previous.match(pattern)?.map(Number), to=target.match(pattern)?.map(Number)
  if(!from||!to||from.length!==to.length)return target
  let index=0
  return target.replace(pattern,()=>{const i=index++;return (from[i]+(to[i]-from[i])*amount).toFixed(3)})
}
