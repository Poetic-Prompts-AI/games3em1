// ===== util
const $ = s => document.querySelector(s);

// ===== estado global
const S = { mode:'none', player:{nome:'', empresa:''} };

// ===== elementos comuns
const title=$('#title'), selector=$('#selector'), msg=$('#msg');
const login=$('#login'), logoFS=$('#logoFS'), loginErr=$('#login-error');
const whoName=$('#whoName'), whoOrg=$('#whoOrg');
const startBtn=$('#start'), scoreEl=$('#score'), timeEl=$('#time'), hiEl=$('#hi');

// ===== helpers
const SK_PLAYER='tapreflex_player';
const getSavedPlayer=()=>{try{return JSON.parse(localStorage.getItem(SK_PLAYER)||'{}');}catch{return{};}};
const leaderKey=mode=> mode==='reflex'?'leader_reflex' : mode==='memory'?'leader_memory' : 'leader_slice';

// ===== ÁUDIO GLOBAL (sons p/ Tap Reflex e Memória; Fruit Slice já tem)
const Sound = (()=> {
  let actx=null, master=null;
  function ensure(){
    if(actx) return;
    actx = new (window.AudioContext||window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.35; master.connect(actx.destination);
  }
  async function resume(){ try{ ensure(); await actx.resume(); }catch{} }
  function blip(freq=600, dur=0.08, vol=0.9, type='sine'){
    if(!actx) return;
    const t=actx.currentTime, o=actx.createOscillator(), g=actx.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t+0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t+dur+0.02);
  }
  function sweepDown(f0=500,f1=180,dur=0.22,vol=0.9,type='sine'){
    if(!actx) return;
    const t=actx.currentTime, o=actx.createOscillator(), g=actx.createGain();
    o.type=type; o.frequency.setValueAtTime(f0,t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1,f1), t+dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.02);
  }
  // sons coerentes
  const play = {
    // contagem comum
    countBeep(){ blip(660,0.07,0.6); },
    countFinal(){ blip(990,0.09,0.9); },
    startChirp(){ blip(660,0.06,0.8); setTimeout(()=>blip(880,0.05,0.8),70); },

    // Tap Reflex
    reflexHit(){ blip(980,0.07,0.9,'sine'); },
    reflexMiss(){ sweepDown(320,160,0.14,0.7,'sine'); },
    reflexEndWin(){ blip(720,0.08,0.8); setTimeout(()=>blip(980,0.08,0.8),100); },
    reflexEndLose(){ sweepDown(360,140,0.25,0.8); },

    // Memória
    memFlip(){ blip(420,0.03,0.5,'triangle'); },
    memPair(){ blip(660,0.05,0.8,'sine'); setTimeout(()=>blip(990,0.06,0.8,'sine'),90); },
    memWrong(){ sweepDown(360,220,0.12,0.6,'sine'); },
    memEndWin(){ blip(660,0.06,0.7); setTimeout(()=>blip(880,0.06,0.7),90); setTimeout(()=>blip(1100,0.06,0.7),180); },
    memEndLose(){ sweepDown(300,160,0.25,0.8); },
  };
  return { resume, play };
})();
document.addEventListener('pointerdown', ()=> Sound.resume(), {passive:true});
startBtn.addEventListener('click', ()=> Sound.resume(), {passive:true});

// ===== RANK
const rank=$('#rank'), rankTitle=$('#rank-title'), rankList=$('#rankList'), backBtn=$('#back');
function pushLeaderboard(mode,entry){
  const key=leaderKey(mode);
  const arr=JSON.parse(localStorage.getItem(key)||'[]');
  arr.push(entry); arr.sort((a,b)=>b.score-a.score);
  localStorage.setItem(key, JSON.stringify(arr.slice(0,10)));
  return JSON.parse(localStorage.getItem(key));
}
function showRank(mode,score){
  rankTitle.textContent =
    mode==='reflex' ? 'Ranking — Tap Reflex' :
    mode==='memory' ? 'Ranking — Memória 3×4' : 'Ranking — Fruit Slice';
  const top=pushLeaderboard(mode,{nome:S.player.nome,empresa:S.player.empresa,score,t:Date.now()});
  rankList.innerHTML='';
  top.forEach((r,i)=>{ const li=document.createElement('li'); li.textContent=`${i+1}. ${r.nome} · ${r.empresa} — ${r.score}`; rankList.appendChild(li); });
  requestAnimationFrame(()=> rank.classList.remove('hidden'));
}
backBtn.addEventListener('click', ()=>{
  rank.classList.add('hidden');
  Reflex.hardStop(); Memory.hardStop(); Slice.hardStop();
  localStorage.removeItem(SK_PLAYER); whoName.textContent='—'; whoOrg.textContent='—';
  setMode('none'); showLogin();
});

// ===== navegação / modo
function setMode(mode){
  S.mode=mode;
  $('#game-reflex').classList.add('hidden');
  $('#game-memory').classList.add('hidden');
  $('#game-slice').classList.add('hidden');
  selector.style.display='none'; msg.style.display='none';

  scoreEl.textContent='0'; timeEl.textContent='30'; hiEl.textContent='0';
  startBtn.textContent='Iniciar'; startBtn.disabled=(mode==='none');

  if(mode==='reflex'){
    $('#game-reflex').classList.remove('hidden'); title.textContent='Tap Reflex';
    Reflex.loadHi(); Reflex.resetHUD();
  }else if(mode==='memory'){
    $('#game-memory').classList.remove('hidden'); title.textContent='Memória 3×4';
    Memory.loadHi(); Memory.setup();
  }else if(mode==='slice'){
    $('#game-slice').classList.remove('hidden'); title.textContent='Fruit Slice';
    Slice.loadHi(); Slice.prepare();
  }else{
    title.textContent='Arcade — Escolha um jogo';
    selector.style.display='block';
    startBtn.disabled=true;
  }
}

/* ====================== LOGIN ====================== */
function showLogin(){
  const s=getSavedPlayer();
  $('#nome').value=s.nome||''; $('#empresa').value=s.empresa||'';
  login.classList.remove('hidden'); selector.style.display='none';
  setTimeout(()=>$('#nome').focus(),30);
}
function doLogin(){
  const nome=$('#nome').value.trim(), empresa=$('#empresa').value.trim();
  if(!nome||!empresa){ loginErr.style.display='inline'; return; }
  loginErr.style.display='none';
  S.player={nome,empresa}; localStorage.setItem(SK_PLAYER, JSON.stringify(S.player));
  whoName.textContent=nome; whoOrg.textContent=empresa;
  login.classList.add('hidden'); setMode('none');
}
$('#loginBtn').addEventListener('click',doLogin);
$('#nome').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
$('#empresa').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
logoFS.addEventListener('click',()=>{
  const el=document.documentElement;
  if(!document.fullscreenElement){el.requestFullscreen?.();}else{document.exitFullscreen?.();}
},{passive:true});

/* ====================== SELETOR ====================== */
$('#pick-reflex').addEventListener('click',()=>setMode('reflex'));
$('#pick-memory').addEventListener('click',()=>setMode('memory'));
$('#pick-slice').addEventListener('click',()=>setMode('slice'));

/* ====================== TAP REFLEX (dinâmica aprimorada) ====================== */
const Reflex = {
  roundTime: 30,
  score: 0, time: 0, hi: 0, level: 1, playing: false,
  spawnTO: null, missTO: null, timerTO: null, appear: 0,
  target: document.querySelector('#target'),
  streak: 0,        // acertos seguidos
  mult: 1,          // multiplicador (↑ a cada 4 acertos, máx x4)
  kind: 'go',       // 'go' | 'gold' | 'decoy'

  sk(k){return `reflex_${k}_${S.player.nome}__${S.player.empresa}`;},
  loadHi(){ this.hi = Number(localStorage.getItem(this.sk('hi'))||0); hiEl.textContent=this.hi; },
  saveHi(){ if(this.score>this.hi){ this.hi=this.score; localStorage.setItem(this.sk('hi'),this.hi); hiEl.textContent=this.hi; } },

  killTimers(){ clearTimeout(this.spawnTO); clearTimeout(this.missTO); clearTimeout(this.timerTO);
               this.spawnTO=this.missTO=this.timerTO=null; },
  hardStop(){ this.playing=false; this.killTimers(); this.target.style.display='none';
              startBtn.textContent='Iniciar'; startBtn.disabled=true; },

  resetHUD(){
    this.score=0; this.time=this.roundTime; this.level=1; this.playing=false;
    this.streak=0; this.mult=1; this.kind='go';
    scoreEl.textContent=0; timeEl.textContent=this.time; startBtn.textContent='Iniciar';
    this.killTimers(); this.target.style.display='none'; startBtn.disabled=false;
  },

  rand(min,max){ return Math.random()*(max-min)+min; },

  // define visual e tipo do alvo
  paintKind(){
    if(this.kind==='gold'){
      this.target.textContent='★';
      this.target.style.borderColor='#ffd54a';
      this.target.style.boxShadow='0 12px 30px #000a, 0 0 40px 12px #ffd84a66';
    }else if(this.kind==='decoy'){
      this.target.textContent='NO!';
      this.target.style.borderColor='#ef4444';
      this.target.style.boxShadow='0 12px 30px #000a, 0 0 36px 10px #ef444466';
    }else{
      this.target.textContent='GO!';
      this.target.style.borderColor='#fff8';
      this.target.style.boxShadow='0 12px 30px #000a, 0 0 36px 10px #ffd84a55';
    }
  },

  spawn(){
    if(!this.playing) return;
    const stage = document.querySelector('#stage'), d = 120;
    const x = this.rand(10, stage.clientWidth  - d - 10);
    const y = this.rand(10, stage.clientHeight - d - 10);
    this.target.style.left = x+'px'; this.target.style.top = y+'px';

    // decide tipo: decoy ~18%, gold ~8%, senão GO
    const r = Math.random();
    this.kind = r < 0.18 ? 'decoy' : r < 0.26 ? 'gold' : 'go';
    this.paintKind();

    this.target.style.display='grid';
    this.appear = performance.now();

    // janela máxima para clicar (um pouco mais curta conforme evolui)
    const maxWait = Math.max(520, 1350 - this.level*75);
    clearTimeout(this.missTO);
    this.missTO = setTimeout(()=>{ if(this.playing) this.miss('timeout'); }, maxWait);
  },

  // pontuação por reação (antes do multiplicador)
  basePoints(rt){
    if(rt < 160) return 40;
    if(rt < 240) return 30;
    if(rt < 320) return 24;
    if(rt < 420) return 18;
    return 12;
  },

  updateMult(hit){
    if(hit){ this.streak++; this.mult = Math.min(4, 1 + Math.floor(this.streak/4)); }
    else{ this.streak=0; this.mult=1; }
  },

  // efeitos visuais simples
  flash(color){
    const stg=document.querySelector('#stage');
    const old=stg.style.background; stg.style.background=color;
    setTimeout(()=>{ stg.style.background=old||'#0d0f14'; }, 120);
  },

  next(){ if(!this.playing) return;
          clearTimeout(this.spawnTO);
          this.spawnTO = setTimeout(()=>{ if(this.playing) this.spawn(); }, this.rand(280, 820)); },

  hit(){
    if(!this.playing) return;
    clearTimeout(this.missTO);
    const rt = performance.now() - this.appear;

    if(this.kind==='decoy'){
      // caiu na armadilha
      this.updateMult(false);
      this.score = Math.max(0, this.score - 25);
      scoreEl.textContent = this.score;
      this.flash('#3b0d0d'); Sound.play.reflexMiss();
      this.target.style.display='none';
      this.next(); return;
    }

    let gained = this.kind==='gold' ? 60 : this.basePoints(rt);
    this.updateMult(true);
    gained = Math.round(gained * this.mult);

    this.score += gained; scoreEl.textContent = this.score;
    this.level = 1 + Math.floor(this.score/240);
    this.flash('#0f3b1b'); Sound.play.reflexHit();

    this.target.style.display='none';
    this.next();
  },

  miss(reason){
    if(!this.playing) return;
    this.updateMult(false);
    this.score = Math.max(0, this.score - 12);
    scoreEl.textContent = this.score;
    this.flash('#3b0d0d'); Sound.play.reflexMiss();
    this.target.style.display='none';
    this.next();
  },

  tick(){
    if(!this.playing) return;
    this.time--; timeEl.textContent=this.time;
    if(this.time<=0){ this.gameOver(); return; }
    this.timerTO=setTimeout(()=>this.tick(),1000);
  },

  preCount(cb){
    let n=3;
    msg.innerHTML = `<h2>Tap Reflex</h2><p class="muted">Prepare-se…</p><div class="tag" id="count">${n}</div>`;
    msg.style.display='block';
    const go=()=>{ 
      if(n<=1){ msg.style.display='none'; Sound.play.countFinal(); cb(); return; }
      n--; document.querySelector('#count').textContent=n; Sound.play.countBeep(); setTimeout(go,1000);
    };
    setTimeout(go,1000);
  },

  start(){
    if(!S.player.nome){ msg.innerHTML='<h2>Faça login primeiro</h2>'; msg.style.display='block'; return; }
    this.resetHUD(); startBtn.disabled=true;
    this.preCount(()=>{
      this.playing=true; startBtn.textContent='Jogando...';
      Sound.play.startChirp();
      this.timerTO=setTimeout(()=>this.tick(),1000);
      this.spawn();
    });
  },

  stopAndRank(){
    this.playing=false; this.killTimers(); this.target.style.display='none';
    this.saveHi(); startBtn.textContent='Iniciar';
    (this.score>0? Sound.play.reflexEndWin() : Sound.play.reflexEndLose());
    requestAnimationFrame(()=>showRank('reflex', this.score));
  },

  gameOver(){ this.stopAndRank(); }
};

// clique no alvo = hit; clicar fora = miss/penalidade
Reflex.target.addEventListener('click', ()=> Reflex.hit(), {passive:true});
document.querySelector('#game-reflex')
  .addEventListener('click', e=>{ if(e.target.id==='game-reflex' && Reflex.playing) Reflex.miss('bg'); }, {passive:true});


/* ====================== MEMÓRIA 3×4 (30s + sons) ====================== */
const Memory=(()=>{
  const icons=["🍎","🍊","🍋","🍇","🍓","🍉"];
  const board=$('#board'), overlay=$('#mem-overlay'), memMsg=$('#mem-msg');

  let playing=false, time=30, score=0, timerTO=null;
  let first=null, lock=false, matched=0;

  function sk(k){return `memory_${k}_${S.player.nome}__${S.player.empresa}`;}
  function loadHi(){ const hi=Number(localStorage.getItem(sk('hi'))||0)||0; hiEl.textContent=hi; }
  function saveHi(){ const hi=Number(localStorage.getItem(sk('hi')))||0; if(score>hi){ localStorage.setItem(sk('hi'),score); hiEl.textContent=score; } }
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a;}
  function makeCard(s,i){
    const el=document.createElement('div'); el.className='card'; el.dataset.symbol=s;
    el.innerHTML=`<div class="inner"><div class="face front"></div>
      <div class="face back" style="background: radial-gradient(circle at 30% 30%, hsl(${(i*57)%360} 90% 60%), #0e1016)">${s}</div></div>`;
    el.addEventListener('click',()=>flip(el),{passive:true}); return el;
  }
  function setup(){
    if(S.mode!=='memory') return;
    board.innerHTML=''; overlay.style.display='none';
    first=null; lock=false; matched=0;
    shuffle([...icons,...icons]).map((s,i)=>makeCard(s,i)).forEach(c=>board.appendChild(c));
    score=0; time=30; scoreEl.textContent=0; timeEl.textContent=time;
  }
  function flip(c){
    if(!playing||lock||c.classList.contains('flipped')||c.dataset.done) return;
    c.classList.add('flipped');
    Sound.play.memFlip();
    if(!first){ first=c; return; }
    if(first.dataset.symbol===c.dataset.symbol){
      first.dataset.done='1'; c.dataset.done='1'; matched+=2;
      score+=100; scoreEl.textContent=score; first=null;
      Sound.play.memPair();
      if(matched===12) gameOver(true);
    }else{
      lock=true; score=Math.max(0,score-20); scoreEl.textContent=score;
      Sound.play.memWrong();
      setTimeout(()=>{ first.classList.remove('flipped'); c.classList.remove('flipped'); first=null; lock=false; },650);
    }
  }
  function tick(){
    if(!playing) return;
    time--; timeEl.textContent=time;
    if(time<=0){ gameOver(false); return; }
    timerTO=setTimeout(tick,1000);
  }
  function start(){
    if(!S.player.nome){ msg.innerHTML='<h2>Faça login primeiro</h2>'; msg.style.display='block'; return; }
    setup(); startBtn.disabled=true;
    let n=3; msg.innerHTML=`<h2>Memória 3×4</h2><div class="tag" id="count">${n}</div>`; msg.style.display='block';
    const go=()=>{ if(n<=1){ msg.style.display='none'; playing=true; startBtn.textContent='Jogando...'; Sound.play.startChirp(); timerTO=setTimeout(tick,1000); return; }
      n--; $('#count').textContent=n; Sound.play.countBeep(); setTimeout(go,1000); };
    setTimeout(go,1000);
  }
  function gameOver(completou){
    playing=false; clearTimeout(timerTO);
    memMsg.innerHTML = completou ? `<h2>Parabéns!</h2><p>Sua pontuação: <b>${score}</b>.</p>`
                                  : `<h2>Fim do tempo!</h2><p>Sua pontuação: <b>${score}</b>.</p>`;
    overlay.style.display='grid';
    saveHi();
    (score>0 ? Sound.play.memEndWin() : Sound.play.memEndLose());
    requestAnimationFrame(()=>showRank('memory', score));
  }
  function hardStop(){ playing=false; clearTimeout(timerTO); overlay.style.display='none'; }

  return { setup, start, loadHi, hardStop };
})();

/* ====================== FRUIT SLICE (COM ÁUDIO PRÓPRIO RESTAURADO) ====================== */
const Slice = (()=>{
  // ---- CONFIG
  const GAME_SCALE=1.5, MAX_FRUITS=6, MAX_PART=60, STEP=1000/60;
  const ROUND_TIME=30, SPAWN_MS=520, BOMB_RATE=0.18;
  const DPR=Math.min(2, window.devicePixelRatio||1);

  // ---- CANVAS
  const cv=document.querySelector('#c-slice');
  const ct=cv.getContext('2d',{alpha:true, desynchronized:true});
  function resize(){ const w=cv.clientWidth, h=cv.clientHeight; cv.width=w*DPR*GAME_SCALE; cv.height=h*DPR*GAME_SCALE; ct.setTransform(DPR*GAME_SCALE,0,0,DPR*GAME_SCALE,0,0); }
  window.addEventListener('resize', resize);
  const overlay=document.querySelector('#overlay-slice');

  // ---- ÁUDIO EXCLUSIVO DO FRUIT SLICE (restaurado)
  let actx=null, master=null;
  function ensureAudio(){
    if (actx) return;
    actx = new (window.AudioContext||window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.35; master.connect(actx.destination);
  }
  async function safeResume(){ try{ ensureAudio(); await actx.resume(); }catch{} }
  function blip(freq=600, dur=0.08, t0=actx.currentTime){
    const o=actx.createOscillator(), g=actx.createGain();
    o.frequency.value=freq; o.type='sine';
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.9, t0+0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0+dur+0.02);
  }
  function noiseBurst(dur=0.06, t0=actx.currentTime, vol=0.7){
    const buf=actx.createBuffer(1, Math.floor(actx.sampleRate*dur), actx.sampleRate);
    const d=buf.getChannelData(0); for(let i=0;i>d.length;i++) d[i]=(Math.random()*2-1)*(1-i/d.length);
  }
  function noise(dur=0.06, t0=actx.currentTime, vol=0.7){
    const buffer = actx.createBuffer(1, Math.floor(actx.sampleRate*dur), actx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1) * (1 - i/data.length);
    const src=actx.createBufferSource(); src.buffer=buffer;
    const g=actx.createGain(); g.gain.value=vol;
    src.connect(g); g.connect(master); src.start(t0);
  }
  function playSlice(){ if(!actx) return; const t=actx.currentTime; blip(700,0.07,t); noise(0.05,t,0.55); }
  function playSpawn(){ if(!actx) return; blip(420,0.05); }
  function playBomb(){
    if(!actx) return;
    const t=actx.currentTime, o=actx.createOscillator(), g=actx.createGain();
    o.type='sine'; o.frequency.setValueAtTime(220,t); o.frequency.exponentialRampToValueAtTime(80,t+0.25);
    g.gain.setValueAtTime(0.001,t); g.gain.exponentialRampToValueAtTime(0.7,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.3);
    o.connect(g); g.connect(master); o.start(t); o.stop(t+0.35); noise(0.06,t,0.7);
  }

  // ---- TEXTURAS
  const FRUITS_SRC=['fruit-apple.png','fruit-orange.png','fruit-kiwi.png','fruit-watermelon.png'];
  const BOMB_SRC='./bomb.png';
  const TEX={fruits:[], bomb:null};
  function makeCircleSprite(img, size=192){
    const c=document.createElement('canvas'); c.width=size; c.height=size;
    const g=c.getContext('2d'); g.drawImage(img,0,0,size,size);
    g.globalCompositeOperation='destination-in'; g.beginPath(); g.arc(size/2,size/2,size/2,0,Math.PI*2); g.fill(); g.globalCompositeOperation='source-over';
    return c;
  }
  function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.decoding='async'; i.src=src; i.onload=()=>res(i); i.onerror=()=>res(null); }); }
  (async ()=>{ for(const s of FRUITS_SRC){ const im=await loadImg(s); TEX.fruits.push(im? makeCircleSprite(im,192):null); } const b=await loadImg(BOMB_SRC); TEX.bomb=b? makeCircleSprite(b,192):null; })();
  function pickFruitSprite(){ const arr=TEX.fruits.filter(Boolean); return arr.length? arr[(Math.random()*arr.length)|0]:null; }

  // ---- POOLS
  const fruits=new Array(MAX_FRUITS).fill(0).map(()=>({alive:false,x:0,y:0,vx:0,vy:0,ay:0,r:0,bomb:false,color:'#22c55e',light:'#ffffff22',spr:null}));
  const parts =new Array(MAX_PART).fill(0).map(()=>({alive:false,x:0,y:0,vx:0,vy:0,ttl:0,h:120,s:3}));
  let pIdx=0;

  // ---- RASTRO
  const TRAIL_MAX=80, TRAIL_FADE=240;
  const trail=new Array(TRAIL_MAX).fill(0).map(()=>({x:0,y:0,t:0,alive:false}));
  let trailHead=0, trailCount=0;
  function trailClear(){ for(let i=0;i<TRAIL_MAX;i++) trail[i].alive=false; trailHead=0; trailCount=0; }
  function trailAdd(x,y){ const p=trail[trailHead]; p.x=x; p.y=y; p.t=performance.now(); p.alive=true; trailHead=(trailHead+1)%TRAIL_MAX; if(trailCount<TRAIL_MAX) trailCount++; }
  function renderTrail(){
    if(trailCount<2) return; const now=performance.now();
    let idxStart=(trailHead - trailCount + TRAIL_MAX) % TRAIL_MAX, prev=null;
    for(let k=0;k<trailCount;k++){
      const idx=(idxStart+k)%TRAIL_MAX, p=trail[idx]; if(!p.alive) continue;
      const age=now-p.t; if(age>TRAIL_FADE){ p.alive=false; continue; }
      if(prev){ const a=1-(age/TRAIL_FADE); ct.strokeStyle=`rgba(255,255,255,${a.toFixed(3)})`; ct.lineWidth=8+a*6; ct.lineCap='round'; ct.beginPath(); ct.moveTo(prev.x,prev.y); ct.lineTo(p.x,p.y); ct.stroke(); }
      prev=p;
    }
  }

  // ---- UTIL
  const rand=(min,max)=>min+Math.random()*(max-min);
  function segCircle(ax,ay,bx,by,cx,cy,cr){
    const abx=bx-ax, aby=by-ay, ab2=abx*abx+aby*aby||1;
    const t=((cx-ax)*abx+(cy-ay)*aby)/ab2, u=t<0?0:t>1?1:t;
    const px=ax+abx*u, py=ay+aby*u; const dx=px-cx, dy=py-cy; return dx*dx+dy*dy<=cr*cr;
  }

  // ---- DRAW
  function drawFruit(o){
    ct.fillStyle=o.bomb?'rgba(239,68,68,.18)':'rgba(16,185,129,.18)';
    ct.beginPath(); ct.arc(o.x,o.y,o.r*1.08,0,Math.PI*2); ct.fill();
    if(o.spr){ const s=o.r*2; ct.drawImage(o.spr,o.x-o.r,o.y-o.r,s,s); }
    else{ ct.fillStyle=o.color; ct.beginPath(); ct.arc(o.x,o.y,o.r,0,Math.PI*2); ct.fill();
          ct.fillStyle=o.light; ct.beginPath(); ct.arc(o.x-o.r*0.3,o.y-o.r*0.3,o.r*0.38,0,Math.PI*2); ct.fill(); }
    if(o.bomb){ ct.fillStyle='#111'; ct.beginPath(); ct.arc(o.x,o.y,o.r*0.35,0,Math.PI*2); ct.fill(); }
  }
  function drawPart(p){ const a=Math.max(0,Math.min(1,p.ttl/420)); ct.fillStyle=`hsla(${p.h} 80% 60% / ${a})`; ct.beginPath(); ct.arc(p.x,p.y,p.s,0,Math.PI*2); ct.fill(); }

  // ---- SPAWN
  function spawnFruit(){
    let active=0; for(const f of fruits) if(f.alive) active++;
    if(active>=MAX_FRUITS) return;
    const W=cv.width/(DPR*GAME_SCALE), H=cv.height/(DPR*GAME_SCALE);
    for(const o of fruits){
      if(o.alive) continue;
      o.alive=true;
      o.bomb=Math.random()<BOMB_RATE;
      o.x=W*0.16+Math.random()*W*0.68; o.y=H+80;
      o.vx=(Math.random()*2-1)*3.2; o.vy=-rand(18,26); o.ay=0.58; o.r=rand(34,52);
      if(o.bomb){ o.spr=TEX.bomb; o.color='#c62828'; o.light='#ffffff22'; }
      else{ o.spr=pickFruitSprite(); const pal=[['#d62828','#ffffff22'],['#f59e0b','#fff1bb33'],['#22c55e','#eafff033'],['#ef476f','#ffe5ec33']];
            const pick=pal[(Math.random()*pal.length)|0]; o.color=pick[0]; o.light=pick[1]; }
      playSpawn(); // <-- som de spawn restaurado
      break;
    }
  }
  function spawnJuice(x,y,hue){
    for(let i=0;i<10;i++){
      const a=Math.random()*Math.PI*2, s=rand(2.2,3.6);
      const p=parts[pIdx]; pIdx=(pIdx+1)%MAX_PART;
      p.alive=true; p.x=x; p.y=y; p.vx=Math.cos(a)*s; p.vy=Math.sin(a)*s; p.ttl=420; p.h=hue; p.s=rand(2.6,4.0);
    }
  }

  // ---- ESTADO
  let playing=false, score=0, timer=ROUND_TIME, speed=1;
  let rafId=0, lastSpawn=0, acc=0, lastTs=0;
  let pointerId=null, last=null, pmLast=null, lastProc=0;
  let timerTO=null;

  function prepare(){ resize(); score=0; timer=ROUND_TIME; speed=1; scoreEl.textContent=0; timeEl.textContent=timer; overlay.innerHTML=''; clearAll(); startBtn.disabled=false; startBtn.textContent='Iniciar'; }
  function clearAll(){ for(const o of fruits) o.alive=false; for(const p of parts) p.alive=false; trailClear(); cancelAnimationFrame(rafId); lastTs=0; acc=0; lastSpawn=0; pmLast=null; last=null; pointerId=null; ct.clearRect(0,0,cv.width,cv.height); }

  // ---- LOOP
  function loop(ts){ if(!playing) return; if(!lastTs) lastTs=ts; let d=ts-lastTs; if(d>100) d=100; lastTs=ts; acc+=d; let n=0; while(acc>=STEP && n<2){ update(STEP); acc-=STEP; n++; } render(); rafId=requestAnimationFrame(loop); }
  function update(dtMs){ const dt=dtMs/16.6667; const W=cv.width/(DPR*GAME_SCALE), H=cv.height/(DPR*GAME_SCALE);
    lastSpawn+=dtMs; if(lastSpawn>SPAWN_MS/Math.max(1,speed)){ spawnFruit(); lastSpawn=0; }
    for(const o of fruits){ if(!o.alive) continue; o.x+=o.vx*speed*dt; o.y+=o.vy*speed*dt; o.vy+=o.ay*speed*dt; if(o.y>H+140) o.alive=false; }
    for(const p of parts){ if(!p.alive) continue; p.ttl-=dtMs; if(p.ttl<=0){ p.alive=false; continue; } p.vx*=0.985; p.vy+=0.18*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; } }
  function render(){ const W=cv.width/(DPR*GAME_SCALE), H=cv.height/(DPR*GAME_SCALE); ct.clearRect(0,0,W,H); for(const o of fruits) if(o.alive) drawFruit(o); for(const p of parts) if(p.alive) drawPart(p); renderTrail(); }

  // ---- INPUT
  function pos(e){ const r=cv.getBoundingClientRect(); const viewW=cv.width/(DPR*GAME_SCALE), viewH=cv.height/(DPR*GAME_SCALE);
    return { x:(e.clientX-r.left)*(viewW/r.width), y:(e.clientY-r.top)*(viewH/r.height) }; }
  cv.addEventListener('pointerdown', async e=>{ e.preventDefault(); await safeResume(); pointerId=e.pointerId; cv.setPointerCapture(pointerId); last=pos(e); pmLast=last; trailClear(); trailAdd(last.x,last.y); processPMNow(); },{passive:false});
  cv.addEventListener('pointermove', e=>{ if(pointerId!==e.pointerId) return; e.preventDefault(); pmLast=pos(e); const now=performance.now(); if(now-lastProc>8){ processPMNow(); lastProc=now; } },{passive:false});
  cv.addEventListener('pointerup', e=>{ if(pointerId!==e.pointerId) return; e.preventDefault(); pointerId=null; last=null; },{passive:false});
  cv.addEventListener('pointercancel', ()=>{ pointerId=null; last=null; },{passive:true});

  function processPMNow(){
    if(!playing||!pmLast) return;
    if(!last) last=pmLast; trailAdd(pmLast.x, pmLast.y);
    const ax=last.x, ay=last.y, bx=pmLast.x, by=pmLast.y;
    const pad=56, minx=Math.min(ax,bx)-pad, maxx=Math.max(ax,bx)+pad, miny=Math.min(ay,by)-pad, maxy=Math.max(ay,by)+pad;
    for(const o of fruits){
      if(!o.alive) continue;
      if(o.x+o.r<minx || o.x-o.r>maxx || o.y+o.r<miny || o.y-o.r>maxy) continue;
      if(segCircle(ax,ay,bx,by,o.x,o.y,o.r)){
        if(o.bomb){ score=Math.max(0,score-20); scoreEl.textContent=score; playBomb(); }
        else{ o.alive=false; score+=5; scoreEl.textContent=score; spawnJuice(o.x,o.y,110+Math.random()*20); playSlice(); }
        break;
      }
    }
    last=pmLast;
  }

  // ---- HUD
  function flash(text){ overlay.innerHTML=`<div style="background:#0b2a1fcc;padding:14px 18px;border-radius:14px;font-size:18px">${text}</div>`; setTimeout(()=>{ overlay.innerHTML=''; }, 900); }
  function tick(){ if(!playing) return; timeEl.textContent=--timer; if(timer<=0){ end(); return; } if(score && timer%5===0) speed=Math.min(2.0, speed+0.12); timerTO=setTimeout(tick,1000); }

  function start(){
    if(!S.player.nome){ msg.innerHTML='<h2>Faça login primeiro</h2>'; msg.style.display='block'; return; }
    prepare(); startBtn.disabled=true; let n=3;
    msg.innerHTML=`<h2>Fruit Slice</h2><div class="tag" id="count">${n}</div>`; msg.style.display='block';
    const go=()=>{ if(n<=1){ msg.style.display='none'; playing=true; startBtn.textContent='Jogando...'; timeEl.textContent=timer;
        safeResume(); tick(); rafId=requestAnimationFrame(loop); return; }
      n--; document.querySelector('#count').textContent=n; setTimeout(go,1000); };
    setTimeout(go,1000);
  }

  function end(){
    if(!playing) return;
    playing=false; cancelAnimationFrame(rafId); clearTimeout(timerTO);
    const key=`slice_hi_${S.player.nome}__${S.player.empresa}`;
    const hi=Math.max(Number(localStorage.getItem(key)||0), score); localStorage.setItem(key, hi); hiEl.textContent=hi;
    flash(`Fim! Pontos: ${score}`); requestAnimationFrame(()=>showRank('slice', score));
  }

  function loadHi(){ const key=`slice_hi_${S.player.nome}__${S.player.empresa}`; const hi=Number(localStorage.getItem(key)||0); hiEl.textContent=hi||0; }
  function hardStop(){ playing=false; cancelAnimationFrame(rafId); clearTimeout(timerTO); overlay.innerHTML=''; startBtn.textContent='Iniciar'; startBtn.disabled=true; }

  return { prepare, start, loadHi, hardStop };
})();


/* ====================== START ====================== */
startBtn.addEventListener('click', ()=>{
  if(S.mode==='reflex'){ Reflex.start(); }
  else if(S.mode==='memory'){ Memory.start(); }
  else if(S.mode==='slice'){ Slice.start(); }
});

/* ====================== INIT ====================== */
(function init(){
  showLogin(); setMode('none');
  // estética do alvo (Tap Reflex)
  const tEl=$('#target');
  function paint(){
    const t=performance.now()/1000;
    const g1=`radial-gradient(circle at 30% 30%, hsl(${(t*60)%360} 90% 60%) 0 40%, transparent 60%)`;
    const g2=`radial-gradient(circle, #ffffff22 0 60%, #00000022 62% 100%)`;
    tEl.style.background=`${g1}, ${g2}`; requestAnimationFrame(paint);
  }
  paint();
})();
