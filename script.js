/* ===== utils ===== */
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ===== básico ===== */
const scoreEl=$('#score'), timeEl=$('#time'), hiEl=$('#hi');
const startBtn=$('#btn-start'), fullBtn=$('#btn-full');
const tabs=$$('#games-nav .tab');
const games={ memory:$('#game-memory'), tap:$('#game-tap'), slice:$('#game-slice') };
let CURRENT='memory';

/* Fullscreen */
fullBtn.addEventListener('click',()=>{
  const el=document.documentElement;
  if(!document.fullscreenElement){ (el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen).call(el); }
  else{ (document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen).call(document); }
});

/* Tab nav */
tabs.forEach(b=>b.addEventListener('click',()=>{
  tabs.forEach(t=>t.classList.remove('on'));
  b.classList.add('on');
  const g=b.dataset.game; CURRENT=g;
  Object.entries(games).forEach(([k,el])=>el.classList.toggle('on',k===g));
  // parar outros jogos ao trocar
  if(g!=='memory') Memory.stop();
  if(g!=='tap') Tap.stop();
  if(g!=='slice') Slice.stop();
  updateHUDFor(g);
}));

/* Sons simples */
const Sound=(()=>{ let ctx;
  const tone=(f=440,ms=140,t='sine',g=0.08)=>{
    ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(), G=ctx.createGain();
    o.type=t; o.frequency.value=f; G.gain.value=g;
    o.connect(G); G.connect(ctx.destination);
    o.start(); setTimeout(()=>G.gain.exponentialRampToValueAtTime(1e-5,ctx.currentTime+ms/1000),10);
    setTimeout(()=>{o.stop(); o.disconnect(); G.disconnect();}, ms+60);
  };
  return { play:{
    start: ()=>tone(760,220,'triangle',0.07),
    beep:  ()=>tone(520,140,'sine',0.06),
    ok:    ()=>tone(880,150,'triangle',0.07),
    bad:   ()=>tone(220,180,'sawtooth',0.05),
    flip:  ()=>tone(640,100,'square',0.05),
    win:   ()=>{tone(700,120,'triangle',0.08); setTimeout(()=>tone(900,160,'triangle',0.08),110);},
    lose:  ()=>tone(180,260,'sine',0.06),
    slice: ()=>tone(720,80,'square',0.05),
  }};
})();

/* HUD por jogo */
function updateHUDFor(g){
  if(g==='memory'){ timeEl.textContent=Memory.getTime(); scoreEl.textContent=Memory.getScore(); hiEl.textContent=Memory.getHi(); startBtn.disabled=false; startBtn.textContent='Começar'; }
  if(g==='tap'){ timeEl.textContent=Tap.getTime(); scoreEl.textContent=Tap.getScore(); hiEl.textContent=Tap.getHi(); startBtn.disabled=false; startBtn.textContent='Começar'; }
  if(g==='slice'){ timeEl.textContent=Slice.getTime(); scoreEl.textContent=Slice.getScore(); hiEl.textContent=Slice.getHi(); startBtn.disabled=false; startBtn.textContent='Começar'; }
}

/* Botão global Start */
startBtn.addEventListener('click',()=>{
  if(CURRENT==='memory') Memory.start();
  if(CURRENT==='tap') Tap.start();
  if(CURRENT==='slice') Slice.start();
});

/* ===================== MEMÓRIA 3×4 ===================== */
const Memory=(()=>{
  const board=$('#board'), overlay=$('#mem-overlay'), msg=$('#mem-msg');
  const btnR=$('#btn-restart'), btnC=$('#btn-close');
  const MEM_IMAGES=[]; // coloque 6 imagens aqui se quiser
  const EMOJI=['🍎','🍊','🍋','🍇','🍓','🍉'];
  let playing=false, time=30, score=0, tmr=null, first=null, lock=false, matched=0, hi=Number(localStorage.getItem('hi_memory_v1')||0)||0;

  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};

  function fit(){
    const host=$('#game-memory');
    const W=host.clientWidth, H=host.clientHeight;
    const styles=getComputedStyle(board);
    const gap=parseInt(styles.getPropertyValue('--gap'))||16;
    const pad=parseInt(styles.getPropertyValue('--pad'))||20;
    const cols=3, rows=4;
    const cardW_byWidth=(W - pad*2 - gap*(cols-1))/cols;
    const rowH=(H - pad*2 - gap*(rows-1))/rows;
    const cardW_byHeight=rowH*0.75;
    const cardW=Math.floor(Math.max(90, Math.min(cardW_byWidth, cardW_byHeight)));
    board.style.setProperty('--cardW', cardW+'px');
  }

  function makeCard(item,i){
    const el=document.createElement('div'); el.className='card';
    el.dataset.symbol=String(item);
    const hue=(i*57)%360;
    const isImg=/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(item);
    const content=isImg?`<div class="imgbox"><img src="${item}" alt=""></div>`:
      `<div style="font-size:42px;font-weight:900;color:#fff;text-shadow:0 6px 24px #0008">${item}</div>`;
    el.innerHTML=`<div class="inner">
      <div class="face front"></div>
      <div class="face back" style="background:radial-gradient(120% 120% at 30% 20%, hsl(${hue} 95% 62%), #0e1016)">${content}</div>
    </div>`;
    el.addEventListener('click',()=>flip(el),{passive:true});
    return el;
  }

  function setup(){
    board.innerHTML=''; overlay.style.display='none';
    first=null; lock=false; matched=0; score=0; time=30;
    fit();
    const base = MEM_IMAGES.length? MEM_IMAGES : EMOJI;
    shuffle([...base,...base]).map((it,i)=>makeCard(it,i)).forEach(c=>board.appendChild(c));
    refreshHUD();
  }

  function flip(c){
    if(!playing||lock||c.classList.contains('flipped')||c.dataset.done) return;
    c.classList.add('flipped'); Sound.play.flip();
    if(!first){ first=c; return; }
    if(first.dataset.symbol===c.dataset.symbol){
      first.dataset.done='1'; c.dataset.done='1'; matched+=2; score+=100; first=null; Sound.play.ok();
      if(matched===12) over(true);
    }else{
      lock=true; score=Math.max(0,score-20); Sound.play.bad();
      setTimeout(()=>{ first.classList.remove('flipped'); c.classList.remove('flipped'); first=null; lock=false; }, 650);
    }
    refreshHUD();
  }

  function tick(){
    if(!playing) return;
    time--; if(time<=0){ over(false); return; }
    refreshHUD(); tmr=setTimeout(tick,1000);
  }

  function start(){
    setup(); playing=true; startBtn.disabled=true; startBtn.textContent='Jogando...';
    Sound.play.start(); tmr=setTimeout(tick,1000);
  }

  function over(win){
    playing=false; clearTimeout(tmr);
    msg.innerHTML= win? `<h2>Parabéns!</h2><p>Pontuação: <b>${score}</b></p>` : `<h2>Tempo esgotado!</h2><p>Pontuação: <b>${score}</b></p>`;
    overlay.style.display='grid'; (score>0?Sound.play.win():Sound.play.lose());
    if(score>hi){hi=score; localStorage.setItem('hi_memory_v1',hi);}
    refreshHUD(); startBtn.disabled=false; startBtn.textContent='Recomeçar';
  }

  function stop(){ playing=false; clearTimeout(tmr); overlay.style.display='none'; startBtn.disabled=false; startBtn.textContent='Começar'; }
  function refreshHUD(){ timeEl.textContent=time; scoreEl.textContent=score; hiEl.textContent=String(hi); }

  $('#btn-restart').addEventListener('click',()=>{ overlay.style.display='none'; stop(); start(); });
  $('#btn-close').addEventListener('click',()=>overlay.style.display='none');
  addEventListener('resize',()=>CURRENT==='memory'&&fit(),{passive:true});
  addEventListener('orientationchange',()=>setTimeout(()=>CURRENT==='memory'&&fit(),250),{passive:true});

  setup();
  return { start, stop, getTime:()=>time, getScore:()=>score, getHi:()=>hi };
})();

/* ===================== TAP REFLEX ===================== */
const Tap=(()=>{
  const grid=$('#tap-grid'), overlay=$('#tap-overlay'), msg=$('#tap-msg');
  let playing=false, time=30, score=0, hi=Number(localStorage.getItem('hi_tap')||0)||0, tmr=null, roundTO=null;
  const N=9;

  function layout(){
    const host=$('#game-tap'); const W=host.clientWidth, H=host.clientHeight;
    const gap=12, pad=20; const cols=3, rows=3;
    const tileW_byWidth=(W - pad*2 - gap*(cols-1))/cols;
    const rowH=(H - pad*2 - gap*(rows-1))/rows;
    const tile=Math.floor(Math.max(120, Math.min(tileW_byWidth, rowH)));
    grid.style.setProperty('--tile', tile+'px');
  }

  function build(){
    grid.innerHTML='';
    for(let i=0;i<N;i++){
      const d=document.createElement('div'); d.className='tile'; d.dataset.idx=i;
      d.innerHTML=`<div class="lbl">${i+1}</div>`;
      d.addEventListener('pointerdown',()=>tap(i));
      grid.appendChild(d);
    }
    layout();
  }

  let active=-1;
  function nextRound(){
    if(!playing) return;
    if(active>=0){ $(`.tile[data-idx="${active}"]`).classList.remove('on'); }
    active=Math.floor(Math.random()*N);
    $(`.tile[data-idx="${active}"]`).classList.add('on');
    const pace=clamp(800 - score*3, 320, 800);
    roundTO=setTimeout(nextRound, pace);
  }

  function tap(i){
    if(!playing) return;
    const el=$(`.tile[data-idx="${i}"]`);
    if(i===active){ score+=10; Sound.play.ok(); }
    else{ score=Math.max(0,score-5); el.classList.add('bad'); setTimeout(()=>el.classList.remove('bad'),140); Sound.play.bad(); }
    scoreEl.textContent=score;
  }

  function tick(){
    if(!playing) return;
    time--; if(time<=0){ over(); return; }
    timeEl.textContent=time;
    tmr=setTimeout(tick,1000);
  }

  function start(){
    stop(); build(); playing=true; startBtn.disabled=true; startBtn.textContent='Jogando...';
    score=0; time=30; scoreEl.textContent=0; timeEl.textContent=time; Sound.play.start();
    nextRound(); tmr=setTimeout(tick,1000);
  }

  function over(){
    playing=false; clearTimeout(tmr); clearTimeout(roundTO);
    if(score>hi){hi=score; localStorage.setItem('hi_tap',hi);}
    msg.innerHTML=`<h2>Fim!</h2><p>Pontuação: <b>${score}</b></p>`;
    overlay.style.display='grid'; (score>0?Sound.play.win():Sound.play.lose());
    startBtn.disabled=false; startBtn.textContent='Recomeçar'; scoreEl.textContent=score; hiEl.textContent=hi;
  }

  function stop(){ playing=false; clearTimeout(tmr); clearTimeout(roundTO); overlay.style.display='none'; }

  addEventListener('resize',()=>CURRENT==='tap'&&layout(),{passive:true});
  addEventListener('orientationchange',()=>setTimeout(()=>CURRENT==='tap'&&layout(),250),{passive:true});

  build();
  return { start, stop, getTime:()=>time, getScore:()=>score, getHi:()=>hi };
})();

/* ===================== FRUIT SLICE ===================== */
const Slice=(()=>{
  const cv=$('#slice-cv'), ctx=cv.getContext('2d');
  const overlay=$('#slice-overlay'), msg=$('#slice-msg');
  let playing=false, time=30, score=0, hi=Number(localStorage.getItem('hi_slice')||0)||0, tmr=null;
  let fruits=[], trail=[], spawnTO=null;
  const gravity=0.25;

  function resize(){
    const r=cv.getBoundingClientRect();
    cv.width=Math.max(480, Math.floor(r.width*devicePixelRatio));
    cv.height=Math.max(800, Math.floor(r.height*devicePixelRatio));
  }

  function spawn(){
    if(!playing) return;
    const count=1+Math.floor(Math.random()*2);
    for(let i=0;i<count;i++){
      fruits.push({
        x:(Math.random()*0.8+0.1)*cv.width,
        y:cv.height+40,
        vx:(Math.random()-0.5)*6,
        vy:-(8+Math.random()*6),
        r: 28+Math.random()*16,
        color: `hsl(${Math.floor(Math.random()*360)} 90% 60%)`,
        alive:true
      });
    }
    spawnTO=setTimeout(spawn, 700+Math.random()*600);
  }

  function draw(){
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#0b1018'; ctx.fillRect(0,0,cv.width,cv.height);

    for(const f of fruits){
      if(!f.alive) continue;
      ctx.beginPath(); ctx.fillStyle=f.color; ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.fillStyle='rgba(255,255,255,.22)'; ctx.arc(f.x-f.r*0.3,f.y-f.r*0.3,f.r*0.35,0,Math.PI*2); ctx.fill();
    }

    // trail
    ctx.lineWidth=5*devicePixelRatio; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.strokeStyle='rgba(200,230,255,.85)'; ctx.beginPath();
    for(let i=0;i<trail.length;i++){ const p=trail[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }
    ctx.stroke();
    if(trail.length>0) trail.splice(0, Math.max(1, Math.floor(trail.length*0.12)));

    for(const f of fruits){ f.x+=f.vx; f.y+=f.vy; f.vy+=gravity; if(f.y>cv.height+60) f.alive=false; }
    fruits=fruits.filter(f=>f.alive);
    if(playing) requestAnimationFrame(draw);
  }

  function intersectsSegmentCircle(x1,y1,x2,y2,cx,cy,r){
    const dx=x2-x1, dy=y2-y1; const fx=cx-x1, fy=cy-y1;
    const t=Math.max(0,Math.min(1,(fx*dx+fy*dy)/(dx*dx+dy*dy)));
    const px=x1+t*dx, py=y1+t*dy; const d2=(px-cx)*(px-cx)+(py-cy)*(py-cy);
    return d2<=r*r;
  }

  function sliceCheck(){
    if(trail.length<2) return;
    const a=trail[trail.length-2], b=trail[trail.length-1];
    for(const f of fruits){
      if(!f.alive) continue;
      if(intersectsSegmentCircle(a.x,a.y,b.x,b.y,f.x,f.y,f.r)){
        f.alive=false; score+=10; Sound.play.slice();
      }
    }
    scoreEl.textContent=score;
  }

  function pointer(e){
    const rect=cv.getBoundingClientRect();
    const x=(e.clientX-rect.left)*devicePixelRatio;
    const y=(e.clientY-rect.top)*devicePixelRatio;
    trail.push({x,y}); sliceCheck();
  }

  function tick(){
    if(!playing) return;
    time--; if(time<=0){ over(); return; }
    timeEl.textContent=time; tmr=setTimeout(tick,1000);
  }

  function start(){
    stop(); resize(); playing=true; startBtn.disabled=true; startBtn.textContent='Jogando...';
    score=0; time=30; scoreEl.textContent=score; timeEl.textContent=time; Sound.play.start();
    fruits=[]; trail=[]; spawn(); requestAnimationFrame(draw); tmr=setTimeout(tick,1000);
  }

  function over(){
    playing=false; clearTimeout(tmr); clearTimeout(spawnTO);
    if(score>hi){hi=score; localStorage.setItem('hi_slice',hi);}
    msg.innerHTML=`<h2>Fim!</h2><p>Pontuação: <b>${score}</b></p>`;
    overlay.style.display='grid'; (score>0?Sound.play.win():Sound.play.lose());
    startBtn.disabled=false; startBtn.textContent='Recomeçar'; hiEl.textContent=hi;
  }

  function stop(){ playing=false; clearTimeout(tmr); clearTimeout(spawnTO); overlay.style.display='none'; }

  cv.addEventListener('pointerdown',pointer);
  cv.addEventListener('pointermove',pointer);
  addEventListener('resize',()=>CURRENT==='slice'&&resize(),{passive:true});
  addEventListener('orientationchange',()=>setTimeout(()=>CURRENT==='slice'&&resize(),250),{passive:true});
  resize();
  return { start, stop, getTime:()=>time, getScore:()=>score, getHi:()=>hi };
})();

/* ===== boot ===== */
document.addEventListener('DOMContentLoaded', ()=>{
  // inicia na aba memória com HUD pronto
  document.querySelector('.tab[data-game="memory"]').click();
  // se o click acima não rodar (primeira carga), force HUD
  timeEl.textContent='30'; scoreEl.textContent='0'; hiEl.textContent=String(Memory.getHi?.()||0);
});


