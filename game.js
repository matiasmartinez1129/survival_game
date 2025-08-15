
(() => {
  const MOBILE = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
  let runTouch = false;
  const joyState = {active:false, id:null, ox:0, oy:0, x:0, y:0};
  // ---- Canvas & scaling ----
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  let W = 320, H = 180, SCALE = 4;
  function resize() {
    // Prefer landscape scale; ensure at least 2x scale

    const w = window.innerWidth, h = window.innerHeight;
    const target = Math.min(Math.floor(w/320), Math.floor(h/180));
    SCALE = Math.max(2, target || 2);
    W = 320; H = 180;
    cvs.width = W*SCALE;
    cvs.height = H*SCALE;
    ctx.imageSmoothingEnabled = false;
  }
  addEventListener('resize', resize); resize();

  // ---- Load assets (simple, like v3) ----
  
  function loadImage(src){
    return new Promise(res=>{
      const img = new Image();
      let done=false;
      img.onload = ()=>{ if(!done){done=true; res(img);} };
      img.onerror = ()=>{ if(!done){done=true; 
        const p = new Image(); p.onload=()=>res(p); p.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAALElEQVQ4T2NkYGD4z0AJwDiqgQkGEiCwA5LJwqgYkQwGg0E0aA1GQ0kAgBp0gBEuA1VmAAAAAElFTkSuQmCC';
        console.warn('No se pudo cargar imagen:', src, '→ usando placeholder');
      } };
      img.src = src;
    });
  }
  function loadAudio(src, loop=false){ const a=new Audio(src); a.loop=loop; a.volume=0.6; return a; }


  const ASSETS = {
    player: { down:[], left:[], right:[], up:[] },
    tree:null, rock:null, wood:null, campfire:null,
    grass:null, sand:null, rock_tile:null, water:null, shore:[],
    crab:[], deer:[], fish:[],
    wall:null, floor:null, roof:null,
    s_pickup:null, s_craft:null, s_campfire:null, s_water:null, s_step:null, s_hit:null
  };

  Promise.all([
    ...['down','left','right','up'].flatMap(dn => [0,1,2].map(f => loadImage(`assets/player_${dn}_${f}.png`).then(i=>ASSETS.player[dn][f]=i))),
    loadImage('assets/tree.png').then(i=>ASSETS.tree=i),
    loadImage('assets/rock.png').then(i=>ASSETS.rock=i),
    loadImage('assets/wood.png').then(i=>ASSETS.wood=i),
    loadImage('assets/campfire.png').then(i=>ASSETS.campfire=i),
    loadImage('assets/grass.png').then(i=>ASSETS.grass=i),
    loadImage('assets/sand.png').then(i=>ASSETS.sand=i),
    loadImage('assets/rock_tile.png').then(i=>ASSETS.rock_tile=i),
    loadImage('assets/water.png').then(i=>ASSETS.water=i),
    loadImage('assets/shore_0.png').then(i=>ASSETS.shore[0]=i),
    loadImage('assets/shore_1.png').then(i=>ASSETS.shore[1]=i),
    loadImage('assets/shore_2.png').then(i=>ASSETS.shore[2]=i),
    loadImage('assets/crab_0.png').then(i=>ASSETS.crab[0]=i),
    loadImage('assets/crab_1.png').then(i=>ASSETS.crab[1]=i),
    loadImage('assets/deer_0.png').then(i=>ASSETS.deer[0]=i),
    loadImage('assets/deer_1.png').then(i=>ASSETS.deer[1]=i),
    loadImage('assets/fish_0.png').then(i=>ASSETS.fish[0]=i),
    loadImage('assets/fish_1.png').then(i=>ASSETS.fish[1]=i),
    loadImage('assets/wall.png').then(i=>ASSETS.wall=i),
    loadImage('assets/floor.png').then(i=>ASSETS.floor=i),
    loadImage('assets/roof.png').then(i=>ASSETS.roof=i),
  ]).then(() => start());

  ASSETS.s_pickup   = loadAudio('sounds/pickup.wav');
  ASSETS.s_craft    = loadAudio('sounds/craft.wav');
  ASSETS.s_campfire = loadAudio('sounds/campfire_loop.wav', true);
  ASSETS.s_water    = loadAudio('sounds/water_loop.wav', true);
  ASSETS.s_step     = loadAudio('sounds/footstep.wav');
  ASSETS.s_hit      = loadAudio('sounds/hit.wav');

  // ---- World (same style as v3) ----
  const WORLD = { w: 2200, h: 1500 };
  const rng = (seed => () => (seed = (seed*1664525 + 1013904223)|0, (seed>>>0)/4294967296))(9876);
  const clamp = (v,a,b)=>v<a?a:v>b?b:v;
  const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
  const water = { x: 1200, y: 280, w: 800, h: 820, surface: 340 };

  const trees=[], rocks=[], woods=[], campfires=[], crabs=[], deers=[], fishs=[], buildings=[];
  const projectiles = [];
  for (let i=0;i<120;i++){
    const t={x:80+rng()*(WORLD.w-160), y:80+rng()*(WORLD.h-160)};
    if (t.x>water.x-40 && t.x<water.x+water.w+40 && t.y>water.y-40 && t.y<water.y+water.h+40){ i--; continue; }
    trees.push(t);
  }
  for (let i=0;i<40;i++){
    const r={x:100+rng()*(WORLD.w-200), y:100+rng()*(WORLD.h-200), r:6};
    if (r.x>water.x && r.x<water.x+water.w && r.y>water.y && r.y<water.y+water.h){ i--; continue; }
    rocks.push(r);
  }
  for (let i=0;i<50;i++){
    const w={x:100+rng()*(WORLD.w-200), y:100+rng()*(WORLD.h-200), r:6};
    if (w.x>water.x && w.x<water.x+water.w && w.y>water.y && w.y<water.y+water.h){ i--; continue; }
    woods.push(w);
  }
  for (let i=0;i<10;i++){
    const c={ x: water.x - 60 + rng()*(water.w+120), y: water.y - 60 + rng()*(water.h+120), r:6, speed:30, anim:0, t:0 };
    crabs.push(c);
  }
  for (let i=0;i<8;i++){
    deers.push({ x: 200 + rng()*(WORLD.w-400), y: 200 + rng()*(WORLD.h-400), r:7, speed:24, anim:0, t:0, hp:3 });
  }
  for (let i=0;i<14;i++){
    fishs.push({ x: water.x + 20 + rng()*(water.w-40), y: water.y + 20 + rng()*(water.h-40), r:5, speed:22, anim:0, t:0, hp:1 });
  }

  // ---- Player (4 direcciones como v3) ----
  const player = {
    x: 300, y: 300, r: 6,
    speed: 60, sprint: 1.6,
    hunger:100, warmth:100, energy:100, oxygen:100,
    wood:0, stone:0, rawMeat:0, rawFish:0, cookedMeat:0, cookedFish:0,
    spearOwned:false, spearEquipped:false,
    bowOwned:false, bowEquipped:false, arrows:0,
    boatOwned:false, boatEquipped:false,
    raftOwned:false, raftEquipped:false,
    facing: {x:1,y:0}, dirName:'right',
    invuln:0,
    animFrame:0, animTimer:0
  };

  // ---- Camera ----
  const cam = { x:0, y:0 };

  // ---- Input ----
  const keys = new Set();
  onkeydown = e => {
    const k=e.key.toLowerCase(); keys.add(k);
    if (['s','l','c','i','b','escape','m','e'].includes(k)) e.preventDefault();
    if (k==='i') toggleInventory();
    if (k==='b') toggleBuild();
    if (k==='m') toggleMissions();
    if (k==='e') tryToggleDoor();
    if (k==='escape'){ closePanels(); }
  };
  onkeyup   = e => { keys.delete(e.key.toLowerCase()); };

  // --- Mobile controls ---
  const joy = document.getElementById('joy');
  const stick = joy ? joy.querySelector('.stick') : null;
  const btnA = document.getElementById('btnA');
  const btnRun = document.getElementById('btnRun');
  const btnInv = document.getElementById('btnInv');
  const btnBuild = document.getElementById('btnBuild');
  const btnFire = document.getElementById('btnFire');
  const btnDoor = document.getElementById('btnDoor');
  const btnMis = document.getElementById('btnMis');
  const btnFS = document.getElementById('btnFS');

  function joyCenter(){ if (!stick) return; stick.style.left = '50%'; stick.style.top = '50%'; stick.style.marginLeft='-32px'; stick.style.marginTop='-32px'; }
  joyCenter();

  if (joy){
    joy.addEventListener('pointerdown', (e)=>{
      joy.setPointerCapture(e.pointerId);
      const r = joy.getBoundingClientRect();
      joyState.active = true; joyState.id = e.pointerId;
      joyState.ox = e.clientX - r.left; joyState.oy = e.clientY - r.top;
      joyState.x = joyState.ox; joyState.y = joyState.oy;
      if (stick){ stick.style.left = joyState.x+'px'; stick.style.top = joyState.y+'px'; stick.style.marginLeft='-32px'; stick.style.marginTop='-32px'; }
      e.preventDefault();
    }, {passive:false});
    joy.addEventListener('pointermove', (e)=>{
      if (!joyState.active || e.pointerId !== joyState.id) return;
      const r = joy.getBoundingClientRect();
      joyState.x = Math.max(0, Math.min(joy.clientWidth, e.clientX - r.left));
      joyState.y = Math.max(0, Math.min(joy.clientHeight, e.clientY - r.top));
      // clamp radius 56px
      const dx = joyState.x - joy.clientWidth/2;
      const dy = joyState.y - joy.clientHeight/2;
      const dist = Math.hypot(dx,dy); const max = 56;
      let nx = dx, ny = dy;
      if (dist > max){ nx = dx/dist*max; ny = dy/dist*max; }
      if (stick){ stick.style.left = (joy.clientWidth/2 + nx)+'px'; stick.style.top = (joy.clientHeight/2 + ny)+'px'; stick.style.marginLeft='-32px'; stick.style.marginTop='-32px'; }
      e.preventDefault();
    }, {passive:false});
    joy.addEventListener('pointerup', (e)=>{
      if (e.pointerId !== joyState.id) return;
      joyState.active = false; joyState.id = null; joyCenter();
      e.preventDefault();
    }, {passive:false});
    joy.addEventListener('pointercancel', ()=>{ joyState.active=false; joyState.id=null; joyCenter(); }, {passive:true});
  }

  function btnPress(el, down, up){
    if (!el) return;
    el.addEventListener('pointerdown', (e)=>{ down(); e.preventDefault(); }, {passive:false});
    el.addEventListener('pointerup',   (e)=>{ up&&up(); e.preventDefault(); }, {passive:false});
    el.addEventListener('pointerleave',(e)=>{ up&&up(); }, {passive:true});
  }

  btnPress(btnA, ()=>{
    // Do action immediately
    if (build.mode) tryBuild(); else { if (!shootArrow()) tryAttack(); }
  });
  btnPress(btnRun, ()=>{ runTouch=true; }, ()=>{ runTouch=false; });
  btnPress(btnInv, ()=>{ toggleInventory(); });
  btnPress(btnBuild, ()=>{ toggleBuild(); });
  btnPress(btnFire, ()=>{
    // emulate pressing 'C' once
    if (!tick.craftLatch){
      tick.craftLatch=true;
      if (player.wood>=3 && player.stone>=1){
        player.wood-=3; player.stone-=1;
        const px = player.x + player.facing.x*10, py = player.y + player.facing.y*10;
        campfires.push({x:px, y:py, r:50, life:120});
        ASSETS.s_craft.currentTime=0; ASSETS.s_craft.play().catch(()=>{});
        toast('Fogata creada'); stats.fires_built++; updateMissions();
      } else toast('Requiere 3 madera + 1 piedra');
    }
    setTimeout(()=>{ tick.craftLatch=false; }, 200);
  });
  btnPress(btnDoor, ()=>{ tryToggleDoor(); });
  btnPress(btnMis, ()=>{ toggleMissions(); });
  if (btnFS){ btnFS.addEventListener('click', async ()=>{ try{ await document.body.requestFullscreen(); }catch{} }); }


  function closePanels(){
    document.getElementById('inventory').classList.add('hidden');
    document.getElementById('buildPanel').classList.add('hidden');
  }

  // ---- Inventory UI ----
  const invDiv = document.getElementById('inventory');
  const buildDiv = document.getElementById('buildPanel');
  function toggleInventory(){ invDiv.classList.toggle('hidden'); updateInvUI(); }
  function toggleBuild(){ buildDiv.classList.toggle('hidden'); build.mode = !build.mode; }
  function toggleMissions(){ document.getElementById('missions').classList.toggle('hidden'); renderMissions(); }
  function tryToggleDoor(){ for (const b of buildings){ if (b.type==='door' && Math.hypot(player.x-b.x, player.y-b.y)<14){ b.open = !b.open; toast(b.open?'Puerta abierta':'Puerta cerrada'); return; } } }
  function updateInvUI(){
    document.getElementById('woodCount').textContent = player.wood;
    document.getElementById('stoneCount').textContent = player.stone;
    document.getElementById('rawMeat').textContent = player.rawMeat;
    document.getElementById('rawFish').textContent = player.rawFish;
    document.getElementById('cookedMeat').textContent = player.cookedMeat;
    document.getElementById('cookedFish').textContent = player.cookedFish;
    document.getElementById('spearOwned').textContent = player.spearOwned ? (player.spearEquipped?'equipada':'sí') : 'no';
    document.getElementById('raftOwned').textContent = player.raftOwned ? (player.raftEquipped?'equipada':'sí') : 'no';
  }
  document.getElementById('btnEquipSpear').onclick = ()=>{
    if (!player.spearOwned) return toast('Primero crafteá la lanza.');
    player.spearEquipped = !player.spearEquipped; updateInvUI();
  };
  document.getElementById('btnCraftSpear').onclick = ()=>{
    if (player.wood>=2 && player.stone>=1){ player.wood-=2; player.stone-=1; player.spearOwned=true; ASSETS.s_craft.play().catch(()=>{}); toast('Lanza creada'); updateInvUI(); }
    else toast('Requiere 2 madera + 1 piedra');
  };
  document.getElementById('btnEquipRaft').onclick = ()=>{
    if (!player.raftOwned) return toast('Primero crafteá la balsa.');
    player.raftEquipped = !player.raftEquipped; updateInvUI();
  };
  document.getElementById('btnCraftRaft').onclick = ()=>{
    if (player.wood>=6){ player.wood-=6; player.raftOwned=true; ASSETS.s_craft.play().catch(()=>{}); toast('Balsa creada'); updateInvUI(); }
    else toast('Requiere 6 madera');
  };
  document.getElementById('btnCookMeat').onclick = ()=> cook('meat');
  document.getElementById('btnCookFish').onclick = ()=> cook('fish');
  document.getElementById('btnEatMeat').onclick = ()=> eat('meat');
  document.getElementById('btnEatFish').onclick = ()=> eat('fish');
  document.getElementById('btnExitBuild').onclick = ()=>{ if (build.mode) toggleBuild(); };
  // ---- Bow & Arrows ----
  document.getElementById('btnCraftBow').onclick = ()=>{
    if (player.wood>=3){ player.wood-=3; player.bowOwned=true; stats.bow_crafted=true; updateMissions(); ASSETS.s_craft.play().catch(()=>{}); toast('Arco creado'); updateInvUI(); }
    else toast('Requiere 3 madera');
  };
  document.getElementById('btnCraftArrows').onclick = ()=>{
    if (player.wood>=1 && player.stone>=1){ player.wood-=1; player.stone-=1; player.arrows+=5; stats.arrows_made+=5; updateMissions(); ASSETS.s_craft.play().catch(()=>{}); toast('+5 flechas'); updateInvUI(); }
    else toast('Requiere 1 madera + 1 piedra');
  };
  document.getElementById('btnEquipBow').onclick = ()=>{
    if (!player.bowOwned) return toast('Primero crafteá el arco.');
    player.bowEquipped = !player.bowEquipped; if (player.bowEquipped) player.spearEquipped=false; updateInvUI();
  };
  // ---- Boat ----
  document.getElementById('btnCraftBoat').onclick = ()=>{
    if (player.wood>=10 && player.stone>=2){ player.wood-=10; player.stone-=2; player.boatOwned=true; stats.boat_crafted=true; updateMissions(); ASSETS.s_craft.play().catch(()=>{}); toast('Barco creado'); updateInvUI(); }
    else toast('Requiere 10 madera + 2 piedra');
  };
  document.getElementById('btnEquipBoat').onclick = ()=>{
    if (!player.boatOwned) return toast('Primero crafteá el barco.');
    player.boatEquipped = !player.boatEquipped; if (player.boatEquipped) player.raftEquipped=false; updateInvUI();
  };


  // Export/Import
  document.getElementById('btnExport').onclick = ()=>{
    const data = collectSaveData();
    const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'survival2d_save.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById('fileImport').addEventListener('change', (e)=>{
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try{ applySaveData(JSON.parse(rd.result)); toast('Guardado importado.'); updateInvUI(); } catch(err){ toast('Archivo inválido'); } };
    rd.readAsText(f);
  });

  // ---- Build system ----
  const build = { mode:false, current:'wall', rot:0, grid:16 };
  for (const btn of buildDiv.querySelectorAll('[data-build]')){ btn.onclick = ()=> { build.current = btn.getAttribute('data-build'); }; }
  addEventListener('wheel', e => { if (build.mode){ build.rot += Math.sign(e.deltaY); } });

  // ---- Save/Load ----
  function collectSaveData(){
    return { player, campfires, rocks, woods, crabs, deers, fishs, buildings, timeOfDay, day, stats, missionsDef };
  }
  function applySaveData(data){
    Object.assign(player, data.player||{});
    campfires.length=0; data.campfires?.forEach(o=>campfires.push(o));
    rocks.length=0; data.rocks?.forEach(o=>rocks.push(o));
    woods.length=0; data.woods?.forEach(o=>woods.push(o));
    crabs.length=0; data.crabs?.forEach(o=>crabs.push(o));
    deers.length=0; data.deers?.forEach(o=>deers.push(o));
    fishs.length=0; data.fishs?.forEach(o=>fishs.push(o));
    buildings.length=0; data.buildings?.forEach(o=>buildings.push(o));
    timeOfDay = data.timeOfDay||12; day = data.day||1; if (data.stats) Object.assign(stats, data.stats); if (data.missionsDef){ for (let i=0;i<missionsDef.length;i++){ missionsDef[i].done = !!(data.missionsDef[i]?.done); } } updateMissions();
  }
  function saveLS(){ localStorage.setItem('surv2d_px_v3x', JSON.stringify(collectSaveData())); toast('Guardado.'); }
  function loadLS(){ const s=localStorage.getItem('surv2d_px_v3x'); if(!s) return toast('No hay guardado.'); applySaveData(JSON.parse(s)); toast('Cargado.'); updateInvUI(); }

  // ---- HUD & toasts ----
  const invHUD = document.getElementById('invHUD');
  let toastTimer = 0;

  const missionsDef = [
    {id:'campfire', title:'Crea una fogata', done:false},
    {id:'spear', title:'Craftea una lanza', done:false},
    {id:'hunt', title:'Caza un ciervo', done:false},
    {id:'fish', title:'Pesca un pez', done:false},
    {id:'cook', title:'Cocina cualquier comida', done:false},
    {id:'shelter', title:'Coloca 4 paredes y 1 techo', done:false},
    {id:'door', title:'Construye una puerta', done:false},
    {id:'bow', title:'Craftea un arco y 5 flechas', done:false},
    {id:'boat', title:'Craftea una embarcación', done:false},
    {id:'day3', title:'Sobrevive hasta el Día 3', done:false},
  ];
  const stats = { fires_built:0, walls_built:0, roofs_built:0, doors_built:0, deer_hunted:0, fish_caught:0, cooked:0, bow_crafted:false, arrows_made:0, boat_crafted:false };
  function renderMissions(){
    const ul = document.getElementById('missionsList'); if (!ul) return;
    ul.innerHTML = '';
    for (const m of missionsDef){
      const li = document.createElement('li');
      li.textContent = (m.done?'✅ ':'⬜ ') + m.title;
      ul.appendChild(li);
    }
  }
  function updateMissions(){
    missionsDef.find(m=>m.id==='campfire').done = stats.fires_built>0;
    missionsDef.find(m=>m.id==='spear').done = player.spearOwned;
    missionsDef.find(m=>m.id==='hunt').done = stats.deer_hunted>0;
    missionsDef.find(m=>m.id==='fish').done = stats.fish_caught>0;
    missionsDef.find(m=>m.id==='cook').done = stats.cooked>0;
    missionsDef.find(m=>m.id==='shelter').done = stats.walls_built>=4 && stats.roofs_built>=1;
    missionsDef.find(m=>m.id==='door').done = stats.doors_built>0;
    missionsDef.find(m=>m.id==='bow').done = stats.bow_crafted && stats.arrows_made>=5;
    missionsDef.find(m=>m.id==='boat').done = stats.boat_crafted;
    missionsDef.find(m=>m.id==='day3').done = day>=3;
    renderMissions();
  }

  function toast(msg){
    let t = document.getElementById('toast');
    if (!t){ t = document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
    t.textContent = msg; toastTimer = 2.2;
  }

  // ---- Time ----
  let timeOfDay = 12, day=1; const DAY_SPEED=180; let last=performance.now(); let shoreAnim=0;

  function start(){
    const unlock = ()=>{ try{ ASSETS.s_water.play().then(()=>ASSETS.s_water.pause()); ASSETS.s_campfire.play().then(()=>ASSETS.s_campfire.pause()); }catch{}; window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
 updateMissions();
    requestAnimationFrame(tick);
    ASSETS.s_water.volume = 0.0; ASSETS.s_water.play().catch(()=>{});
    ASSETS.s_campfire.volume = 0.0; ASSETS.s_campfire.play().catch(()=>{});
  }

  function nearCampfire(){
    for (const f of campfires){ if (Math.hypot(player.x-f.x, player.y-f.y) < f.r) return true; }
    return false;
  }
  function cook(which){
    if (!nearCampfire()) return toast('Debes estar cerca de una fogata.');
    if (which==='meat' && player.rawMeat>=1){ player.rawMeat--; player.cookedMeat++; stats.cooked++; ASSETS.s_craft.play().catch(()=>{}); toast('Carne cocinada'); updateInvUI(); updateMissions(); }
    else if (which==='fish' && player.rawFish>=1){ player.rawFish--; player.cookedFish++; stats.cooked++; ASSETS.s_craft.play().catch(()=>{}); toast('Pescado cocinado'); updateInvUI(); updateMissions(); }
    else toast('Faltan ingredientes');
  }
  function eat(which){
    if (which==='meat' && player.cookedMeat>=1){ player.cookedMeat--; player.hunger=Math.min(100, player.hunger+35); toast('+35 hambre'); updateInvUI(); }
    else if (which==='fish' && player.cookedFish>=1){ player.cookedFish--; player.hunger=Math.min(100, player.hunger+25); player.energy=Math.min(100, player.energy+5); toast('+25 hambre +5 energía'); updateInvUI(); }
    else toast('No tenés ese alimento.');
  }

  
  function shootArrow(){
    if (!player.bowEquipped || player.arrows<=0) return false;
    // normalize facing to 8-dir using player.facing
    const dir = player.facing; const len = Math.hypot(dir.x, dir.y)||1; const nx = dir.x/len, ny = dir.y/len;
    projectiles.push({ x: player.x + nx*8, y: player.y + ny*8, vx: nx*160, vy: ny*160, life: 1.5 });
    player.arrows--; ASSETS.s_hit.currentTime=0; ASSETS.s_hit.play().catch(()=>{});
    updateInvUI(); return true;
  }

function tryAttack(){
    if (!player.spearEquipped) return;
    const reach = 18;
    for (let i=deers.length-1;i>=0;i--){
      const d = deers[i];
      if (Math.hypot(player.x + player.facing.x*reach - d.x, player.y + player.facing.y*reach - d.y) < player.r + d.r){
        d.hp--; ASSETS.s_hit.currentTime=0; ASSETS.s_hit.play().catch(()=>{});
        if (d.hp<=0){ deers.splice(i,1); player.rawMeat++; stats.deer_hunted++; toast('Carne cruda +1'); updateInvUI(); updateMissions(); }
        return;
      }
    }
    for (let i=fishs.length-1;i>=0;i--){
      const f = fishs[i];
      if (Math.hypot(player.x + player.facing.x*reach - f.x, player.y + player.facing.y*reach - f.y) < player.r + f.r){
        fishs.splice(i,1); player.rawFish++; ASSETS.s_hit.play().catch(()=>{}); toast('Pescado crudo +1'); updateInvUI(); return;
      }
    }
  }

  function tryBuild(){
    const gx = Math.round((player.x + player.facing.x*14)/build.grid)*build.grid;
    const gy = Math.round((player.y + player.facing.y*14)/build.grid)*build.grid;
    const type = build.current;
    if (type==='wall'){ if (player.wood<2) return toast('Pared: requiere 2 madera'); player.wood-=2; }
    if (type==='floor'){ if (player.wood<1) return toast('Piso: requiere 1 madera'); player.wood-=1; }
    if (type==='roof'){ if (player.wood<1||player.stone<1) return toast('Techo: 1 madera + 1 piedra'); player.wood-=1; player.stone-=1; }
    if (type==='door'){ if (player.wood<2) return toast('Puerta: requiere 2 madera'); player.wood-=2; }
    if (type==='trap'){ if (player.wood<2||player.stone<1) return toast('Trampa: 2 madera + 1 piedra'); player.wood-=2; player.stone-=1; }
    const b = { type, x:gx, y:gy, rot:build.rot%4 };
    if (type==='door') b.open=false; if (type==='trap') b.armed=true;
    buildings.push(b);
    if (type==='wall') stats.walls_built++;
    if (type==='roof') stats.roofs_built++;
    if (type==='door') stats.doors_built++;
    updateMissions();
    ASSETS.s_craft.currentTime=0; ASSETS.s_craft.play().catch(()=>{});
    updateInvUI();
  }

  function circleRectCollide(cx, cy, r, rx, ry, rw, rh){
    const nx = Math.max(rx, Math.min(cx, rx+rw));
    const ny = Math.max(ry, Math.min(cy, ry+rh));
    return (cx-nx)**2 + (cy-ny)**2 <= r*r;
  }

  // mouse input for attack/build
  let mouseDown=false;
  addEventListener('mousedown', e=>{ mouseDown=true; e.preventDefault(); });
  addEventListener('mouseup', e=>{ mouseDown=false; });

  let stepTimer=0;
  function tick(){
    const now = performance.now(); let dt=(now-last)/1000; last=now; if (dt>0.05) dt=0.05;

    // Close panels on movement
    if ((keys.has('w')||keys.has('a')||keys.has('s')||keys.has('d')) && !build.mode && !invDiv.classList.contains('hidden')) invDiv.classList.add('hidden');

    // Input vector (4 dirs like v3)
    
let ix=0, iy=0;
if (keys.has('w')) { iy-=1; player.dirName='up'; }
if (keys.has('s')) { iy+=1; player.dirName='down'; }
if (keys.has('a')) { ix-=1; player.dirName='left'; }
if (keys.has('d')) { ix+=1; player.dirName='right'; }
// Joystick vector
if (joyState.active){
  const dx = joyState.x - (document.getElementById('joy')?.clientWidth||0)/2;
  const dy = joyState.y - (document.getElementById('joy')?.clientHeight||0)/2;
  ix = dx/56; iy = dy/56;
  // Deadzone
  const mag = Math.hypot(ix,iy);
  if (mag < 0.18){ ix=0; iy=0; } else { ix/=mag; iy/=mag; }
  // Update facing dirName roughly by angle
  if (Math.abs(ix) > Math.abs(iy)) player.dirName = (ix>0?'right':'left');
  else if (Math.abs(iy) > 0.05) player.dirName = (iy>0?'down':'up');
}
const l = Math.hypot(ix,iy) || 1; ix/=l; iy/=l;

    if (ix||iy) player.facing={x:ix,y:iy};

    const inWater = circleRectCollide(player.x, player.y, player.r, water.x, water.y, water.w, water.h);
    const baseMod = Math.max(0.4, Math.min(1.1, (player.hunger/100)*0.5 + (player.energy/100)*0.5));
    const waterMult = inWater ? (player.boatEquipped ? 2.2 : (player.raftEquipped ? 1.6 : 0.6)) : 1.0;
    const speed = player.speed * baseMod * ((keys.has('shift')||runTouch)?player.sprint:1) * waterMult;
    player.x += ix*speed*dt; player.y += iy*speed*dt;

    // footsteps
    stepTimer -= dt;
    if ((ix||iy) && !inWater && stepTimer<=0){ ASSETS.s_step.currentTime=0; ASSETS.s_step.play().catch(()=>{}); stepTimer = 0.35/baseMod; }

    // bounds
    player.x = clamp(player.x, 8, WORLD.w-8);
    player.y = clamp(player.y, 8, WORLD.h-8);

    // oxygen (robust)
    if (inWater) {
      const under = player.y > water.surface;
      if (player.raftEquipped || player.boatEquipped) {
        player.oxygen = Math.min(100, player.oxygen + 20*dt);
      } else {
        if (under) {
          player.oxygen = Math.max(0, player.oxygen - 8*dt);
          if (player.oxygen === 0) player.energy = Math.max(0, player.energy - 10*dt);
        } else {
          player.oxygen = Math.min(100, player.oxygen + 25*dt);
        }
      }
    } else {
      player.oxygen = Math.min(100, player.oxygen + 25*dt);
    }

    // meters
    player.hunger = Math.max(0, player.hunger - 0.6*dt);
    player.energy = Math.max(0, player.energy - 0.5*dt);
    if (player.invuln>0) player.invuln -= dt;

    // pickups
    for (let i=rocks.length-1;i>=0;i--){
      const r = rocks[i];
      if (Math.hypot(player.x-r.x, player.y-r.y) < player.r + r.r){
        player.stone++; rocks.splice(i,1);
        ASSETS.s_pickup.currentTime=0; ASSETS.s_pickup.play().catch(()=>{});
        toast('Piedra +1');
      }
    }
    for (let i=woods.length-1;i>=0;i--){
      const w = woods[i];
      if (Math.hypot(player.x-w.x, player.y-w.y) < player.r + w.r){
        player.wood++; woods.splice(i,1);
        ASSETS.s_pickup.currentTime=0; ASSETS.s_pickup.play().catch(()=>{});
        toast('Madera +1');
      }
    }

    // click action
    if (mouseDown){
      if (build.mode) tryBuild();
      else {
        if (!shootArrow()) tryAttack();
      }
      mouseDown=false;
    }

    // craft fire key
    if (keys.has('c')){
      if (!tick.craftLatch){
        tick.craftLatch=true;
        if (player.wood>=3 && player.stone>=1){
          player.wood-=3; player.stone-=1;
          const px = player.x + player.facing.x*10, py = player.y + player.facing.y*10;
          campfires.push({x:px, y:py, r:50, life:120}); stats.fires_built++; updateMissions();
          ASSETS.s_craft.currentTime=0; ASSETS.s_craft.play().catch(()=>{});
          toast('Fogata creada');
        } else toast('Requiere 3 madera + 1 piedra');
      }
    } else tick.craftLatch=false;

    // campfires
    let nearHeat=false;
    for (let i=campfires.length-1;i>=0;i--){
      const f = campfires[i]; f.life -= dt;
      if (f.life<=0){ campfires.splice(i,1); continue; }
      if (Math.hypot(player.x-f.x, player.y-f.y) < f.r) nearHeat = true;
    }
    if (nearHeat) player.warmth = Math.min(100, player.warmth + 10*dt);
    else {
      let nearShelter=false; for (const b of buildings){ if (Math.hypot(player.x-b.x, player.y-b.y)<40){ nearShelter=true; break; } }
      player.warmth = Math.max(0, player.warmth - (nearShelter?0.6:1.2)*dt);
    }

    
    // projectiles
    for (let i=projectiles.length-1;i>=0;i--){
      const p = projectiles[i];
      p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
      let hit=false;
      // check deer
      for (let j=deers.length-1;j>=0;j--){
        const d = deers[j];
        if (Math.hypot(p.x-d.x, p.y-d.y) < d.r){ d.hp -= 2; hit=true; if (d.hp<=0){ deers.splice(j,1); player.rawMeat++; stats.deer_hunted++; toast('Carne cruda +1'); updateInvUI(); updateMissions(); } break; }
      }
      if (!hit){
        // crabs
        for (let j=crabs.length-1;j>=0;j--){
          const c = crabs[j];
          if (Math.hypot(p.x-c.x, p.y-c.y) < c.r){ crabs.splice(j,1); hit=true; break; }
        }
      }
      if (!hit){
        // fish
        for (let j=fishs.length-1;j>=0;j--){
          const f = fishs[j];
          if (Math.hypot(p.x-f.x, p.y-f.y) < f.r){ fishs.splice(j,1); player.rawFish++; stats.fish_caught++; toast('Pescado crudo +1'); updateInvUI(); updateMissions(); hit=true; break; }
        }
      }
      if (p.life<=0 || hit) { projectiles.splice(i,1); }
    }

    
    // traps
    for (let i=buildings.length-1;i>=0;i--){
      const b = buildings[i];
      if (b.type!=='trap' || !b.armed) continue;
      let triggered=false;
      for (let j=deers.length-1;j>=0;j--){
        const d = deers[j];
        if (Math.hypot(b.x-d.x, b.y-d.y) < 10){ deers.splice(j,1); player.rawMeat++; toast('Trampa: carne +1'); updateInvUI(); triggered=true; break; }
      }
      if (!triggered){
        for (let j=crabs.length-1;j>=0;j--){
          const c = crabs[j];
          if (Math.hypot(b.x-c.x, b.y-c.y) < 10){ crabs.splice(j,1); player.stone++; toast('Trampa: piedra +1'); updateInvUI(); triggered=true; break; }
        }
      }
      if (triggered){ b.armed=false; }
    }

    // enemies/animals
    for (const c of crabs){
      c.t+=dt; if (c.t>0.2){ c.anim=(c.anim+1)%2; c.t=0; }
      const d = Math.hypot(player.x-c.x, player.y-c.y);
      const chase = d<120;
      if (chase){ c.x += (player.x-c.x)/(d||1)*c.speed*1.2*dt; c.y += (player.y-c.y)/(d||1)*c.speed*1.2*dt; }
      else { c.x += Math.sin(now*0.001+c.x)*0.2; c.y += Math.cos(now*0.001+c.y)*0.2; }
      if (d < player.r + c.r && player.invuln<=0){ player.energy=Math.max(0, player.energy-10); player.invuln=0.8; ASSETS.s_hit.play().catch(()=>{}); }
    }
    for (const d of deers){ d.t+=dt; if (d.t>0.25){ d.anim=(d.anim+1)%2; d.t=0; } d.x += Math.sin(now*0.0007 + d.x)*0.5; d.y += Math.cos(now*0.0006 + d.y)*0.5; }
    for (const f of fishs){ f.t+=dt; if (f.t>0.25){ f.anim=(f.anim+1)%2; f.t=0; }
      f.x = clamp(f.x + Math.sin(now*0.001+f.y)*0.6, water.x+10, water.x+water.w-10);
      f.y = clamp(f.y + Math.cos(now*0.001+f.x)*0.6, water.y+10, water.y+water.h-10);
    }

    // collisions with walls
    for (const b of buildings){
      if (b.type !== 'wall' && !(b.type==='door' && !b.open)) continue;
      const dx = player.x - b.x, dy = player.y - b.y;
      const d = Math.hypot(dx,dy); const min = player.r + 7;
      if (d < min){
        const nx = dx/(d||1), ny = dy/(d||1);
        const push = min - d;
        player.x += nx*push; player.y += ny*push;
      }
    }

    // ambients
    ASSETS.s_water.volume += ((inWater?0.6:0.0) - ASSETS.s_water.volume)*0.02;
    ASSETS.s_campfire.volume += ((nearHeat?0.5:0.0) - ASSETS.s_campfire.volume)*0.02;

    // save/load
    if (keys.has('s')){ if (!tick.saveLatch){ tick.saveLatch=true; saveLS(); } } else tick.saveLatch=false;
    if (keys.has('l')){ if (!tick.loadLatch){ tick.loadLatch=true; loadLS(); } } else tick.loadLatch=false;

    // anim
    player.animTimer += dt;
    const moving = (ix||iy);
    if (!moving) player.animFrame = 0;
    else if (player.animTimer>0.16){ player.animFrame = (player.animFrame+1)%3; player.animTimer=0; }

    // time
    timeOfDay += (dt * 24 / DAY_SPEED);
    if (timeOfDay>=24){ timeOfDay-=24; day++; }
    shoreAnim += dt*4; updateMissions();

    // camera
    cam.x = clamp(player.x - W/2, 0, WORLD.w - W);
    cam.y = clamp(player.y - H/2, 0, WORLD.h - H);

    // HUD
    document.querySelector('.hunger > span').style.width = player.hunger+'%';
    document.querySelector('.warmth > span').style.width = player.warmth+'%';
    document.querySelector('.energy > span').style.width = player.energy+'%';
    document.querySelector('.oxygen > span').style.width = player.oxygen+'%';
    const hh = Math.floor(timeOfDay), mm = String(Math.floor((timeOfDay-hh)*60)).padStart(2,'0');
    invHUD.textContent = `Madera: ${player.wood} · Piedra: ${player.stone} · Carne: ${player.rawMeat+player.cookedMeat} · Pescado: ${player.rawFish+player.cookedFish} · Día: ${day} · Hora: ${String(hh).padStart(2,'0')}:${mm}`;

    if (toastTimer>0){ toastTimer -= dt; if (toastTimer<=0){ const t=document.getElementById('toast'); if (t) t.remove(); } }

    render(inWater);
    drawMinimap();
    requestAnimationFrame(tick);
  }

  function tile(img, x,y,w,h){
    for (let ty=y; ty<y+h; ty+=img.height){
      for (let tx=x; tx<x+w; tx+=img.width){
        ctx.drawImage(img, tx*SCALE, ty*SCALE, img.width*SCALE, img.height*SCALE);
      }
    }
  }

  function drawBuildGhost(){
    if (!build.mode) return;
    const gx = Math.round((player.x + player.facing.x*14)/build.grid)*build.grid;
    const gy = Math.round((player.y + player.facing.y*14)/build.grid)*build.grid;
    const img = ASSETS[build.current];
    if (!img) return;
    ctx.globalAlpha = 0.6;
    ctx.drawImage(img, (Math.floor(gx - cam.x)-8)*SCALE, (Math.floor(gy - cam.y)-8)*SCALE, 16*SCALE, 16*SCALE);
    ctx.globalAlpha = 1.0;
  }

  function render(inWater){
    ctx.fillStyle = '#0b1320'; ctx.fillRect(0,0,cvs.width,cvs.height);

    tile(ASSETS.grass, - (cam.x % 16), - (cam.y % 16), W+16, H+16);

    const beach = { x: water.x-16, y: water.y-16, w: water.w+32, h: water.h+32 };
    ctx.save(); ctx.beginPath(); ctx.rect((beach.x-cam.x)*SCALE, (beach.y-cam.y)*SCALE, beach.w*SCALE, beach.h*SCALE); ctx.clip();
    tile(ASSETS.sand, (beach.x-cam.x)%16 - 16, (beach.y-cam.y)%16 - 16, beach.w+32, beach.h+32); ctx.restore();

    const rockAreas = [{x:80,y:80,w:240,h:160},{x:WORLD.w-360,y:200,w:280,h:180}];
    for (const a of rockAreas){ ctx.save(); ctx.beginPath(); ctx.rect((a.x-cam.x)*SCALE, (a.y-cam.y)*SCALE, a.w*SCALE, a.h*SCALE); ctx.clip();
      tile(ASSETS.rock_tile, (a.x-cam.x)%16 - 16, (a.y-cam.y)%16 - 16, a.w+32, a.h+32); ctx.restore();
    }

    ctx.save(); ctx.beginPath(); ctx.rect((water.x-cam.x)*SCALE, (water.y-cam.y)*SCALE, water.w*SCALE, water.h*SCALE); ctx.clip();
    tile(ASSETS.water, (water.x-cam.x + Math.sin(shoreAnim*0.2)*2)%16 - 16, (water.y-cam.y)%16 - 16, water.w+32, water.h+32); ctx.restore();

    const shoreFrame = ASSETS.shore[Math.floor(shoreAnim)%3];
    for (let x=0; x<water.w; x+=16){
      ctx.drawImage(shoreFrame, (water.x + x - cam.x)*SCALE, (water.y - 8 - cam.y)*SCALE, 16*SCALE, 16*SCALE);
      ctx.drawImage(shoreFrame, (water.x + x - cam.x)*SCALE, (water.y + water.h - 8 - cam.y)*SCALE, 16*SCALE, 16*SCALE);
    }
    for (let y=0; y<water.h; y+=16){
      ctx.drawImage(shoreFrame, (water.x - 8 - cam.x)*SCALE, (water.y + y - cam.y)*SCALE, 16*SCALE, 16*SCALE);
      ctx.drawImage(shoreFrame, (water.x + water.w - 8 - cam.x)*SCALE, (water.y + y - cam.y)*SCALE, 16*SCALE, 16*SCALE);
    }

    for (const t of trees){
      const x = Math.floor(t.x - cam.x), y = Math.floor(t.y - cam.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect((x-8)*SCALE, (y+6)*SCALE, 16*SCALE, 4*SCALE);
      ctx.drawImage(ASSETS.tree, (x-16)*SCALE, (y-24)*SCALE, ASSETS.tree.width*SCALE, ASSETS.tree.height*SCALE);
    }

    for (const r of rocks){
      const x = Math.floor(r.x - cam.x), y = Math.floor(r.y - cam.y);
      ctx.drawImage(ASSETS.rock, (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE);
    }
    for (const w of woods){
      const x = Math.floor(w.x - cam.x), y = Math.floor(w.y - cam.y);
      ctx.drawImage(ASSETS.wood, (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE);
    }

    for (const f of campfires){
      const x = Math.floor(f.x - cam.x), y = Math.floor(f.y - cam.y);
      ctx.fillStyle = 'rgba(255,150,40,0.15)';
      ctx.beginPath(); ctx.arc(x*SCALE, y*SCALE, 30*SCALE, 0, Math.PI*2); ctx.fill();
      ctx.drawImage(ASSETS.campfire, (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE);
    }

    for (const b of buildings){
      const x = Math.floor(b.x - cam.x), y = Math.floor(b.y - cam.y);
      const img = ASSETS[b.type]; if (!img) continue;
      if (b.type==='door' && b.open){ ctx.globalAlpha=0.5; }
      ctx.drawImage(img, (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE);
      ctx.globalAlpha=1.0;
    }

    for (const c of crabs){
      const x = Math.floor(c.x - cam.x), y = Math.floor(c.y - cam.y);
      ctx.drawImage(ASSETS.crab[c.anim], (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE);
    }
    for (const d of deers){
      const x = Math.floor(d.x - cam.x), y = Math.floor(d.y - cam.y);
      ctx.drawImage(ASSETS.deer[d.anim], (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE);
    }
    for (const f of fishs){
      const x = Math.floor(f.x - cam.x), y = Math.floor(f.y - cam.y);
      ctx.drawImage(ASSETS.fish[f.anim], (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE);
    }

    const px = Math.floor(player.x - cam.x), py = Math.floor(player.y - cam.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect((px-8)*SCALE, (py+6)*SCALE, 16*SCALE, 4*SCALE);
    const frame = ASSETS.player[player.dirName][player.animFrame||0] || ASSETS.player.right[0];
    if (player.invuln>0 && Math.floor(performance.now()/60)%2===0){} else ctx.drawImage(frame, (px-8)*SCALE, (py-12)*SCALE, 16*SCALE, 16*SCALE);

    drawBuildGhost();

    // Night lighting
    let nightAlpha=0;
    if (timeOfDay>=19) nightAlpha=Math.min(0.75, (timeOfDay-19)/3);
    else if (timeOfDay<=5) nightAlpha=Math.min(0.75, (5-timeOfDay)/3);
    if (nightAlpha>0){
      ctx.save(); ctx.globalAlpha=nightAlpha; ctx.fillStyle='rgba(0,0,20,1)'; ctx.fillRect(0,0,cvs.width,cvs.height);
      ctx.globalCompositeOperation='destination-out';
      radialHole(px*SCALE, py*SCALE, 55*SCALE);
      for (const f of campfires){
        const x = Math.floor(f.x - cam.x), y = Math.floor(f.y - cam.y);
        radialHole(x*SCALE, y*SCALE, 110*SCALE);
      }
      ctx.restore(); ctx.globalCompositeOperation='source-over';
    }
  }

  function radialHole(cx,cy,r){
    const grd = ctx.createRadialGradient(cx,cy, r*0.4, cx,cy, r);
    grd.addColorStop(0,'rgba(0,0,0,1)'); grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  }

  function drawMinimap(){
    const mm = document.getElementById('minimap');
    const mctx = mm.getContext('2d');
    const mw = mm.width, mh = mm.height;
    mctx.fillStyle = '#0b1320'; mctx.fillRect(0,0,mw,mh);
    mctx.fillStyle='#1e5fa7';
    mctx.fillRect(water.x/WORLD.w*mw, water.y/WORLD.h*mh, water.w/WORLD.w*mw, water.h/WORLD.h*mh);
    mctx.fillStyle='#2c8a2e';
    for (let i=0;i<trees.length;i+=4){
      const t=trees[i]; const x=t.x/WORLD.w*mw, y=t.y/WORLD.h*mh; mctx.fillRect(x-1,y-1,2,2);
    }
    mctx.fillStyle='#ffa726';
    for (const f of campfires){ const x=f.x/WORLD.w*mw, y=f.y/WORLD.h*mh; mctx.fillRect(x-1,y-1,2,2); }
    mctx.fillStyle='#e0e0e0';
    mctx.fillRect(player.x/WORLD.w*mw-2, player.y/WORLD.h*mh-2, 4,4);
    mctx.strokeStyle='#9eb1ff'; mctx.lineWidth=1;
    mctx.strokeRect(cam.x/WORLD.w*mw, cam.y/WORLD.h*mh, W/WORLD.w*mw, H/WORLD.h*mh);
  }

  // Key shortcuts for save/load
  addEventListener('keydown', (e)=>{
    const k=e.key.toLowerCase();
    if (k==='s') saveLS();
    if (k==='l') loadLS();
  });
})();
