/* EXE CROWD · engine v1.0.0 · form&soul.exe */
(function(){
'use strict';
const VERSION='1.0.0';
const W=1920,H=1080;
const DEFAULTS={
  layout:'full',            // 'full' | 'corner'
  christmas:true,           // Christmas details on/off
  title:'Starting|soon',    // '|' = line break
  subtitle:'— TAKE YOUR SEAT —',
  goalMembers:25,           // free goal: colony members
  rounds:true,              // support goal repeats in rounds
  idleMinutes:10,           // quiet time before a seat can be taken by a newcomer
  joinOn:'chat',            // 'chat' (any message) | 'command' (!join only)
  joinCommand:'!join', cheerCommand:'!cheer', cheerCooldown:20,
  bitsPerLight:100, tipPerLight:3,
  raidMax:30,
  cornerHeight:600, cornerMargin:24,
  sound:true, volume:0.6,
  sleepAfter:120,           // seconds of silence before some penguins doze off
  showTitle:true
};
const HELP='Crowd.create({canvas, base, config, storage, manual}) · event({type,name,amount,count}) · chat(name,text,{mod}) · tick(dt) · snapshot() · restore(s) · setConfig(c) · reset() · debug()';

const HATS=['cream','red','navy','mint',null,'red','cream','navy',null,'mint'];
const FACES=[null,'happy','wink',null,'happy',null,'wink'];
const WARD={
  winter:{hat:['pom_cream','pom_red','pom_navy','pom_mint','earmuffs','earmuffs_pink','trapper','beret','beret_navy',null],
          vest:[null,null,null,'cable_cream','cable_grey','cable_sage','cable_rose'],
          neck:[null,null,'scarf_cream','scarf_red','scarf_green','scarf_navy']},
  xmas:  {hat:['santa','santa','elf','elf','antlers','holly','pom_red','pom_cream','earmuffs',null],
          vest:[null,null,'xmas_red','xmas_green','xmas_navy','cable_cream'],
          neck:[null,'scarf_red','scarf_cream','scarf_green','bowtie','bell']}};
const SOUNDS=['join','cheer','light','support','raid','goal','finale','round','exit'];
function hash(s){let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)}
function ease(x){return x<0?0:x>1?1:1-Math.pow(1-x,3)}

function create(opts){
  const canvas=opts.canvas, base=(opts.base||'').replace(/\/?$/,'/'), Q=opts.query?('?'+opts.query):'';
  const C=Object.assign({},DEFAULTS,opts.config||{});
  const storage=opts.storage||null, storeKey=opts.storeKey||'exe_crowd_state_v1';
  const ctx0=canvas.getContext('2d');canvas.width=W;canvas.height=H;
  const OC=document.createElement('canvas');OC.width=W;OC.height=H;const ctxO=OC.getContext('2d');
  let g=ctx0;
  const IMG={};let S=null;// scene.json
  let ready=false,destroyed=false,onReady=opts.onReady||null;
  // ---------- state
  let ghost=0,t=0,P=[],MEM={},WAIT=[],tags=[],tagQ=[],parts=[],banner=null,bannerQ=[],later=[];
  let lit=0,litT=[],bank=0,round=1,fadeFrom=0,fadeT=-9,pendingSup=0,roundBusy=false;
  let auroraT=-1,auroraPulse=-9,treeOnT=-1,finaleShown=false,fullShown=false;
  let lastEvent=0,lastCheer=-9,surpriseUntil=-9,cheerReady=0;
  let SLOTS=[],ORDER=[],LANT=[],RING=null,TREE=null,snow=[],dirty=false,lastSave=0;
  const rnd=Math.random;
  // ---------- assets
  const audio={ctx:null,buf:{}};
  function loadImg(k,src){return new Promise(r=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>{IMG[k]=i;r()};i.onerror=()=>{console.warn('[EXE CROWD] missing',src);r()};i.src=src})}
  async function load(){
    S=opts.scene||await (await fetch(base+'assets/scene.json'+Q)).json();
    await Promise.all(Object.entries(S.files).map(([k,f])=>loadImg(k,(opts.files&&opts.files[k])||base+'assets/'+f+Q)));
    try{const f1=new FontFace('Fredoka',`url(${(opts.files&&opts.files.font700)||base+'fonts/fredoka-latin-700-normal.woff2'+Q})`,{weight:'700'});const f2=new FontFace('Fredoka',`url(${(opts.files&&opts.files.font600)||base+'fonts/fredoka-latin-600-normal.woff2'+Q})`,{weight:'600'});
      await Promise.all([f1.load(),f2.load()]);document.fonts.add(f1);document.fonts.add(f2)}catch(e){}
    buildScene();restoreSaved();ready=true;if(onReady)onReady(api);
    if(!opts.manual)requestAnimationFrame(loop);
    if(C.sound)loadSounds();
  }
  async function loadSounds(){
    try{audio.ctx=audio.ctx||new (window.AudioContext||window.webkitAudioContext)();
      await Promise.all(SOUNDS.map(async n=>{try{const r=await fetch((opts.files&&opts.files['snd_'+n])||base+'sounds/'+n+'.mp3'+Q);audio.buf[n]=await audio.ctx.decodeAudioData(await r.arrayBuffer())}catch(e){}}))}catch(e){}
  }
  let lastSnd={};
  function sfx(n,gain=1){if(!C.sound||opts.manual||!audio.ctx||!audio.buf[n])return;const now=audio.ctx.currentTime;if(lastSnd[n]&&now-lastSnd[n]<.08)return;lastSnd[n]=now;
    try{if(audio.ctx.state==='suspended')audio.ctx.resume();const s=audio.ctx.createBufferSource(),v=audio.ctx.createGain();s.buffer=audio.buf[n];v.gain.value=C.volume*gain;s.connect(v);v.connect(audio.ctx.destination);s.start()}catch(e){}}
  function buildScene(){
    const st=S.stage;LANT=S.lanterns.map(([x,y])=>({x:st.x+x*st.s,y:st.y+y*st.s}));
    SLOTS=[];S.rows.forEach((r,ri)=>{
      if(r.front){for(let x=r.x0;x<=r.x1;x+=r.sp){if(Math.abs(x-LANT[0].x)<40||Math.abs(x-LANT[1].x)<40)continue;SLOTS.push({x,y:r.y,h:r.h,row:ri})}return}
      for(let i=0;i<r.n;i++)SLOTS.push({x:r.x0+i*(r.x1-r.x0)/(r.n-1),y:r.y,h:r.h,row:ri})});
    ORDER=[...SLOTS.keys()].sort((a,b)=>{const A=SLOTS[a],B=SLOTS[b];if(A.row!==B.row)return B.row-A.row;return Math.abs(A.x-600)-Math.abs(B.x-600)});
    snow=[];for(let i=0;i<110;i++)snow.push({x:rnd()*W,y:rnd()*H,r:.6+rnd()*2.2,v:18+rnd()*40,d:rnd()*6});
  }
  // ---------- scheduling (engine clock, deterministic with manual tick)
  function after(sec,fn){later.push({at:t+sec,fn})}
  function runLater(){if(!later.length)return;const due=later.filter(l=>l.at<=t);later=later.filter(l=>l.at>t);due.forEach(l=>{try{l.fn()}catch(e){console.error(e)}})}
  // ---------- members & seats
  function poke(){lastEvent=t}
  function member(name){if(!MEM[name]){const hh=hash(name);MEM[name]={name,hh,hat:HATS[hh%HATS.length],face:FACES[(hh>>3)%FACES.length],sleeper:(hh>>5)%5<3,phase:(hh%100)/16,gold:false,last:t}}return MEM[name]}
  function memberCount(){return Object.keys(MEM).length+ghost}
  function seated(name){return P.find(p=>p.name===name&&p.leave===undefined)}
  function idleSec(){return Math.max(1,C.idleMinutes*60)}
  function seat(name,delay=0,silent=false,instant=false){
    const m=member(name);m.last=t+delay;
    const sp=seated(name);if(sp){sp.lastChat=t;return sp}
    const used=new Set(P.filter(p=>p.leave===undefined).map(p=>p.slot));let free=ORDER.find(s=>!used.has(s)),wait=0;
    if(free===undefined){
      const c=P.filter(p=>p.leave===undefined&&!p.gold&&t-p.lastChat>idleSec()).sort((a,b)=>a.lastChat-b.lastChat)[0];
      if(!c){if(!WAIT.includes(name))WAIT.push(name);return null}
      c.leave=t+delay;c.dir=SLOTS[c.slot].x<600?-1:1;c.exitType=Math.floor(rnd()*5);free=c.slot;wait=.95;after(delay,()=>sfx('exit',.7));
    }
    const p=Object.assign({},m,{slot:free,t0:instant?t-10:t+delay+wait,pop:-9,wave:-9,shy:-9,lastChat:t+delay});
    P.push(p);P.sort((a,b)=>SLOTS[a.slot].y-SLOTS[b.slot].y);
    if(!instant){after(delay+wait+.3,()=>sfx('join',.8));if(!silent)after(delay+wait+.38,()=>tag(name,p))}
    dirty=true;return p;
  }
  function goldify(name,label){const m=member(name);m.gold=true;let p=seated(name)||seat(name,0,true);if(!p){dirty=true;return}
    p.gold=true;p.pop=t;p.shy=t;p.lastChat=t;tag('★ '+name+(label?' '+label:''),p,true);sfx('support');
    const s=SLOTS[p.slot];for(let i=0;i<22;i++){const a=rnd()*Math.PI*2,v=80+rnd()*160;parts.push({x:s.x,y:s.y-s.h*.95,vx:Math.cos(a)*v,vy:Math.sin(a)*v-60,t0:t,life:.9+rnd()*.5})}dirty=true}
  // ---------- tags (max 2 visible, queue, grouping)
  function tag(text,p,gold,at){const item={text,slot:p?p.slot:null,gold:!!gold,at:at||null,n:1};
    const dup=tagQ.find(q=>q.text===item.text);if(dup){dup.n++;return}
    tagQ.push(item)}
  function pumpTags(){tags=tags.filter(x=>t-x.t0<2.6);while(tags.length<2&&tagQ.length){const x=tagQ.shift();x.t0=t;if(x.n>1)x.text+=' ×'+x.n;tags.push(x)}}
  function showBanner(text,delay=0){after(delay,()=>bannerQ.push({text}))}
  function pumpBanner(){if(banner&&t-banner.t0<3)return;banner=null;if(bannerQ.length){banner=bannerQ.shift();banner.t0=t}}
  // ---------- actions
  function cheer(silent){poke();lastCheer=t;P.forEach(p=>{const s=SLOTS[p.slot];p.wave=t+(s.x-120)/1000*1.1});if(!silent)sfx('cheer')}
  function raid(raider,n){poke();n=Math.max(1,Math.min(C.raidMax,n|0));surpriseUntil=t+1.6;showBanner('RAID ×'+n+(raider?' · '+raider:'')+' · welcome in!');sfx('raid');
    for(let i=0;i<n;i++)seat('raid:'+(raider||'x')+':'+t.toFixed(2)+':'+i,.15+i*.13,true)}
  function lightsFrom(units){units=Math.max(0,units);let whole=Math.floor(units);bank+=units-whole;if(bank>=1-1e-9){whole++;bank-=1}return whole}
  function support(name,amountLabel,units){poke();
    const n=lightsFrom(units);
    if(!n){const L=LANT[Math.min(lit,LANT.length-1)];tag(name+' · '+amountLabel+' (adds up)',null,true,{x:L.x,y:L.y-40});dirty=true;return}
    for(let k=0;k<n;k++)after(.7+k*.45,()=>addLight(name,amountLabel));dirty=true}
  function addLight(name,label){
    if(lit>=LANT.length||roundBusy){if(C.rounds)pendingSup++;dirty=true;return}
    const L=LANT[lit];litT[lit]=t;lit++;sfx('light');
    tag((name||'')+(label?' · '+label:'')+' lit a lantern',null,true,{x:L.x,y:L.y-40});
    for(let i=0;i<16;i++){const a=rnd()*Math.PI*2,v=60+rnd()*120;parts.push({x:L.x,y:L.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-50,t0:t,life:.7+rnd()*.4})}
    if(lit===LANT.length){
      if(round===1){auroraT=t+.4;if(C.christmas)treeOnT=t+.4;showBanner(C.christmas?'ALL LANTERNS LIT · LIGHTS ON!':'ALL LANTERNS LIT · AURORA!',.4);after(.4,()=>sfx('goal'));after(.9,()=>cheer(true))}
      else{showBanner('ROUND '+round+' COMPLETE!',.3);auroraPulse=t;after(.3,()=>sfx('goal',.8));after(.7,()=>cheer(true))}
      if(C.rounds){roundBusy=true;after(round===1?8.5:5,nextRound)}
    }
    dirty=true}
  function nextRound(){fadeFrom=lit;fadeT=t;lit=0;litT=[];round++;roundBusy=false;showBanner('ROUND '+round+' · LIGHT THEM AGAIN');sfx('round');
    const q=pendingSup;pendingSup=0;for(let i=0;i<q;i++)after(.9+i*.35,()=>addLight('',''));dirty=true}
  function checkGoals(){
    if(memberCount()>=C.goalMembers&&!fullShown){fullShown=true;showBanner('COLONY GOAL REACHED!');sfx('goal');after(.3,()=>cheer(true));after(1.7,()=>cheer(true));dirty=true}
    if(memberCount()>=C.goalMembers&&auroraT>0&&!finaleShown&&t>auroraT+2){finaleShown=true;showBanner('BOTH GOALS DONE · GRAND FINALE');sfx('finale');
      [0,1.3,2.6,3.9].forEach(d=>after(d,()=>cheer(true)));for(let i=0;i<120;i++){parts.push({x:rnd()*1150+25,y:300+rnd()*80,vx:(rnd()-.5)*80,vy:-200-rnd()*200,t0:t+rnd()*1.5,life:2.2})}dirty=true}
  }
  // ---------- public input
  function event(e){if(!ready)return;e=e||{};const name=(e.name||'').trim()||'someone';const amt=+e.amount||0;
    switch(e.type){
      case 'follower':{seat(name,0,true);after(.75,()=>{const p=seated(name);if(p)tag(name+' followed',p)});break}
      case 'subscriber':goldify(name,'subscribed');support(name,'sub',1);break;
      case 'gift':{const n=Math.max(1,e.count|0||amt|0||1);goldify(name,'gifted '+n);support(name,n+' gift'+(n>1?'s':''),n);break}
      case 'cheer':{if(amt>=C.bitsPerLight)goldify(name,'· '+amt+' bits');else seat(name,0,true);support(name,amt+' bits',amt/Math.max(1,C.bitsPerLight));break}
      case 'tip':{const lbl=e.label||(amt.toFixed(amt%1?2:0));if(amt>=C.tipPerLight)goldify(name,'· '+lbl);else seat(name,0,true);support(name,lbl+' tip',amt/Math.max(.01,C.tipPerLight));break}
      case 'raid':raid(name,e.count||amt||1);break;
    }}
  function chat(name,text,flags){if(!ready||!name)return;flags=flags||{};text=(text||'').trim();const low=text.toLowerCase();
    if((flags.mod||flags.broadcaster)&&low.startsWith('!crowd')){modCommand(low.split(/\s+/).slice(1));return}
    const sp=seated(name);if(sp){sp.lastChat=t}if(MEM[name])MEM[name].last=t;poke();
    if(low.startsWith(C.cheerCommand.toLowerCase())){if(t>=cheerReady){cheerReady=t+C.cheerCooldown;if(!sp)seat(name);cheer()}return}
    if(!sp&&(C.joinOn==='chat'||low.startsWith(C.joinCommand.toLowerCase())))seat(name)}
  function modCommand(a){if(a[0]==='reset'){reset()}else if(a[0]==='lights'){const n=Math.max(0,Math.min(LANT.length,a[1]|0));lit=n;litT=[];for(let i=0;i<n;i++)litT[i]=t-1;dirty=true}else if(a[0]==='cheer'){cheer()}}
  // ---------- persistence
  function snapshot(){const ms=Object.values(MEM).sort((a,b)=>(b.gold-a.gold)||(b.last-a.last)).slice(0,260);return{v:1,total:memberCount(),members:ms.map(m=>[m.name,m.gold?1:0,Math.round(m.last-t)]),lit,bank:+bank.toFixed(3),round,pending:pendingSup,
    aurora:auroraT>0?1:0,tree:treeOnT>0?1:0,finale:finaleShown?1:0,full:fullShown?1:0,roundBusy:roundBusy?1:0}}
  function restore(s){if(!s||s.v!==1)return;MEM={};P=[];
    ghost=0;(s.members||[]).forEach(([n,gd,ago])=>{const m=member(n);m.gold=!!gd;m.last=t+(ago||0)});ghost=Math.max(0,(s.total|0)-Object.keys(MEM).length);
    lit=Math.min(LANT.length,s.lit|0);litT=[];for(let i=0;i<lit;i++)litT[i]=t-5;bank=+s.bank||0;round=s.round||1;pendingSup=s.pending|0;
    auroraT=s.aurora?t-10:-1;treeOnT=s.tree?t-10:-1;finaleShown=!!s.finale;fullShown=!!s.full;
    if(s.roundBusy&&C.rounds){roundBusy=true;after(1.5,nextRound)}
    // reseat the most recently active members instantly (no drop animation)
    Object.values(MEM).sort((a,b)=>b.last-a.last).slice(0,SLOTS.length).forEach(m=>{const p=seat(m.name,0,true,true);if(p){p.lastChat=m.last;p.gold=m.gold}});
    dirty=false}
  function restoreSaved(){if(!storage)return;try{const raw=storage.get(storeKey);if(raw)restore(typeof raw==='string'?JSON.parse(raw):raw)}catch(e){}}
  function save(force){if(!storage||(!dirty&&!force))return;if(!force&&t-lastSave<1)return;lastSave=t;dirty=false;try{storage.set(storeKey,JSON.stringify(snapshot()))}catch(e){}}
  function reset(){ghost=0;MEM={};P=[];WAIT=[];tags=[];tagQ=[];parts=[];banner=null;bannerQ=[];later=[];lit=0;litT=[];bank=0;round=1;fadeFrom=0;fadeT=-9;pendingSup=0;roundBusy=false;
    auroraT=-1;auroraPulse=-9;treeOnT=-1;finaleShown=false;fullShown=false;surpriseUntil=-9;poke();dirty=true;save(true)}
  // ---------- drawing helpers
  function lA(i){if(i<lit)return 1;if(i<fadeFrom)return Math.max(0,1-(t-fadeT)/.8);return 0}
  function pglow(px,py,r,c,a){if(a<=0)return;g.save();g.globalCompositeOperation='lighter';const R=g.createRadialGradient(px,py,1,px,py,r);R.addColorStop(0,`rgba(${c},${a})`);R.addColorStop(1,`rgba(${c},0)`);g.fillStyle=R;g.beginPath();g.arc(px,py,r,0,7);g.fill();g.restore()}
  function outfit(p){const k=p.hh,Wd=C.christmas?WARD.xmas:WARD.winter;
    let hat=Wd.hat[(k>>2)%Wd.hat.length],vest=Wd.vest[(k>>7)%Wd.vest.length],neck=Wd.neck[(k>>11)%Wd.neck.length];
    if(p.gold){hat=hat?hat.replace(/_(cream|red|navy|mint|pink)$/,'')+'_gold':'pom_gold';if(neck&&neck.startsWith('scarf_'))neck='scarf_gold'}
    return{hat,vest,neck}}
  function drawOutfit(O,w,h){if(O.vest&&IMG['vest_'+O.vest])g.drawImage(IMG['vest_'+O.vest],-w/2,-h,w,h);
    if(O.neck){const k=O.neck.startsWith('scarf_')?O.neck:'neck_'+O.neck;if(IMG[k])g.drawImage(IMG[k],-w/2,-h,w,h)}
    if(O.hat&&IMG['hat_'+O.hat])g.drawImage(IMG['hat_'+O.hat],-w/2,-h,w,h)}
  function pill(x,y,text,gold,a,marquee){g.save();g.globalAlpha=a;
    if(!marquee){g.font='700 23px Fredoka, system-ui';const tw=g.measureText(text).width+36;g.shadowColor='rgba(0,0,0,.35)';g.shadowBlur=8;g.shadowOffsetY=3;
      const gr=g.createLinearGradient(0,y-22,0,y+18);gr.addColorStop(0,gold?'#ffe7a6':'#fff8ea');gr.addColorStop(1,gold?'#e6b955':'#f1e2c4');g.fillStyle=gr;
      g.beginPath();g.roundRect(x-tw/2,y-22,tw,40,12);g.fill();g.shadowColor='transparent';g.strokeStyle=gold?'#8a5a10':'#8f1c22';g.lineWidth=3;g.stroke();
      g.fillStyle=gold?'#5a3208':'#7a1418';g.textAlign='center';g.fillText(text,x,y+7)}
    else{g.font='700 23px Fredoka, system-ui';const tw=g.measureText(text).width+44;g.shadowColor='rgba(0,0,0,.4)';g.shadowBlur=8;g.shadowOffsetY=3;g.fillStyle='#a8751c';g.beginPath();g.roundRect(x-tw/2,y-24,tw,44,10);g.fill();g.shadowColor='transparent';
      g.strokeStyle='#f3d38a';g.lineWidth=2;g.beginPath();g.roundRect(x-tw/2+5,y-19,tw-10,34,7);g.stroke();
      const n=Math.max(4,Math.round(tw/22));for(let i=0;i<n;i++){const bx=x-tw/2+8+i*(tw-16)/(n-1);[y-24,y+20].forEach(by=>{g.fillStyle=`rgba(255,240,200,${.6+.4*Math.sin(t*6+i)})`;g.beginPath();g.arc(bx,by,2.6,0,7);g.fill()})}
      g.fillStyle='#fff3dc';g.textAlign='center';g.fillText(text,x,y+6)}
    g.restore()}
  function drawTitle(){if(!C.showTitle||!C.title)return;const cx=S.titleX,lines=String(C.title).split('|').slice(0,3);const big=lines.length>1?[120,150,150]:[140];let y=lines.length>1?470:540;
    g.save();g.textAlign='center';if(C.subtitle){g.font='700 30px Fredoka, system-ui';g.fillStyle='#f4d58c';g.fillText(C.subtitle,cx,y-(lines.length>1?128:150))}
    lines.forEach((tx,i)=>{let sz=big[Math.min(i,big.length-1)];g.font=`700 ${sz}px Fredoka, system-ui`;const mw=g.measureText(tx).width;if(mw>600){sz*=600/mw;g.font=`700 ${sz}px Fredoka, system-ui`}
      const yy=y+i*Math.max(sz,110)*1.02;g.lineJoin='round';g.lineWidth=sz*.16;g.strokeStyle='#e6c27c';g.strokeText(tx,cx,yy);g.lineWidth=sz*.1;g.strokeStyle='#7a1418';g.strokeText(tx,cx,yy);
      const gr=g.createLinearGradient(0,yy-sz*.8,0,yy);gr.addColorStop(0,'#fffaf0');gr.addColorStop(1,'#f3e2c2');g.fillStyle=gr;g.fillText(tx,cx,yy)});g.restore()}
  const CORNER=()=>C.layout==='corner';
  function drawBG(){const st=S.stage;
    if(!CORNER()){g.drawImage(IMG.bg,0,0,W,H);
      let v=g.createLinearGradient(0,H*.55,0,H);v.addColorStop(0,'rgba(6,11,24,0)');v.addColorStop(1,'rgba(6,11,24,.45)');g.fillStyle=v;g.fillRect(0,0,W,H);
      let r=g.createLinearGradient(W*.55,0,W,0);r.addColorStop(0,'rgba(6,11,24,0)');r.addColorStop(1,'rgba(6,11,24,.5)');g.fillStyle=r;g.fillRect(0,0,W,H)}
    g.save();g.fillStyle='rgba(4,8,18,.45)';g.filter='blur(18px)';g.beginPath();g.ellipse(st.x+575,st.y+600,560,40,0,0,7);g.fill();g.restore();
    if(!CORNER()&&auroraT>0&&t>auroraT){const A0=Math.min(1,(t-auroraT)/3)*(1+.8*Math.max(0,1-Math.abs(t-auroraPulse-1)/1.2));g.save();g.globalCompositeOperation='lighter';g.filter='blur(16px)';
      [[[90,255,190],120,0],[[120,240,140],190,1.7],[[170,130,255],70,3.1]].forEach(([c,b0,k])=>{const top=[];for(let x=-40;x<=W+40;x+=40)top.push([x,b0+Math.sin(x*.0035+t*.25+k)*70+Math.sin(x*.009+t*.45+k)*22]);
        const gr=g.createLinearGradient(0,b0-90,0,b0+260);gr.addColorStop(0,`rgba(${c},0)`);gr.addColorStop(.25,`rgba(${c},${.32*A0})`);gr.addColorStop(1,`rgba(${c},0)`);
        g.fillStyle=gr;g.beginPath();g.moveTo(top[0][0],top[0][1]);top.forEach(p=>g.lineTo(p[0],p[1]));for(let i=top.length-1;i>=0;i--)g.lineTo(top[i][0],top[i][1]+230+Math.sin(i*.7+t)*30);g.closePath();g.fill()});g.restore()}
    TREE=null;if(C.christmas){const T=S.tree,k=330/T.h,tw=T.w*k,th=T.h*k;TREE={x:600-tw/2,y:585-th,k};g.drawImage(IMG.tree,TREE.x,TREE.y,tw,th)}
    g.save();g.filter='brightness(.86) saturate(.92)';g.drawImage(IMG.stage,st.x,st.y);g.restore();
    if(C.christmas){const GM=S.garland;S.edges.forEach((e,ei)=>{const w=e.x1-e.x0;g.drawImage(IMG.garland,e.x0,e.y-8,w,e.h);
        GM.bulbs.forEach((b,i)=>{const x=e.x0+b[0]/GM.w*w,y=e.y-8+b[1]/GM.h*e.h;const tw=.5+.5*Math.sin(t*(1.3+((i*7+ei)%5)*.25)+i*2.1);const dt=t-lastCheer-((x-120)/1000*1.1);const ch=Math.exp(-((dt/.18)**2));
          const al=.25+.35*tw+.9*ch;g.save();g.globalCompositeOperation='lighter';const rg=g.createRadialGradient(x,y,1,x,y,16+ch*14);rg.addColorStop(0,`rgba(255,226,160,${Math.min(1,al)})`);rg.addColorStop(1,'rgba(255,190,110,0)');g.fillStyle=rg;g.beginPath();g.arc(x,y,16+ch*14,0,7);g.fill();g.restore()})});
      {const G=S.gifts,gw=150,gh=G.h*gw/G.w,by=1052;g.save();g.fillStyle='rgba(4,8,18,.4)';g.filter='blur(8px)';g.beginPath();g.ellipse(40+gw/2,by-4,gw*.5,12,0,0,7);g.ellipse(1160-gw/2,by-4,gw*.5,12,0,0,7);g.fill();g.restore();
        g.drawImage(IMG.gifts,40,by-gh,gw,gh);g.save();g.translate(1160,0);g.scale(-1,1);g.drawImage(IMG.gifts,0,by-gh,gw,gh);g.restore()}
      if(TREE){const T=S.tree,k=TREE.k,sx=TREE.x+T.star[0]*k,sy=TREE.y+T.star[1]*k,pul=.6+.4*Math.sin(t*1.5);g.save();g.globalCompositeOperation='lighter';let rg=g.createRadialGradient(sx,sy,2,sx,sy,60);rg.addColorStop(0,`rgba(255,226,150,${.55*pul})`);rg.addColorStop(1,'rgba(255,200,110,0)');g.fillStyle=rg;g.beginPath();g.arc(sx,sy,60,0,7);g.fill();
        if(treeOnT>0&&t>treeOnT){T.orn.forEach((o,i)=>{const on=Math.min(1,Math.max(0,(t-treeOnT-i*.05)/.3));if(!on)return;const x=TREE.x+o[0]*k,y=TREE.y+o[1]*k,tw=.75+.25*Math.sin(t*2+i);rg=g.createRadialGradient(x,y,1,x,y,22);rg.addColorStop(0,`rgba(255,220,150,${.8*on*tw})`);rg.addColorStop(1,'rgba(255,180,100,0)');g.fillStyle=rg;g.beginPath();g.arc(x,y,22,0,7);g.fill()});
          const big=Math.min(1,(t-treeOnT)/1.2);rg=g.createRadialGradient(600,430,10,600,430,240);rg.addColorStop(0,`rgba(255,200,120,${.22*big})`);rg.addColorStop(1,'rgba(255,200,120,0)');g.fillStyle=rg;g.beginPath();g.arc(600,430,240,0,7);g.fill()}g.restore()}}
    for(let i=0;i<LANT.length;i++){const la=lA(i);if(la<=0)continue;const L=LANT[i],a=la*Math.min(1,(t-(litT[i]||t-5))/.35),fl=.88+.12*Math.sin(t*9+i*2)*Math.sin(t*5.3+i);
      g.save();g.globalCompositeOperation='lighter';const rg=g.createRadialGradient(L.x,L.y,2,L.x,L.y,26);rg.addColorStop(0,`rgba(255,200,110,${.85*a*fl})`);rg.addColorStop(1,'rgba(255,150,60,0)');g.fillStyle=rg;g.fillRect(L.x-18,L.y-24,36,46);g.restore()}
    if(!CORNER())drawTitle()}
  function sleeping(p,age){return p.sleeper&&t-lastEvent>C.sleepAfter&&age>1.2}
  function drawPenguin(p){const s=SLOTS[p.slot],h=s.h,w=h*IMG.idle.width/IMG.idle.height;
    if(p.leave!==undefined&&t>=p.leave){const u=t-p.leave,ET=p.exitType||0,endY=1035;const hop=.32,dur=1.05,pre=ET===4?.45:ET===3?.38:0;let y=s.y,al=1,rot=0,pose=IMG.idle;const v=u-pre;
      if(v<0){if(ET===4){rot=Math.sin(u/pre*Math.PI*3)*.22;pose=IMG.cheer}else{y=s.y-Math.sin(u/pre*Math.PI)*h*.18}}
      else if(v<hop){const k=v/hop;y=s.y-Math.sin(k*Math.PI)*h*(ET===1?.6:.45);if(ET===0)rot=p.dir*.08*k;if(ET===1||ET===4)pose=IMG.cheer;if(ET===2){rot=p.dir*k*Math.PI;pose=IMG.cheer}if(ET===3){pose=IMG.cheer;y=s.y-Math.sin(k*Math.PI)*h*.75}}
      else{const k=Math.min(1,(v-hop)/(dur-hop)),e=k*k;y=s.y+(endY-s.y)*e;al=k>.75?Math.max(0,1-(k-.75)/.25):1;if(ET===0)rot=p.dir*(.08+.18*k);if(ET===1){pose=IMG.cheer;rot=p.dir*.06*Math.sin(k*8)}if(ET===2){rot=p.dir*(Math.PI+k*Math.PI);pose=IMG.cheer}if(ET===3)pose=IMG.cheer;if(ET===4){rot=p.dir*k*Math.PI*2;pose=IMG.cheer}}
      if(!p.splash&&u>pre+dur*.92){p.splash=1;for(let i=0;i<14;i++){const a=-Math.PI*(.15+.7*rnd()),vv=90+rnd()*140;parts.push({x:s.x,y:endY-8,vx:Math.cos(a)*vv,vy:Math.sin(a)*vv,t0:t,life:.6+rnd()*.3,snow:1})}}
      g.save();g.globalAlpha=al;g.translate(s.x,y-h*.5);g.rotate(rot);g.translate(0,h*.5);g.drawImage(pose,-w/2,-h,w,h);drawOutfit(outfit(p),w,h);g.restore();return}
    const age=t-p.t0;if(age<0)return;const zz=sleeping(p,age);
    let y=s.y,sx=1,sy=1,rot=zz?Math.sin(t*.7+p.phase)*.045:Math.sin(t*1.7+p.phase)*.028,cheerOn=false,alpha=1;const fall=.42;
    if(age<fall){const u=age/fall;y=s.y-(1-u*u)*420;alpha=Math.min(1,u*3)}else{const a=age-fall;if(a<.7){const k=Math.exp(-6*a)*Math.cos(18*a);sy=1-.16*k;sx=1+.12*k}}
    const wu=(t-p.wave)/.75;if(wu>=0&&wu<=1){cheerOn=true;y-=Math.sin(Math.PI*wu)*h*.35;sy*=1+.05*Math.sin(Math.PI*wu);rot*=.3}
    const su=(t-(surpriseUntil-1.6))/.35;if(su>=0&&su<=1&&age>.6)y-=Math.sin(Math.PI*su)*h*.12;
    const pu=(t-p.pop)/.6;if(pu>=0&&pu<=1){const k=Math.exp(-5*pu)*Math.cos(14*pu);sx*=1+.2*k;sy*=1+.2*k;cheerOn=true}
    const hopc=(t*.23+p.phase)%7;if(!cheerOn&&!zz&&age>fall+.7&&hopc<.35)y-=Math.sin(hopc/.35*Math.PI)*h*.08;
    if(p.gold){const pul=.75+.25*Math.sin(t*1.6+p.phase),gx=s.x,gy=y-h*.62,gr=h*.75,rg=g.createRadialGradient(gx,gy,h*.08,gx,gy,gr);rg.addColorStop(0,`rgba(255,214,140,${.30*pul*alpha})`);rg.addColorStop(.55,`rgba(240,190,100,${.12*pul*alpha})`);rg.addColorStop(1,'rgba(240,190,100,0)');
      g.save();g.globalCompositeOperation='lighter';g.fillStyle=rg;g.beginPath();g.arc(gx,gy,gr,0,7);g.fill();g.restore()}
    g.save();g.globalAlpha=.35*alpha;g.fillStyle='#000';g.beginPath();g.ellipse(s.x,s.y+2,w*.42*(age<fall?age/fall:1),h*.06,0,0,7);g.fill();g.restore();
    g.save();g.globalAlpha=alpha;g.translate(s.x,y);g.rotate(rot);g.scale(sx,sy);g.shadowColor='rgba(255,214,150,.35)';g.shadowBlur=6;
    g.drawImage(cheerOn?IMG.cheer:IMG.idle,-w/2,-h,w,h);g.shadowBlur=0;
    if(!cheerOn){let f=p.face;if(zz)f='sleepy';if(t-p.shy<3.2)f='shy';if(t<surpriseUntil&&age>.6)f='surprised';if(f&&IMG['face_'+f])g.drawImage(IMG['face_'+f],-w/2,-h,w,h)}
    const O=outfit(p);drawOutfit(O,w,h);
    if(p.gold&&O.hat&&IMG['hat_'+O.hat]){g.save();g.globalCompositeOperation='lighter';g.shadowColor='rgba(255,215,140,.9)';g.shadowBlur=h*.12;g.globalAlpha=.22+.12*Math.sin(t*1.6+p.phase);g.drawImage(IMG['hat_'+O.hat],-w/2,-h,w,h);g.restore();
      const tw=(t*.45+p.phase*.37)%3;if(tw<.5){const k=Math.sin(tw/.5*Math.PI),r=h*.07*k;g.save();g.globalAlpha=k;g.fillStyle='#fff3d0';g.translate(-w*.18+((p.phase*7)%1)*w*.36,-h*.9);g.rotate(Math.PI/4);g.beginPath();g.moveTo(0,-r);g.lineTo(r*.22,-r*.22);g.lineTo(r,0);g.lineTo(r*.22,r*.22);g.lineTo(0,r);g.lineTo(-r*.22,r*.22);g.lineTo(-r,0);g.lineTo(-r*.22,-r*.22);g.closePath();g.fill();g.restore()}}
    g.restore();
    if(zz){const k=(t*.5+p.phase)%2;if(k<1.4){g.save();g.globalAlpha=Math.sin(k/1.4*Math.PI)*.85;g.fillStyle='#f3ead8';g.font='italic 700 '+Math.round(h*.2)+'px Georgia,serif';g.fillText('z',s.x+w*.28+k*10,s.y-h*1.02-k*22);g.restore()}}}
  function drawPlaque(){const M=S.plaque,k=M.w/M.bw,Hh=M.bh*k,x=M.cx-M.w/2,y=(CORNER()&&!C.christmas)?205:M.y;
    if(!RING){const per=b=>{const [bx,by]=b;if(by<M.bh*.2)return bx/M.bw;if(bx>M.bw*.8)return 1+by/M.bh;if(by>M.bh*.8)return 2+(M.bw-bx)/M.bw;return 3+(M.bh-by)/M.bh};RING=[...M.bulbs.keys()].sort((p,q)=>per(M.bulbs[p])-per(M.bulbs[q]))}
    g.save();g.shadowColor='rgba(0,0,0,.5)';g.shadowBlur=22;g.shadowOffsetY=10;if(!C.christmas)g.filter='hue-rotate(-12deg) saturate(.8) brightness(.62)';g.drawImage(IMG.plaque,x,y,M.w,Hh);g.restore();
    const full=lit>=LANT.length,cols=C.christmas?['255,95,75','255,205,90','110,235,130','255,244,220']:['255,238,200'],fullT=full?t-(litT[LANT.length-1]||t-10):-1;
    RING.forEach((bi,r)=>{const b=M.bulbs[bi],px=x+b[0]*k,py=y+b[1]*k,n=RING.length;let a=.35+.2*Math.sin(t*2.2+r*.9);
      const ch=(t-lastCheer)*1.6-r/n;if(ch>-.05&&ch<1.1){const z=((t-lastCheer)*1.6*n-r)/2.2;a+=Math.exp(-(z*z))*.9}
      if(full)a=fullT<3?(.55+.45*Math.sign(Math.sin(t*14+r))):(.7+.3*Math.sin(t*4-r*.5));
      pglow(px,py,16,cols[r%cols.length],Math.min(1,a)*.9);pglow(px,py,5,'255,255,240',Math.min(1,a))});
    const iy=y+Hh*.19,ih=Hh*.62,cx=M.cx,r1=iy+ih*.33,r2=iy+ih*.74,hh=ih*.44,hw=hh*IMG.ico_head.width/IMG.ico_head.height,numSz=ih*.32;
    const nm=memberCount(),txt=Math.min(nm,C.goalMembers)+' / '+C.goalMembers;
    g.font=`700 ${numSz}px Fredoka, system-ui`;const nw=g.measureText(txt).width,l0=cx-(hw+10+nw)/2;g.drawImage(IMG.ico_head,l0,r1-hh*.6,hw,hh);
    g.textAlign='left';g.fillStyle='rgba(0,0,0,.35)';g.fillText(txt,l0+hw+12,r1+numSz*.36+3);g.fillStyle='#fff3dc';g.fillText(txt,l0+hw+10,r1+numSz*.36);
    const CL=['red','gold','green','white'],ihgt=C.christmas?ih*.34:ih*.22,sp=C.christmas?ihgt*.66:ihgt*1.3,lx0=cx-sp*3.5;
    for(let i=0;i<LANT.length;i++){const la=lA(i),off=C.christmas?IMG[`b_${CL[i%4]}_off`]:IMG.s_off,onI=C.christmas?IMG[`b_${CL[i%4]}_on`]:IMG.s_on;
      const ww=ihgt*off.width/off.height,px=lx0+i*sp,py=r2;let s=1;if(i<lit){const u=t-litT[i];if(u<.6)s=1+.45*Math.exp(-6*u)*Math.cos(16*u)}
      const cc=C.christmas?['255,80,60','255,200,80','90,230,110','255,240,210'][i%4]:'255,235,180',gy=py+(C.christmas?ihgt*.12:0);
      if(la>0){pglow(px,gy,ihgt*.6*s,cc,.7*la);if(i<lit&&t-litT[i]<.5)pglow(px,gy,ihgt*1.6,cc,.6*(1-(t-litT[i])/.5))}
      g.save();g.translate(px,py);g.scale(s,s);g.globalAlpha=.85;g.drawImage(off,-ww/2,-ihgt/2,ww,ihgt);if(la>0){g.globalAlpha=la;g.drawImage(onI,-ww/2,-ihgt/2,ww,ihgt)}g.restore();if(la>0)pglow(px,gy,ihgt*.22,'255,255,235',.8*la)}
    if(round>1){const bx=lx0+sp*7+sp*.95,by=r2,rr=ihgt*.42,pop=Math.max(0,1-(t-fadeT)/.5);g.save();g.translate(bx,by);g.scale(1+pop*.4,1+pop*.4);const gr=g.createLinearGradient(0,-rr,0,rr);gr.addColorStop(0,'#ffe9a8');gr.addColorStop(1,'#c99a3e');g.fillStyle=gr;g.beginPath();g.arc(0,0,rr,0,7);g.fill();
      g.strokeStyle='rgba(90,50,10,.6)';g.lineWidth=2;g.stroke();g.fillStyle='#5a3208';g.font=`700 ${rr*1.05}px Fredoka, system-ui`;g.textAlign='center';g.fillText('×'+round,0,rr*.37);g.restore()}}
  function drawUI(){
    for(let i=0;i<LANT.length;i++){const la=lA(i);if(la<=0)continue;const L=LANT[i],lt=litT[i]!==undefined?litT[i]:t-5,a=la*Math.min(1,(t-lt)/.35),fl=.9+.1*Math.sin(t*7+i*3),burst=Math.max(0,1-(t-lt)/.6);
      g.save();g.globalCompositeOperation='lighter';const rg=g.createRadialGradient(L.x,L.y,4,L.x,L.y,80+burst*90);rg.addColorStop(0,`rgba(255,196,110,${(.38+burst*.5)*a*fl})`);rg.addColorStop(1,'rgba(255,170,80,0)');g.fillStyle=rg;g.beginPath();g.arc(L.x,L.y,80+burst*90,0,7);g.fill();g.restore()}
    drawPlaque();
    tags.forEach(tg=>{const a=t-tg.t0;if(a>2.6||a<0)return;const al=Math.min(1,a*5)*(a>2.1?(2.6-a)*2:1);if(tg.at){pill(tg.at.x,tg.at.y-ease(a*3)*10,tg.text,true,al);return}
      const p=P.find(q=>q.slot===tg.slot&&q.leave===undefined);const s=SLOTS[tg.slot];if(!s)return;pill(s.x,s.y-s.h-26-ease(a*3)*10,tg.text,tg.gold,al)});
    if(banner){const a=t-banner.t0;if(a<3){const al=Math.min(1,a*4)*(a>2.4?(3-a)/.6:1);pill(CORNER()?600:S.titleX+20,CORNER()?300:720,banner.text,true,al,true)}}
    parts=parts.filter(p=>t-p.t0<p.life);parts.forEach(p=>{const a=t-p.t0;if(a<0)return;g.save();g.globalAlpha=1-a/p.life;g.fillStyle=p.snow?'#ffffff':'#ffe2a0';g.translate(p.x+p.vx*a,p.y+p.vy*a+180*a*a);g.rotate(a*6);g.fillRect(-4,-4,8,8);g.restore()})}
  function drawSnow(dt){g.fillStyle='rgba(255,255,255,.75)';snow.forEach(s=>{s.y+=s.v*dt;s.x+=Math.sin(t*.6+s.d)*8*dt;if(s.y>H){s.y=-4;s.x=rnd()*W}g.beginPath();g.arc(s.x,s.y,s.r,0,7);g.fill()})}
  function frame(dt){
    if(!ready||destroyed)return;dt=Math.max(0,Math.min(.1,dt));t+=dt;runLater();
    P=P.filter(p=>p.leave===undefined||t-p.leave<1.6);
    if(WAIT.length){const n=WAIT[0];if(seat(n))WAIT.shift()}
    pumpTags();pumpBanner();checkGoals();
    if(CORNER()){g=ctxO;g.clearRect(0,0,W,H)}else g=ctx0;
    drawBG();P.filter(p=>p.leave===undefined||t<p.leave).forEach(drawPenguin);P.filter(p=>p.leave!==undefined&&t>=p.leave).forEach(drawPenguin);if(!CORNER())drawSnow(dt);drawUI();
    if(CORNER()){g=ctx0;g.clearRect(0,0,W,H);const [sx,sy,sw,sh]=S.cornerCrop,dh=C.cornerHeight,dw=dh*sw/sh;g.drawImage(OC,sx,sy,sw,sh,W-dw-C.cornerMargin,H-dh-C.cornerMargin,dw,dh)}
    save()}
  let lastMs=0;function loop(ms){if(destroyed)return;const dt=lastMs?(ms-lastMs)/1000:0;lastMs=ms;frame(dt);requestAnimationFrame(loop)}
  // ---------- API
  const api={VERSION,
    event,chat,cheer:()=>cheer(),reset,
    tick:dt=>frame(dt==null?1/30:dt),
    step:sec=>{const n=Math.round(sec*30);for(let i=0;i<n;i++)frame(1/30)},
    snapshot,restore:s=>{restore(s);dirty=true;save(true)},
    setConfig:c=>{const ch=c&&c.christmas!==undefined&&c.christmas!==C.christmas;Object.assign(C,c||{});if(ch&&C.christmas&&auroraT>0&&treeOnT<0)treeOnT=t;if(C.sound&&!audio.ctx)loadSounds()},
    config:()=>Object.assign({},C),
    totals:()=>({members:memberCount(),goalMembers:C.goalMembers,lights:lit,round,bank:+bank.toFixed(2),pending:pendingSup}),
    debug:()=>({VERSION,t:+t.toFixed(2),seated:P.filter(p=>p.leave===undefined).length,slots:SLOTS.length,members:memberCount(),waiting:WAIT.length,lit,round,roundBusy,pending:pendingSup,bank:+bank.toFixed(2),
      aurora:auroraT>0,tree:treeOnT>0,finale:finaleShown,colonyGoal:fullShown,tagsVisible:tags.length,tagsQueued:tagQ.length,banner:banner&&banner.text,bannersQueued:bannerQ.length,gold:P.filter(p=>p.gold).length,layout:C.layout,christmas:C.christmas}),
    preview:(n,l)=>{for(let i=0;i<(n||18);i++)seat('viewer_'+(i+1),0,true,true);lit=Math.min(LANT.length,l||0);litT=[];for(let i=0;i<lit;i++)litT[i]=t-5;dirty=false},
    _demo:{seat:(n,d,s)=>seat(n||('viewer'+Math.floor(rnd()*1e6)),d||0,s),forceSleep:()=>{lastEvent=t-1e6},members:()=>Object.keys(MEM)},
    destroy:()=>{destroyed=true}};
  load().catch(e=>console.error('[EXE CROWD] load failed',e));
  return api;
}
window.Crowd={create,DEFAULTS,HELP,VERSION};
})();
