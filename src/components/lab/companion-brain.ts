/** Local procedural behavior, independent of rendering and external AI services. */
export type BuddyMode = 'idle' | 'walk' | 'climb' | 'jump' | 'fall' | 'sit' | 'sleep' | 'wave' | 'held' | 'inspect'
export type Platform = { id: string; x: number; y: number; width: number; label: string }
export const BUDDY_W = 84, BUDDY_H = 132
export class CompanionBrain {
  x = 40; y = 0; direction = 1; mode: BuddyMode = 'idle'
  energy = .85; curiosity = .8; message = ''; messageUntil = 0
  private elapsed = 0; private until = 3; private lastInput = 0
  private goal = 0; private target: Platform | null = null; private support: string | null = null
  private velocity = 0; private jumpTime = 0; private jumpStart = { x:0,y:0 }; private jumpEnd = {x:0,y:0}
  private pending: BuddyMode | null = null
  private previous = ''; private lastPlatform = ''; private world = {width:800,height:600,platforms:[] as Platform[]}
  constructor(width:number,height:number) { this.world.width=width;this.world.height=height;this.x=Math.min(90,width-BUDDY_W);this.y=Math.max(0,height-BUDDY_H) }
  get perched() { return this.support !== null }
  get gaze() { return this.direction * 12 }
  private change(mode:BuddyMode,seconds:number) { this.mode=mode;this.until=this.elapsed+seconds }
  private clampX(value:number) { return Math.max(0,Math.min(this.world.width-BUDDY_W,value)) }
  private say(text:string) { this.message=text;this.messageUntil=this.elapsed+4 }
  private floor() { return Math.max(0,this.world.height-BUDDY_H) }
  private hop(x:number,y:number) { this.jumpStart={x:this.x,y:this.y};this.jumpEnd={x:this.clampX(x),y:Math.max(0,y)};this.jumpTime=0;this.change('jump',.65) }
  setWorld(width:number,height:number,platforms:Platform[]) {
    this.world={width,height,platforms};this.x=this.clampX(this.x);this.y=Math.max(0,Math.min(this.floor(),this.y))
    if(this.target) {
      const current=platforms.find(p=>p.id===this.target?.id)
      if(current && current.y>BUDDY_H+10)this.target=current
      else {this.target=null;if(this.mode==='climb'||this.mode==='inspect')this.change('fall',3)}
    }
    if(this.support) {
      const p=platforms.find(v=>v.id===this.support)
      if(p && p.y>=BUDDY_H && this.x+BUDDY_W*.7>=p.x && this.x+BUDDY_W*.3<=p.x+p.width) this.y=p.y-BUDDY_H+3
      else {this.support=null;this.velocity=0;this.change('fall',3)}
    }
  }
  private settle() { if (!this.support && this.y<this.floor()-3 && this.mode!=='held') {this.pending=this.mode;this.velocity=0;this.change('fall',4)} }
  private land(defaultMode:BuddyMode) { const next=this.pending||defaultMode;this.pending=null;this.change(next,next==='sleep'?30:4) }
  interact(action:'pet'|'call'|'rest'|'explore') {
    this.lastInput=this.elapsed;this.target=null
    if(action==='rest') {this.change('sleep',60);this.say('Посижу тихонько рядом.');this.settle();return}
    if(action==='call') {this.goal=this.clampX(this.world.width*.35);this.change('walk',12);this.say('Я здесь!');this.settle();return}
    if(action==='explore') {this.choose(true);this.settle();return}
    this.energy=Math.min(1,this.energy+.08);this.change('wave',2.5);this.say(['Давай что-нибудь соберём!','Рад тебя видеть!','Какой робот у нас будет следующим?'][Math.floor(Math.random()*3)]);this.settle()
  }
  notice(id:string) {
    if(this.mode==='held')return
    const p=this.world.platforms.find(v=>v.id===id)
    if(!p||p.y<BUDDY_H+35)return
    this.curiosity=1;this.target=p;this.support=null;this.goal=this.clampX(p.x-BUDDY_W+20);this.change('walk',24);this.say('Новая идея! Посмотрю поближе.');this.settle()
  }
  grab() {this.pending=null;this.lastInput=this.elapsed;this.support=null;this.target=null;this.message='';this.change('held',999)}
  drag(x:number,y:number) {this.x=this.clampX(x);this.y=Math.max(0,Math.min(this.floor(),y))}
  release() {this.pending=null;this.lastInput=this.elapsed;this.velocity=0;this.change('fall',3)}
  private choose(explore=false) {
    const candidates=this.world.platforms.filter(p=>p.y>BUDDY_H+35 && p.width>42 && p.x>10 && p.x<this.world.width-30)
    this.curiosity=Math.min(1,this.curiosity+.09)
    if(candidates.length && (explore || Math.random()<this.curiosity*.7)) {
      const fresh=candidates.filter(p=>p.id!==this.lastPlatform);const list=fresh.length?fresh:candidates
      this.target=list[Math.floor(Math.random()*list.length)];this.goal=this.clampX(this.target.x-BUDDY_W+20);this.support=null;this.change('walk',24);return
    }
    const roll=Math.random()
    if(this.energy<.2 || this.elapsed-this.lastInput>90 && roll<.3) {this.change('sleep',12+Math.random()*12);return}
    if(roll<.6 && this.previous!=='walk') {this.support=null;this.goal=this.clampX(Math.random()*(this.world.width-BUDDY_W));this.change('walk',18)}
    else this.change(roll<.8?'sit':'idle',3+Math.random()*5)
    this.previous=this.mode
  }
  tick(dt:number,quiet:boolean) {
    this.elapsed+=dt
    if(this.messageUntil<this.elapsed)this.message=''
    this.energy=Math.max(0,Math.min(1,this.energy+dt*(this.mode==='sleep'?.025:-.001)))
    if(this.mode==='held')return
    if(quiet && !this.support && this.y<this.floor()-3 && !['held','fall','jump'].includes(this.mode))this.settle()
    if(quiet && !['fall','jump','wave'].includes(this.mode)) {if(this.mode!=='sleep')this.change('sit',5);return}
    if(this.mode==='fall') {
      const oldBottom=this.y+BUDDY_H;this.velocity+=820*dt;this.y+=this.velocity*dt
      const hit=this.world.platforms.filter(p=>oldBottom<=p.y+5 && this.y+BUDDY_H>=p.y && this.x+BUDDY_W*.65>p.x && this.x+BUDDY_W*.35<p.x+p.width).sort((a,b)=>a.y-b.y)[0]
      if(hit){this.y=Math.max(0,hit.y-BUDDY_H+3);this.support=hit.id;this.velocity=0;this.land('sit')}
      else if(this.y>=this.floor()){this.y=this.floor();this.velocity=0;this.land('idle')}
      return
    }
    if(this.mode==='jump') {
      this.jumpTime+=dt;const t=Math.min(1,this.jumpTime/.65)
      this.x=this.jumpStart.x+(this.jumpEnd.x-this.jumpStart.x)*t
      this.y=this.jumpStart.y+(this.jumpEnd.y-this.jumpStart.y)*t-Math.sin(t*Math.PI)*45
      if(t===1){if(this.target){this.support=this.target.id;this.lastPlatform=this.target.id;this.say(`Что тут у нас? ${this.target.label.slice(0,45)}`);this.curiosity=.25;this.target=null;this.change('inspect',5)}else this.change('fall',3)}
      return
    }
    if(this.mode==='climb' && this.target) {
      const top=this.target.y-BUDDY_H;this.direction=1;this.x=this.clampX(this.target.x-BUDDY_W+20)
      this.y=Math.max(top,this.y-65*dt)
      if(this.y<=top+1)this.hop(this.target.x+this.target.width/2-BUDDY_W/2,top+3)
      return
    }
    if(this.mode==='walk') {
      if(this.target)this.goal=this.clampX(this.target.x-BUDDY_W+20)
      const delta=this.goal-this.x;this.direction=delta<0?-1:1
      this.x=this.clampX(this.x+Math.sign(delta)*Math.min(Math.abs(delta),65*dt))
      if(this.y<this.floor()-5 && !this.support){this.velocity=0;this.change('fall',4);return}
      if(Math.abs(delta)<2) {if(this.target)this.change('climb',30);else this.change('idle',2)}
    }
    if(this.until<=this.elapsed) {
      if(this.support){this.support=null;this.target=null;this.hop(this.x+this.direction*90,this.y+35)}else this.choose()
    }
  }
}
