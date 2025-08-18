(() => {
  // ---- Canvas & scaling ----
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  let W = 320, H = 180, SCALE = 4;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const target = Math.min(Math.floor(w/320), Math.floor(h/180));
    SCALE = Math.max(2, target || 2);
    W = 320; H = 180;
    cvs.width = W*SCALE;
    cvs.height = H*SCALE;
    ctx.imageSmoothingEnabled = false;

    setupLightBuffer(); // re-crear buffer con W/H base
  }
  addEventListener('resize', resize);

  // --- Buffer de luz a resolución base (pixel art) ---
  let lightCvs = document.createElement('canvas');
  let lightCtx = lightCvs.getContext('2d');
  function setupLightBuffer(){
    lightCvs.width = W;
    lightCvs.height = H;
    lightCtx.imageSmoothingEnabled = false;
  }

  resize(); // inicial

  // ---- Utils ----
  function loadImage(src){
    return new Promise(res=>{
      const i=new Image();
      i.onload=()=>res(i);
      i.onerror=()=>{ const p=new Image(); p.onload=()=>res(p);
        // fallback 14x14 si falta el asset
        p.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAALElEQVQ4T2NkYGD4z0AJwDiqgQkGEiCwA5LJwqgYkQwGg0E0aA1GQ0kAgBp0gBEuA1VmAAAAAElFTkSuQmCC';
      };
      i.src=src;
    });
  }
  function loadAudio(src, loop=false){ const a = new Audio(src); a.loop=loop; a.volume=0.6; return a; }
  const clamp = (v,a,b)=>v<a?a:v>b?b:v;
  const rng = (seed => () => (seed = (seed*1664525 + 1013904223)|0, (seed>>>0)/4294967296))(9876);
  function randInt(a,b){ return a + (Math.random() * (b-a) | 0); }

  // ---- Balance / Dificultad ----
  const TUNING = {
    enemySpawnEvery: 35,   // seg
    enemyMax: 8,
    enemyAggroDist: 70,
    enemyAttackDist: 12,
    enemyDamage: 3,
    enemySpeed: 36,
    enemyAttackCD: 1.1
  };

  // ---- Assets ----
  const ASSETS = { 
    player:{down:[],left:[],right:[],up:[]},
    // mundo
    tree:null, rock:null, wood:null, campfire:null, grass:null, sand:null, rock_tile:null, water:null, shore:[],
    crab:[], deer:[], fish:[],
    wall:null, floor:null, roof:null,
    // equipo visible
    spear:null, bow:null, axe:null, pick:null, boat:null,
    // sfx
    s_pickup:null,s_craft:null,s_campfire:null,s_water:null,s_step:null,s_hit:null
  };

  Promise.all([
    // jugador
    ...['down','left','right','up'].flatMap(dn => [0,1,2].map(f => loadImage(`assets/player_${dn}_${f}.png`).then(i=>ASSETS.player[dn][f]=i))),
    // mundo
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
    // equipo visible (si faltan archivos, se usa fallback dibujado)
    loadImage('assets/spear.png').then(i=>ASSETS.spear=i),
    loadImage('assets/bow.png').then(i=>ASSETS.bow=i),
    loadImage('assets/axe.png').then(i=>ASSETS.axe=i),
    loadImage('assets/pick.png').then(i=>ASSETS.pick=i),
    loadImage('assets/boat.png').then(i=>ASSETS.boat=i),
  ]).then(()=>start());

  ASSETS.s_pickup   = loadAudio('sounds/pickup.wav');
  ASSETS.s_craft    = loadAudio('sounds/craft.wav');
  ASSETS.s_campfire = loadAudio('sounds/campfire_loop.wav', true);
  ASSETS.s_water    = loadAudio('sounds/water_loop.wav', true);
  ASSETS.s_step     = loadAudio('sounds/footstep.wav');
  ASSETS.s_hit      = loadAudio('sounds/hit.wav');

  // ---- World ----
  const WORLD = { w: 2200, h: 1500 };
  const water = { x: 1200, y: 280, w: 800, h: 820, surface: 340 };

  const trees=[], rocks=[], woods=[], campfires=[], crabs=[], deers=[], fishs=[], buildings=[];
  const projectiles=[]; const enemies=[]; const regrow = [];
  let enemySpawnT = 0;

  const npcs = [
    { x: 360, y: 320, name:'Amigo', talked:false, quest:{need:5, done:false, rewarded:false} }
  ];

  // Generación: más árboles y rocas
  for (let i=0;i<160;i++){
    const t={x:80+rng()*(WORLD.w-160), y:80+rng()*(WORLD.h-160)};
    if (t.x>water.x-40 && t.x<water.x+water.w+40 && t.y>water.y-40 && t.y<water.y+water.h+40){ i--; continue; }
    trees.push(t);
  }
  for (let i=0;i<70;i++){
    const r={x:100+rng()*(WORLD.w-200), y:100+rng()*(WORLD.h-200), r:6};
    if (r.x>water.x && r.x<water.x+water.w && r.y>water.y && r.y<water.y+water.h){ i--; continue; }
    rocks.push(r);
  }
  for (let i=0;i<100;i++){
    const w={x:100+rng()*(WORLD.w-200), y:100+rng()*(WORLD.h-200), r:6};
    if (w.x>water.x && w.x<water.x+water.w && w.y>water.y && w.y<water.y+water.h){ i--; continue; }
    woods.push(w);
  }
  for (let i=0;i<10;i++){ const c={ x: water.x - 60 + rng()*(water.w+120), y: water.y - 60 + rng()*(water.h+120), r:6, speed:30, anim:0, t:0 }; crabs.push(c); }
  for (let i=0;i<8;i++){ deers.push({ x: 200 + rng()*(WORLD.w-400), y: 200 + rng()*(WORLD.h-400), r:7, speed:24, anim:0, t:0, hp:3 }); }
  for (let i=0;i<14;i++){ fishs.push({ x: water.x + 20 + rng()*(water.w-40), y: water.y + 20 + rng()*(water.h-40), r:5, speed:22, anim:0, t:0, hp:1 }); }

  // ---- Player ----
  const player = { x:300,y:300,r:6, speed:60,sprint:1.6,
    energy:100,oxygen:100,
    hp:100,maxHp:100,
    wood:0,stone:0, rawMeat:0,rawFish:0,cookedMeat:0,cookedFish:0,
    spearOwned:false,spearEquipped:false,spearDur:0,
    bowOwned:false,bowEquipped:false,bowDur:0, arrows:0,
    axeOwned:false,axeEquipped:false,axeDur:0,
    pickOwned:false,pickEquipped:false,pickDur:0,
    boatOwned:false,boatEquipped:false,
    facing:{x:1,y:0}, dirName:'right', invuln:0, animFrame:0, animTimer:0
  };

  const cam = {x:0,y:0};

  // ---- Build (estado) ----
  const build = { mode:false, current:'wall', rot:0, grid:16 };

  // ---- Input (teclado) ----
  const keys = new Set();
  onkeydown = e => {
    const k=e.key.toLowerCase(); keys.add(k);
    if (['s','l','c','i','b','escape'].includes(k)) e.preventDefault();
    if (k==='i') toggleInventory();
    if (k==='b') toggleBuild();
    if (k==='escape'){ closePanels(); }
  };
  onkeyup   = e => { keys.delete(e.key.toLowerCase()); };

  // ---- Mobile controls (joystick suave) ----
  const joy = document.getElementById('joy');
  const stick = joy.querySelector('.stick');
  joy.style.touchAction = 'none';
  stick.style.touchAction = 'none';

  const JOY_CFG = { DEAD: 0.12, MAX: 56, SMOOTH: 18 }; // deadzone, radio máx (px), suavizado
  const JOY = { active:false, id:null, nx:0, ny:0, sx:0, sy:0 }; // nx/ny = target; sx/sy = suavizado
  let runTouch = false;

  function joyCenter(){
    stick.style.left = '50%';
    stick.style.top  = '50%';
    stick.style.marginLeft='-32px';
    stick.style.marginTop='-32px';
  }
  joyCenter();

  function joyUpdateFromEvent(e){
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width/2;
    const cy = r.top  + r.height/2;

    let dx = e.clientX - cx;
    let dy = e.clientY - cy;

    const d = Math.hypot(dx,dy);
    const max = JOY_CFG.MAX;
    if (d > max){ const s = max / (d || 1); dx *= s; dy *= s; }

    let nx = dx / max, ny = dy / max;

    const mag = Math.hypot(nx,ny);
    if (mag < JOY_CFG.DEAD){ nx = 0; ny = 0; }
    else {
      const k = (mag - JOY_CFG.DEAD) / (1 - JOY_CFG.DEAD);
      nx = (nx / (mag || 1)) * k;
      ny = (ny / (mag || 1)) * k;
    }

    JOY.nx = nx; JOY.ny = ny;

    stick.style.left = (r.width/2 + dx) + 'px';
    stick.style.top  = (r.height/2 + dy) + 'px';
    stick.style.marginLeft='-32px';
    stick.style.marginTop='-32px';
  }

  joy.addEventListener('pointerdown', (e)=>{
    JOY.active = true; JOY.id = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    joyUpdateFromEvent(e);
    e.preventDefault();
  }, {passive:false});

  window.addEventListener('pointermove', (e)=>{
    if (!JOY.active || e.pointerId !== JOY.id) return;
    joyUpdateFromEvent(e);
  }, {passive:false});

  function joyUp(e){
    if (JOY.active && (!e || e.pointerId === JOY.id)){
      JOY.active = false; JOY.id = null;
      JOY.nx = 0; JOY.ny = 0;
      joyCenter();
    }
  }
  window.addEventListener('pointerup', joyUp, {passive:true});
  window.addEventListener('pointercancel', joyUp, {passive:true});

  function btnPress(el, down, up){
    el.addEventListener('pointerdown', e=>{ down(); e.preventDefault(); }, {passive:false});
    if (up) el.addEventListener('pointerup', e=>{ up(); e.preventDefault(); }, {passive:false});
    el.addEventListener('pointerleave', ()=>{ up&&up(); }, {passive:true});
  }
  const btnA = document.getElementById('btnA');
  const btnRun = document.getElementById('btnRun');
  const btnInv = document.getElementById('btnInv');
  const btnBuild = document.getElementById('btnBuild');
  const btnFire = document.getElementById('btnFire');
  const btnDoor = document.getElementById('btnDoor');
  const btnMis = document.getElementById('btnMis');
  const btnFS  = document.getElementById('btnFS');

  btnPress(btnA, ()=>{ if (build.mode) { tryBuild(); } else if (!interactNPC()) { if (!shootArrow()) tryAttack(); } });
  btnPress(btnRun, ()=>{ runTouch=true; }, ()=>{ runTouch=false; });
  btnPress(btnInv, ()=>{ toggleInventory(); });
  btnPress(btnBuild, ()=>{ toggleBuild(); });
  btnPress(btnFire, ()=>{ craftFire(); });
  btnPress(btnDoor, ()=>{ tryToggleDoor(); });
  btnPress(btnMis,  ()=>{ toggleMissions(); });
  btnFS && btnFS.addEventListener('click', async ()=>{ try{ await document.body.requestFullscreen(); }catch{} });

  function updateJoystick(dt){
    const k = Math.min(1, dt * JOY_CFG.SMOOTH);
    JOY.sx += (JOY.nx - JOY.sx) * k;
    JOY.sy += (JOY.ny - JOY.sy) * k;
  }

  // ---- Overlay helpers
  const invDiv = document.getElementById('inventory');
  const buildDiv = document.getElementById('buildPanel');
  const dialog = document.getElementById('dialog');
  const dialogText = document.getElementById('dialogText');
  const dialogClose = document.getElementById('dialogClose');

  function isVisible(el){ return el && !el.classList.contains('hidden'); }
  function updateOverlayState(){
    const mis = document.getElementById('missions');
    const open = isVisible(invDiv) || isVisible(buildDiv) || (mis && !mis.classList.contains('hidden')) || (dialog && dialog.classList.contains('show') && !dialog.classList.contains('hidden'));
    document.body.classList.toggle('overlay-open', !!open);
  }

  // ---- Panels ----
  function closePanels(){
    invDiv.classList.add('hidden');
    buildDiv.classList.add('hidden');
    const m=document.getElementById('missions'); if (m) m.classList.add('hidden');
    hideDialog();
    updateOverlayState();
  }
  function toggleInventory(){ invDiv.classList.toggle('hidden'); updateInvUI(); updateOverlayState(); }
  function toggleBuild(){ buildDiv.classList.toggle('hidden'); build.mode = !build.mode; updateOverlayState(); }
  invDiv.addEventListener('click', (e)=>{ if(e.target===invDiv){ invDiv.classList.add('hidden'); updateOverlayState(); } });
  buildDiv.addEventListener('click', (e)=>{ if(e.target===buildDiv){ buildDiv.classList.add('hidden'); build.mode=false; updateOverlayState(); } });
  const btnExitBuild = document.getElementById('btnExitBuild');
  if (btnExitBuild) btnExitBuild.onclick = ()=> { buildDiv.classList.add('hidden'); build.mode=false; updateOverlayState(); };

  // ---- Diálogo centrado ----
  function showDialog(text){
    dialogText.innerHTML = Array.isArray(text) ? text.map(t=>`<p>${t}</p>`).join('') : `<p>${text}</p>`;
    dialog.classList.add('show'); dialog.classList.remove('hidden');
    updateOverlayState();
  }
  function hideDialog(){ dialog.classList.add('hidden'); dialog.classList.remove('show'); updateOverlayState(); }
  dialogClose.addEventListener('click', hideDialog);
  dialog.addEventListener('click', (e)=>{ if(e.target===dialog) hideDialog(); });
  addEventListener('keydown', (e)=>{ if (e.key==='Escape') hideDialog(); });

  // ---- Inventory UI ----
  function $(id){ return document.getElementById(id); }
  function updateInvUI(){
    $('woodCount').textContent=player.wood;
    $('stoneCount').textContent=player.stone;
    $('rawMeat').textContent=player.rawMeat;
    $('rawFish').textContent=player.rawFish;
    $('cookedMeat').textContent=player.cookedMeat;
    $('cookedFish').textContent=player.cookedFish;
    $('spearOwned').textContent=player.spearOwned?(player.spearEquipped?'equipada':'sí'):'no';
    const ac=$('arrowCount'); if (ac) ac.textContent = player.arrows;
    const t=(id,cond)=>{ const el=$(id); if (el) el.classList.toggle('active', !!cond); };
    t('equipSpearTile', player.spearEquipped);
    t('equipBowTile',   player.bowEquipped);
    t('equipAxeTile',   player.axeEquipped);
    t('equipPickTile',  player.pickEquipped);
    t('equipBoatTile',  player.boatEquipped);
  }

  // Botones inventario
  $('btnEquipSpear').onclick = ()=>{ if (!player.spearOwned) return toast('Primero crafteá la lanza.'); player.spearEquipped=!player.spearEquipped; if (player.spearEquipped){ player.bowEquipped=false; player.axeEquipped=false; player.pickEquipped=false; } updateInvUI(); saveLS(); };
  $('btnCraftSpear').onclick = ()=>{ if (player.wood>=1){ player.wood-=1; player.spearOwned=true; player.spearDur=40; try{ASSETS.s_craft.play();}catch(e){}; announce('Lanza creada'); updateInvUI(); updateMissions(); saveLS(); } else toast('1 madera'); };
  $('btnCraftBow').onclick = ()=>{ if (player.wood>=2){ player.wood-=2; player.bowOwned=true; player.bowDur=60; try{ASSETS.s_craft.play();}catch(e){}; announce('Arco creado'); updateInvUI(); updateMissions(); saveLS(); } else toast('2 madera'); };
  $('btnCraftArrows').onclick = ()=>{ if (player.wood>=1){ player.wood-=1; player.arrows+=8; try{ASSETS.s_craft.play();}catch(e){}; toast('Flechas +8'); updateInvUI(); saveLS(); } else toast('1 madera'); };
  $('btnEquipBow').onclick = ()=>{ if (!player.bowOwned) return toast('Primero crafteá el arco.'); player.bowEquipped=!player.bowEquipped; if (player.bowEquipped){ player.spearEquipped=false; player.axeEquipped=false; player.pickEquipped=false; } updateInvUI(); saveLS(); };

  $('btnCraftBoat').onclick = ()=>{ if (player.wood>=10 && player.stone>=2){ player.wood-=10; player.stone-=2; player.boatOwned=true; try{ASSETS.s_craft.play();}catch(e){}; announce('Barco creado'); updateMissions(); updateInvUI(); saveLS(); } else toast('10 madera + 2 piedra'); };
  $('btnEquipBoat').onclick = ()=>{ if (!player.boatOwned) return toast('Primero crafteá el barco.'); player.boatEquipped = !player.boatEquipped; toast(player.boatEquipped?'Barco equipado':'Barco guardado'); updateInvUI(); saveLS(); };

  const eqS=$('equipSpearTile'), eqB=$('equipBowTile'), eqBoat=$('equipBoatTile'), eqA=$('equipAxeTile'), eqP=$('equipPickTile');
  if (eqS) eqS.onclick = ()=>{ if (!player.spearOwned) return toast('No tenés lanza.'); player.spearEquipped=!player.spearEquipped; if (player.spearEquipped){ player.bowEquipped=false; player.axeEquipped=false; player.pickEquipped=false; } updateInvUI(); saveLS(); };
  if (eqB) eqB.onclick = ()=>{ if (!player.bowOwned) return toast('No tenés arco.'); player.bowEquipped=!player.bowEquipped; if (player.bowEquipped){ player.spearEquipped=false; player.axeEquipped=false; player.pickEquipped=false; } updateInvUI(); saveLS(); };
  if (eqA) eqA.onclick = ()=>{ if (!player.axeOwned) return toast('No tenés hacha.'); player.axeEquipped=!player.axeEquipped; if (player.axeEquipped){ player.spearEquipped=false; player.bowEquipped=false; player.pickEquipped=false; } updateInvUI(); saveLS(); };
  if (eqP) eqP.onclick = ()=>{ if (!player.pickOwned) return toast('No tenés pico.'); player.pickEquipped=!player.pickEquipped; if (player.pickEquipped){ player.spearEquipped=false; player.bowEquipped=false; player.axeEquipped=false; } updateInvUI(); saveLS(); };

  // Herramientas (requiere mesa cerca)
  function nearWorkbench(){ for (const b of buildings){ if (b.type==='workbench' && Math.hypot(player.x-b.x, player.y-b.y) < 22) return true; } return false; }
  $('btnCraftAxe').onclick = ()=> {
    if (!nearWorkbench()) return announce('Acercate a una mesa de crafteo');
    if (player.wood>=1 && player.stone>=1){
      player.wood--; player.stone--;
      player.axeOwned=true; player.axeDur=45;
      try{ASSETS.s_craft.play();}catch(e){}; announce('Hacha creada'); updateInvUI(); saveLS();
    } else toast('1 madera + 1 piedra');
  };
  $('btnEquipAxe').onclick = ()=>{ if (!player.axeOwned) return toast('No tenés hacha.'); player.axeEquipped=!player.axeEquipped; if (player.axeEquipped){ player.spearEquipped=false; player.bowEquipped=false; player.pickEquipped=false; } updateInvUI(); saveLS(); };

  $('btnCraftPick').onclick = ()=> {
    if (!nearWorkbench()) return announce('Acercate a una mesa de crafteo');
    if (player.wood>=1 && player.stone>=2){
      player.wood-=1; player.stone-=2;
      player.pickOwned=true; player.pickDur=50;
      try{ASSETS.s_craft.play();}catch(e){}; announce('Pico creado'); updateInvUI(); saveLS();
    } else toast('1 madera + 2 piedra');
  };
  $('btnEquipPick').onclick = ()=>{ if (!player.pickOwned) return toast('No tenés pico.'); player.pickEquipped=!player.pickEquipped; if (player.pickEquipped){ player.spearEquipped=false; player.bowEquipped=false; player.axeEquipped=false; } updateInvUI(); saveLS(); };

  // Cocina / Consumibles
  $('btnCookMeat').onclick = ()=> cook('meat');
  $('btnCookFish').onclick = ()=> cook('fish');
  $('btnEatMeat').onclick = ()=>{ if (player.cookedMeat>0){ player.cookedMeat--; player.hp=Math.min(player.maxHp, player.hp+10); player.energy=Math.min(100, player.energy+12); toast('¡Ñam! Carne.'); updateInvUI(); saveLS(); } else toast('No tenés carne cocida'); };
  $('btnEatFish').onclick = ()=>{ if (player.cookedFish>0){ player.cookedFish--; player.hp=Math.min(player.maxHp, player.hp+6); player.energy=Math.min(100, player.energy+8); toast('¡Ñam! Pescado.'); updateInvUI(); saveLS(); } else toast('No tenés pescado cocido'); };

  // ---- Export/Import ----
  $('btnExport').onclick = ()=>{ const data = collectSaveData(); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})); a.download='survival2d_mobile_save.json'; a.click(); URL.revokeObjectURL(a.href); };
  $('fileImport').addEventListener('change', (e)=>{ const f=e.target.files[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=>{ try{ applySaveData(JSON.parse(rd.result)); toast('Guardado importado.'); updateInvUI(); }catch{ toast('Archivo inválido'); } }; rd.readAsText(f); });

  // ---- Build system ----
  for (const btn of buildDiv.querySelectorAll('[data-build]')){ btn.onclick = ()=> { build.current = btn.getAttribute('data-build'); }; }
  addEventListener('wheel', e => { if (build.mode){ build.rot += Math.sign(e.deltaY); } });

  // ---- Save/Load ----
  function collectSaveData(){ 
    return { player, campfires, rocks, woods, crabs, deers, fishs, buildings, timeOfDay, day, npcs, missions, regrow };
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
    if (data.npcs){ npcs.length=0; data.npcs.forEach(n=>npcs.push(n)); }
    if (data.missions){ for (const m of data.missions){ const mm = missions.find(x=>x.id===m.id); if (mm) mm.done = !!m.done; } }
    if (data.regrow){ regrow.length=0; data.regrow.forEach(o=>regrow.push(o)); }
    timeOfDay = data.timeOfDay??12; day = data.day??1;
    updateInvUI();
  }
  function saveLS(){ try{ localStorage.setItem('surv2d_mobile', JSON.stringify(collectSaveData())); }catch{} }
  function loadLS(){ const s=localStorage.getItem('surv2d_mobile'); if(!s) return false; try{ applySaveData(JSON.parse(s)); updateInvUI(); return true; }catch{ return false; } }

  // ---- HUD, toast e indicaciones ----
  const invHUD = $('invHUD'); let toastTimer=0; let hintTimer=0;
  function toast(msg){ let t=$('toast'); if (!t){ t=document.createElement('div'); t.id='toast'; document.body.appendChild(t);} t.textContent=msg; toastTimer=2.2; }
  function announce(msg, secs=2.2){
    const el = $('hintCenter');
    el.textContent = msg;
    el.classList.remove('hidden'); el.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(()=>{ el.classList.add('hidden'); el.classList.remove('show'); }, secs*1000);
  }

  // ---- Misiones ----
  const missions = [
    {id:'campfire', text:'Hacer una fogata', done:false},
    {id:'spear', text:'Craftear una lanza', done:false},
    {id:'door', text:'Colocar una puerta', done:false},
    {id:'boat', text:'Construir un barco', done:false},
    {id:'day3', text:'Sobrevivir hasta Día 3', done:false},
  ];
  function updateMissions(){
    missions.find(m=>m.id==='campfire').done ||= (campfires.length>0);
    missions.find(m=>m.id==='spear').done    ||= player.spearOwned;
    missions.find(m=>m.id==='boat').done     ||= player.boatOwned;
    missions.find(m=>m.id==='door').done     ||= buildings.some(b=>b.type==='door');
    missions.find(m=>m.id==='day3').done     ||= (day>=3);
    const root = $('missions');
    if (root && !root.classList.contains('hidden')) renderMissions();
  }
  function renderMissions(){
    const root = $('missions'); if (!root) return;
    root.querySelector('.mis-list').innerHTML = missions.map(m=>`<li>${m.done?'✅':'⬜'} ${m.text}</li>`).join('');
  }
  function toggleMissions(){
    let root = $('missions');
    if (!root){
      root = document.createElement('div');
      root.id='missions';
      root.style.position='fixed'; root.style.inset='0'; root.style.zIndex='9';
      root.style.display='flex'; root.style.alignItems='center'; root.style.justifyContent='center';
      root.innerHTML = `
        <div class="inv-card" style="max-width:560px;">
          <h3 style="text-align:center">Misiones</h3>
          <ul class="mis-list" style="margin:0 0 12px 18px; padding:0; list-style:none;"></ul>
          <div class="recipes"><button id="btnCloseMis">Cerrar</button></div>
        </div>`;
      document.body.appendChild(root);

      // Cerrar tocando fuera
      root.addEventListener('click', (e)=>{ if (e.target===root){ root.classList.add('hidden'); updateOverlayState(); } }, {passive:true});

      // Botón cerrar
      const closeMis = (e)=>{ e?.preventDefault(); e?.stopPropagation(); root.classList.add('hidden'); updateOverlayState(); };
      const btnClose = root.querySelector('#btnCloseMis');
      btnClose.addEventListener('click', closeMis, {passive:false});
      btnClose.addEventListener('pointerdown', closeMis, {passive:false});
      btnClose.addEventListener('touchend', closeMis, {passive:false});

      addEventListener('keydown', (e)=>{ if (e.key==='Escape'){ root.classList.add('hidden'); updateOverlayState(); } });
    } else {
      root.classList.toggle('hidden');
    }
    renderMissions();
    updateOverlayState();
  }

  // ===== CLIMA ===== (visual)
  const weather = { state: 'clear', rain: 0, wind: 0, t: 0, nextChange: 120 + Math.random()*120 };
  function setWeather(state){
    weather.state = state;
    if (state === 'clear'){ weather.rain = 0; weather.wind = 0; }
    if (state === 'rain'){  weather.rain = 0.8; weather.wind = 0.2; }
    if (state === 'wind'){  weather.rain = 0.0; weather.wind = 0.7; }
  }
  function updateWeather(dt){
    weather.t += dt;
    if (weather.t >= weather.nextChange){
      weather.t = 0;
      weather.nextChange = 120 + Math.random()*180;
      const r = Math.random();
      if (r < 0.55) setWeather('clear');
      else if (r < 0.8) setWeather('rain');
      else setWeather('wind');
    }
  }
  let rainPhase = 0;

  // ---- Tiempo ----
  let timeOfDay = 12, day=1; const DAY_SPEED=900; let last=performance.now(); let shoreAnim=0;

  // ---- Auto-guardado ----
  const AUTO_SAVE_EVERY = 15; // seg
  setInterval(saveLS, AUTO_SAVE_EVERY*1000);
  addEventListener('visibilitychange', ()=>{ if (document.hidden) saveLS(); });
  addEventListener('beforeunload', saveLS);

  function start(){
    // Auto-load si hay partida
    let hadSave = false;
    try{
      const s = localStorage.getItem('surv2d_mobile');
      if (s){ applySaveData(JSON.parse(s)); hadSave = true; }
    }catch{}
    updateInvUI();

    // Kit inicial si es la primera vez
    if (!hadSave){
      player.spearOwned = true; player.spearEquipped = true; player.spearDur = 40;
      player.wood += 2; player.stone += 1;
      announce('Kit inicial: Lanza + recursos');
      saveLS(); updateInvUI();
    }

    requestAnimationFrame(tick);
    ASSETS.s_water.volume=0.0; ASSETS.s_water.play().catch(()=>{});
    ASSETS.s_campfire.volume=0.0; ASSETS.s_campfire.play().catch(()=>{});
    const unlock = ()=>{ try{ ASSETS.s_water.play().then(()=>ASSETS.s_water.pause()); ASSETS.s_campfire.play().then(()=>ASSETS.s_campfire.pause()); }catch{}; window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });

    // spawn inicial enemigos
    for (let i=0;i<4;i++) spawnEnemy();
  }

  function nearHeatSource(){
    for (const f of campfires){ if (Math.hypot(player.x-f.x, player.y-f.y) < f.r) return true; }
    for (const b of buildings){ if (Math.hypot(player.x-b.x, player.y-b.y) < 40) return true; }
    return false;
  }
  function cook(which){
    if (!nearHeatSource()) return announce('Necesitás una fogata u horno cerca');
    if (which==='meat' && player.rawMeat>=1){ player.rawMeat--; player.cookedMeat++; try{ASSETS.s_craft.play();}catch(e){}; toast('Carne cocinada'); updateInvUI(); saveLS(); }
    else if (which==='fish' && player.rawFish>=1){ player.rawFish--; player.cookedFish++; try{ASSETS.s_craft.play();}catch(e){}; toast('Pescado cocinado'); updateInvUI(); saveLS(); }
    else toast('Faltan ingredientes');
  }

  // --- Daño / muerte / respawn ---
  function damagePlayer(amount){
    if (player.invuln > 0) return;
    player.hp = Math.max(0, player.hp - amount);
    player.invuln = 0.8;
    try { ASSETS.s_hit.currentTime=0; ASSETS.s_hit.play(); } catch {}
    if (navigator.vibrate) navigator.vibrate(60);
    if (player.hp <= 0) onPlayerDeath();
  }
  function onPlayerDeath(){
    showDialog([
      '<b>Has muerto</b>',
      'Reaparecés cerca del refugio (si colocaste uno) o en el inicio.',
      'Perdés parte de madera, piedra y flechas.'
    ]);
    const handler = ()=>{ respawnPlayer(); dialogClose.removeEventListener('click', handler); };
    dialogClose.addEventListener('click', handler, { once:true });
  }
  function respawnPlayer(){
    const spawn = buildings.find(b=>b.type==='shelter') || {x:300,y:300};
    player.x = spawn.x + 8; player.y = spawn.y + 8;
    player.hp = player.maxHp;
    player.energy = 70; player.oxygen = 100;
    player.wood = Math.floor(player.wood * 0.7);
    player.stone = Math.floor(player.stone * 0.7);
    player.arrows = Math.max(0, Math.floor(player.arrows * 0.8));
    saveLS(); updateInvUI(); hideDialog();
  }

  function tryAttack(){
    // --- Hacha: talar árboles ---
    if (player.axeEquipped){
      for (let i=trees.length-1;i>=0;i--){
        const t = trees[i];
        if (Math.hypot(player.x - t.x, player.y - t.y) < 16){
          trees.splice(i,1);
          const gain = 3 + (Math.random()*3|0); // 3–5
          player.wood += gain;
          if (--player.axeDur <= 0){ player.axeOwned=false; player.axeEquipped=false; toast('Tu hacha se rompió'); }
          announce(`Madera +${gain}`);
          updateInvUI(); saveLS();
          // re-grow
          regrow.push({x:t.x, y:t.y, t: 45 + Math.random()*45}); // 45–90s
          return true;
        }
      }
    }
    // --- Pico: picar roca ---
    if (player.pickEquipped){
      for (let i=rocks.length-1;i>=0;i--){
        const r = rocks[i];
        if (Math.hypot(player.x - r.x, player.y - r.y) < 16){
          rocks.splice(i,1);
          const gain = 3;
          player.stone += gain;
          if (--player.pickDur <= 0){ player.pickOwned=false; player.pickEquipped=false; toast('Tu pico se rompió'); }
          announce(`Piedra +${gain}`);
          updateInvUI(); saveLS();
          return true;
        }
      }
    }

    // --- Spear/axe/pick contra animales y enemigos ---
    const reach=18;
    const hitMelee = (ox,oy, radius, arr, onKill)=>{
      for (let i=arr.length-1;i>=0;i--){
        const e=arr[i];
        if (Math.hypot(ox - e.x, oy - e.y) < radius + (e.r||6)){
          e.hp=(e.hp||1)-1;
          try { ASSETS.s_hit.currentTime=0; ASSETS.s_hit.play(); } catch {}
          if (e.hp<=0){ arr.splice(i,1); onKill && onKill(); }
          return true;
        }
      }
      return false;
    };

    const ox = player.x + player.facing.x*reach, oy = player.y + player.facing.y*reach;
    // Ciervos
    if (hitMelee(ox,oy, player.r, deers, ()=>{ player.rawMeat++; toast('Carne cruda +1'); updateInvUI(); saveLS(); })) return true;
    // Peces
    if (hitMelee(ox,oy, player.r, fishs, ()=>{ player.rawFish++; toast('Pescado crudo +1'); updateInvUI(); saveLS(); })) return true;
    // Enemigos
    if (player.spearEquipped || player.axeEquipped || player.pickEquipped){
      if (hitMelee(ox,oy, player.r, enemies, ()=>{ player.rawMeat++; toast('Botín: carne +1'); updateInvUI(); saveLS(); })) return true;
      if (player.spearEquipped){ if (--player.spearDur<=0){ player.spearOwned=false; player.spearEquipped=false; toast('Tu lanza se rompió'); } }
      if (player.axeEquipped){ if (--player.axeDur<=0){ player.axeOwned=false; player.axeEquipped=false; toast('Tu hacha se rompió'); } }
      if (player.pickEquipped){ if (--player.pickDur<=0){ player.pickOwned=false; player.pickEquipped=false; toast('Tu pico se rompió'); } }
      return true;
    }
    return false;
  }

  function shootArrow(){
    if (!player.bowEquipped || player.arrows<=0) return false;
    const sp = 180;
    projectiles.push({ x:player.x, y:player.y, vx:player.facing.x*sp, vy:player.facing.y*sp, life:1.4 });
    player.arrows--;
    if (--player.bowDur <= 0){ player.bowOwned=false; player.bowEquipped=false; toast('Tu arco se rompió'); }
    toast('Flechas: '+player.arrows); updateInvUI(); saveLS();
    return true;
  }

  function craftFire(){
    if (!tick.craftLatch){
      tick.craftLatch=true;
      if (player.wood>=3 && player.stone>=1){
        player.wood-=3; player.stone-=1;
        const px=player.x+player.facing.x*10, py=player.y+player.facing.y*10;
        campfires.push({x:px,y:py,r:50,life:120});
        try{ASSETS.s_craft.currentTime=0; ASSETS.s_craft.play();}catch(e){}
        announce('Fogata creada'); updateMissions(); updateInvUI(); saveLS();
      } else toast('3 madera + 1 piedra');
      setTimeout(()=>{ tick.craftLatch=false; }, 200);
    }
  }

  function tryBuild(){
    const gx=Math.round((player.x+player.facing.x*14)/16)*16;
    const gy=Math.round((player.y+player.facing.y*14)/16)*16;
    const type=build.current;
    if (type==='wall'){ if (player.wood<2) return toast('Pared: 2 madera'); player.wood-=2; }
    else if (type==='floor'){ if (player.wood<1) return toast('Piso: 1 madera'); player.wood-=1; }
    else if (type==='roof'){ if (player.wood<1||player.stone<1) return toast('Techo: 1 madera + 1 piedra'); player.wood-=1; player.stone-=1; }
    else if (type==='door'){ if (player.wood<2||player.stone<1) return toast('Puerta: 2 madera + 1 piedra'); player.wood-=2; player.stone-=1; buildings.push({type:'door',x:gx,y:gy,rot:0,open:false}); try{ASSETS.s_craft.play();}catch(e){}; updateMissions(); updateInvUI(); saveLS(); return; }
    else if (type==='trap'){ if (player.wood<2||player.stone<1) return toast('Trampa: 2 madera + 1 piedra'); player.wood-=2; player.stone-=1; buildings.push({type:'trap',x:gx,y:gy,rot:0,armed:true}); try{ASSETS.s_craft.play();}catch(e){}; updateInvUI(); saveLS(); return; }
    else if (type==='shelter'){
      if (player.wood<6 || player.stone<2) return toast('Refugio: 6 madera + 2 piedra');
      player.wood -= 6; player.stone -= 2;
      buildings.push({type:'shelter', x:gx, y:gy, rot:0});
      try{ASSETS.s_craft.play();}catch(e){}; updateInvUI(); saveLS(); return;
    }
    else if (type==='workbench'){
      if (player.wood<4 || player.stone<2) return toast('Mesa: 4 madera + 2 piedra');
      player.wood-=4; player.stone-=2;
      buildings.push({type:'workbench', x:gx, y:gy, rot:0});
      try{ASSETS.s_craft.play();}catch(e){}; updateInvUI(); saveLS(); return;
    }
    else if (type==='furnace'){
      if (player.stone<8) return toast('Horno: 8 piedra');
      player.stone-=8;
      buildings.push({type:'furnace', x:gx, y:gy, rot:0});
      try{ASSETS.s_craft.play();}catch(e){}; updateInvUI(); saveLS(); return;
    }
    buildings.push({type,x:gx,y:gy,rot:build.rot%4});
    try{ASSETS.s_craft.currentTime=0; ASSETS.s_craft.play();}catch(e){}
    updateInvUI(); saveLS();
  }

  function tryToggleDoor(){
    let nearest=null, nd=9999;
    for (const b of buildings){
      if (b.type!=='door') continue;
      const d = Math.hypot(player.x-b.x, player.y-b.y);
      if (d<nd){ nd=d; nearest=b; }
    }
    if (nearest && nd<20){ nearest.open=!nearest.open; toast(nearest.open?'Puerta abierta':'Puerta cerrada'); saveLS(); }
    else toast('Acercate a una puerta');
  }

  function circleRectCollide(cx,cy,r,rx,ry,rw,rh){ const nx=Math.max(rx,Math.min(cx,rx+rw)); const ny=Math.max(ry,Math.min(cy,ry+rh)); return (cx-nx)**2+(cy-ny)**2<=r*r; }

  // mouse/touch action
  let mouseDown=false;
  addEventListener('mousedown', e=>{ mouseDown=true; e.preventDefault(); }, {passive:false});
  addEventListener('mouseup', e=>{ mouseDown=false; }, {passive:true});

  // Enemigos
  function spawnEnemy(){
    const x = 100 + rng()*(WORLD.w-200);
    const y = 100 + rng()*(WORLD.h-200);
    if (circleRectCollide(x,y,8, water.x,water.y,water.w,water.h)) return;
    enemies.push({ x, y, r:7, hp:2, vx:0, vy:0, t:0, cd:0, state:'wander' });
  }

  let stepTimer=0;
  function tick(){
    const now=performance.now(); let dt=(now-last)/1000; last=now; if (dt>0.05) dt=0.05;

    // CLIMA
    updateWeather(dt);

    // Input vector (teclado + joystick suave)
    updateJoystick(dt);

    let ix = 0, iy = 0;

    // Teclado
    if (keys.has('w')) iy -= 1;
    if (keys.has('s')) iy += 1;
    if (keys.has('a')) ix -= 1;
    if (keys.has('d')) ix += 1;

    // Normaliza teclado si hace diagonal
    const km = Math.hypot(ix,iy) || 1; ix/=km; iy/=km;

    // Joystick prioriza si está activo/suavizando
    if (Math.hypot(JOY.sx, JOY.sy) > 0.001){
      ix = JOY.sx; iy = JOY.sy;
    }

    // Dirección del sprite según input final
    if (Math.abs(ix) > Math.abs(iy)) player.dirName = (ix>0?'right':'left');
    else if (Math.abs(iy) > 0.05)    player.dirName = (iy>0?'down':'up');

    // Actualiza hacia dónde “mira”
    const ldir=Math.hypot(ix,iy)||1; player.facing = {x:ix/ldir, y:iy/ldir};

    const inWater = circleRectCollide(player.x, player.y, player.r, water.x, water.y, water.w, water.h);
    const baseMod = Math.max(0.6, Math.min(1.1, (player.energy/100)*1.0));
    const waterMult = player.boatEquipped && inWater ? 1.4 : (inWater?0.6:1.0);
    const speed = player.speed * baseMod * ((keys.has('shift')||runTouch)?player.sprint:1) * waterMult;

    const prevX=player.x, prevY=player.y;
    player.x += ix*speed*dt; player.y += iy*speed*dt;

    // colisión simple con paredes/puertas cerradas
    for (const b of buildings){
      if (b.type==='wall' || (b.type==='door' && !b.open)){
        if (circleRectCollide(player.x, player.y, player.r, b.x-8, b.y-8, 16,16)){
          player.x = prevX; player.y = prevY; break;
        }
      }
    }

    stepTimer -= dt;
    if ((ix||iy) && !inWater && stepTimer<=0){ try{ASSETS.s_step.currentTime=0; ASSETS.s_step.play();}catch(e){} stepTimer = 0.35/baseMod; }

    // bounds
    player.x = clamp(player.x, 8, WORLD.w-8);
    player.y = clamp(player.y, 8, WORLD.h-8);

    // oxygen
    if (inWater) {
      const under = player.y > water.surface;
      if (player.boatEquipped) {
        player.oxygen = Math.min(100, player.oxygen + 35*dt);
      } else if (under) {
        player.oxygen = Math.max(0, player.oxygen - 4*dt);
        if (player.oxygen === 0) player.energy = Math.max(0, player.energy - 10*dt);
      } else {
        player.oxygen = Math.min(100, player.oxygen + 35*dt);
      }
    } else {
      player.oxygen = Math.min(100, player.oxygen + 35*dt);
    }

    // energía cae lento
    player.energy = Math.max(0, player.energy - 0.25*dt);
    if (player.invuln>0) player.invuln -= dt;

    // pickups sueltos
    for (let i=rocks.length-1;i>=0;i--){ const r=rocks[i]; if (Math.hypot(player.x-r.x, player.y-r.y) < player.r + r.r){ player.stone++; rocks.splice(i,1); try{ASSETS.s_pickup.currentTime=0; ASSETS.s_pickup.play();}catch(e){} toast('Piedra +1'); updateInvUI(); saveLS(); } }
    for (let i=woods.length-1;i>=0;i--){ const w=woods[i]; if (Math.hypot(player.x-w.x, player.y-w.y) < player.r + w.r){ player.wood++; woods.splice(i,1); try{ASSETS.s_pickup.currentTime=0; ASSETS.s_pickup.play();}catch(e){} toast('Madera +1'); updateInvUI(); saveLS(); } }

    // acción click/touch
    if (mouseDown){
      if (build.mode) tryBuild();
      else if (!interactNPC()) { if (!shootArrow()) tryAttack(); }
      mouseDown=false;
    }

    // tecla C (desktop) fogata
    if (keys.has('c')){ craftFire(); }

    // fogatas vida
    for (let i=campfires.length-1;i>=0;i--){ const f=campfires[i]; f.life-=dt; if (f.life<=0){ campfires.splice(i,1); saveLS(); } }

    // animales anim
    for (const c of crabs){ c.t+=dt; if (c.t>0.2){ c.anim=(c.anim+1)%2; c.t=0; } }
    for (const d of deers){ d.t+=dt; if (d.t>0.25){ d.anim=(d.anim+1)%2; d.t=0; } }
    for (const f of fishs){ f.t+=dt; if (f.t>0.25){ f.anim=(f.anim+1)%2; f.t=0; } }

    // Regeneración de árboles
    for (let i=regrow.length-1;i>=0;i--){
      regrow[i].t -= dt;
      if (regrow[i].t <= 0){
        trees.push({ x: regrow[i].x, y: regrow[i].y });
        regrow.splice(i,1);
      }
    }

    // Enemigos: spawn & update
    enemySpawnT += dt;
    if (enemies.length < TUNING.enemyMax && enemySpawnT > TUNING.enemySpawnEvery){
      spawnEnemy(); enemySpawnT = 0;
    }
    for (let i=0;i<enemies.length;i++){
      const e = enemies[i];
      e.t += dt; e.cd = Math.max(0, e.cd - dt);
      const dx = player.x - e.x, dy = player.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist < TUNING.enemyAggroDist) {
        e.state = 'chase';
        const inv = 1/(dist||1);
        e.vx = dx*inv*TUNING.enemySpeed;
        e.vy = dy*inv*TUNING.enemySpeed;
      } else if (e.t > 2.5) {
        e.state = 'wander';
        e.vx = (Math.random()*2-1)*20;
        e.vy = (Math.random()*2-1)*20;
        e.t = 0;
      }
      e.x += e.vx*dt; e.y += e.vy*dt;
      e.x = clamp(e.x, 8, WORLD.w-8); e.y = clamp(e.y, 8, WORLD.h-8);
      if (circleRectCollide(e.x,e.y,e.r, water.x,water.y,water.w,water.h)){ e.x -= e.vx*dt*2; e.y -= e.vy*dt*2; }
      if (dist < TUNING.enemyAttackDist && e.cd <= 0){
        damagePlayer(TUNING.enemyDamage);
        e.cd = TUNING.enemyAttackCD;
      }
    }

    // proyectiles
    for (let i=projectiles.length-1;i>=0;i--){
      const p=projectiles[i];
      p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
      let hit=false;
      for (let j=deers.length-1;j>=0 && !hit;j--){ const d=deers[j]; if (Math.hypot(p.x-d.x,p.y-d.y) < d.r+2){ d.hp--; if (d.hp<=0){ deers.splice(j,1); player.rawMeat++; toast('Carne cruda +1'); updateInvUI(); saveLS(); } hit=true; break; } }
      for (let j=fishs.length-1;j>=0 && !hit;j--){ const f=fishs[j]; if (Math.hypot(p.x-f.x,p.y-f.y) < f.r+2){ fishs.splice(j,1); player.rawFish++; toast('Pescado crudo +1'); updateInvUI(); saveLS(); hit=true; break; } }
      for (let j=enemies.length-1;j>=0 && !hit;j--){ const e=enemies[j]; if (Math.hypot(p.x-e.x, p.y-e.y) < e.r+2){ e.hp--; hit=true; if (e.hp<=0){ enemies.splice(j,1); player.rawMeat++; toast('Botín: carne +1'); updateInvUI(); saveLS(); } } }
      if (hit || p.life<=0) projectiles.splice(i,1);
    }

    // manual save/load
    if (keys.has('s')){ if (!tick.saveLatch){ tick.saveLatch=true; saveLS(); toast('Guardado.'); } } else tick.saveLatch=false;
    if (keys.has('l')){ if (!tick.loadLatch){ tick.loadLatch=true; if(loadLS()) toast('Cargado.'); else toast('No hay guardado.'); } } else tick.loadLatch=false;

    // anim
    player.animTimer += dt; const moving = (ix||iy);
    if (!moving) player.animFrame = 0; else if (player.animTimer>0.16){ player.animFrame = (player.animFrame+1)%3; player.animTimer=0; }

    // time
    timeOfDay += (dt * 24 / DAY_SPEED); if (timeOfDay>=24){ timeOfDay-=24; day++; updateMissions(); saveLS(); }
    shoreAnim += dt*4;

    // camera
    cam.x = clamp(player.x - W/2, 0, WORLD.w - W); cam.y = clamp(player.y - H/2, 0, WORLD.h - H);

    // HUD
    const hpBar = document.querySelector('.hp > span');
    const enBar = document.querySelector('.energy > span');
    const oxBar = document.querySelector('.oxygen > span');
    if (hpBar) hpBar.style.width = (player.hp / player.maxHp * 100) + '%';
    if (enBar) enBar.style.width = player.energy + '%';
    if (oxBar) oxBar.style.width = player.oxygen + '%';

    const hh=Math.floor(timeOfDay), mm=String(Math.floor((timeOfDay-hh)*60)).padStart(2,'0');
    const dur = (player.spearEquipped?` · Lanza:${player.spearDur}`:'') + (player.bowEquipped?` · Arco:${player.bowDur}`:'') + (player.axeEquipped?` · Hacha:${player.axeDur}`:'') + (player.pickEquipped?` · Pico:${player.pickDur}`:'');
    const extra = `${dur} · Flechas: ${player.arrows}` + (player.boatEquipped?' · 🚤':'');
    invHUD.textContent = `Madera: ${player.wood} · Piedra: ${player.stone} · Carne: ${player.rawMeat+player.cookedMeat} · Pescado: ${player.rawFish+player.cookedFish} · Día: ${day} · Hora: ${String(hh).padStart(2,'0')}:${mm}${extra}`;

    if (toastTimer>0){ toastTimer -= dt; if (toastTimer<=0){ const t=$('toast'); if (t) t.remove(); } }

    render(inWater);
    drawMinimap();
    requestAnimationFrame(tick);
  }

  function tile(img, x,y,w,h){ for (let ty=y; ty<y+h; ty+=img.height){ for (let tx=x; tx<x+w; tx+=img.width){ ctx.drawImage(img, tx*SCALE, ty*SCALE, img.width*SCALE, img.height*SCALE); } } }

  function drawBuildGhost(){
    if (!build.mode) return;
    const gx=Math.round((player.x + player.facing.x*14)/16)*16;
    const gy=Math.round((player.y + player.facing.y*14)/16)*16;
    const type=build.current;
    ctx.globalAlpha=0.6;
    if (type==='door'){ drawDoor(gx-cam.x, gy-cam.y, true); }
    else if (type==='trap'){ drawTrap(gx-cam.x, gy-cam.y, true); }
    else if (type==='shelter'){ drawShelter(gx-cam.x, gy-cam.y, true); }
    else if (type==='workbench'){ drawWorkbench(gx-cam.x, gy-cam.y, true); }
    else if (type==='furnace'){ drawFurnace(gx-cam.x, gy-cam.y, true); }
    else { const img=ASSETS[type]; if(img) ctx.drawImage(img, (Math.floor(gx - cam.x)-8)*SCALE, (Math.floor(gy - cam.y)-8)*SCALE, 16*SCALE, 16*SCALE); }
    ctx.globalAlpha=1.0;
  }

  // === DIBUJO EQUIPO / BARCO ===
  function facingAngle(){
    // ángulo a partir de vector facing (radianes)
    return Math.atan2(player.facing.y, player.facing.x);
  }
  function drawBoatUnder(px, py){
    const ang = 0; // barquito horizontal
    const w = 22, h = 10; // en px a escala base
    const gx = Math.floor(px*SCALE), gy = Math.floor(py*SCALE);
    ctx.save();
    ctx.translate(gx, gy + 6*SCALE); // un poco abajo del centro
    ctx.rotate(ang);
    if (ASSETS.boat && ASSETS.boat.width){
      ctx.drawImage(ASSETS.boat, (-w/2)*SCALE, (-h/2)*SCALE, w*SCALE, h*SCALE);
    } else {
      // fallback simple
      ctx.fillStyle = '#704b2a';
      ctx.fillRect((-w/2)*SCALE, (-h/2)*SCALE, w*SCALE, h*SCALE);
      ctx.strokeStyle = '#3a2715';
      ctx.lineWidth = 2;
      ctx.strokeRect((-w/2)*SCALE, (-h/2)*SCALE, w*SCALE, h*SCALE);
    }
    ctx.restore();
  }
  function drawEquippedOver(px, py){
    const ang = facingAngle();
    const centerX = Math.floor(px*SCALE);
    const centerY = Math.floor(py*SCALE);

    // offset delante del jugador
    const offset = 6; // base pixels
    const ox = Math.cos(ang) * offset;
    const oy = Math.sin(ang) * offset;

    // dibuja arma/herramienta si equipada (prioridad: arco > lanza > hacha > pico)
    if (player.bowEquipped && player.bowOwned){
      drawItemSprite(ASSETS.bow, centerX+ox*SCALE, centerY+oy*SCALE, ang, 12, 6, '#8b5a2b');
    } else if (player.spearEquipped && player.spearOwned){
      drawItemSprite(ASSETS.spear, centerX+ox*SCALE, centerY+oy*SCALE, ang, 16, 3, '#c0a060');
    } else if (player.axeEquipped && player.axeOwned){
      drawItemSprite(ASSETS.axe, centerX+ox*SCALE, centerY+oy*SCALE, ang, 12, 6, '#7a7a7a');
    } else if (player.pickEquipped && player.pickOwned){
      drawItemSprite(ASSETS.pick, centerX+ox*SCALE, centerY+oy*SCALE, ang, 12, 6, '#7a7a7a');
    }
  }
  function drawItemSprite(img, cx, cy, ang, w, h, fallbackColor){
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    if (img && img.width){
      ctx.drawImage(img, (-w/2)*SCALE, (-h/2)*SCALE, w*SCALE, h*SCALE);
    } else {
      // fallback geométrico
      ctx.fillStyle=fallbackColor||'#ddd';
      ctx.fillRect((-w/2)*SCALE, (-h/2)*SCALE, w*SCALE, h*SCALE);
      ctx.strokeStyle='#222'; ctx.lineWidth=2; ctx.strokeRect((-w/2)*SCALE, (-h/2)*SCALE, w*SCALE, h*SCALE);
    }
    ctx.restore();
  }

  function render(inWater){
    ctx.fillStyle = '#0b1320'; ctx.fillRect(0,0,cvs.width,cvs.height);
    tile(ASSETS.grass, - (cam.x % 16), - (cam.y % 16), W+16, H+16);
    const beach = { x: water.x-16, y: water.y-16, w: water.w+32, h: water.h+32 };
    ctx.save(); ctx.beginPath(); ctx.rect((beach.x-cam.x)*SCALE, (beach.y-cam.y)*SCALE, beach.w*SCALE, beach.h*SCALE); ctx.clip(); tile(ASSETS.sand, (beach.x-cam.x)%16 - 16, (beach.y-cam.y)%16 - 16, beach.w+32, beach.h+32); ctx.restore();
    const rockAreas = [{x:80,y:80,w:240,h:160},{x:WORLD.w-360,y:200,w:280,h:180}];
    for (const a of rockAreas){ ctx.save(); ctx.beginPath(); ctx.rect((a.x-cam.x)*SCALE, (a.y-cam.y)*SCALE, a.w*SCALE, a.h*SCALE); ctx.clip(); tile(ASSETS.rock_tile, (a.x-cam.x)%16 - 16, (a.y-cam.y)%16 - 16, a.w+32, a.h+32); ctx.restore(); }
    ctx.save(); ctx.beginPath(); ctx.rect((water.x-cam.x)*SCALE, (water.y-cam.y)*SCALE, water.w*SCALE, water.h*SCALE); ctx.clip(); tile(ASSETS.water, (water.x-cam.x + Math.sin(shoreAnim*0.2)*2)%16 - 16, (water.y-cam.y)%16 - 16, water.w+32, water.h+32); ctx.restore();
    const shoreFrame = ASSETS.shore[Math.floor(shoreAnim)%3];
    for (let x=0; x<water.w; x+=16){ ctx.drawImage(shoreFrame, (water.x + x - cam.x)*SCALE, (water.y - 8 - cam.y)*SCALE, 16*SCALE, 16*SCALE); ctx.drawImage(shoreFrame, (water.x + x - cam.x)*SCALE, (water.y + water.h - 8 - cam.y)*SCALE, 16*SCALE, 16*SCALE); }
    for (let y=0; y<water.h; y+=16){ ctx.drawImage(shoreFrame, (water.x - 8 - cam.x)*SCALE, (water.y + y - cam.y)*SCALE, 16*SCALE, 16*SCALE); ctx.drawImage(shoreFrame, (water.x + water.w - 8 - cam.x)*SCALE, (water.y + y - cam.y)*SCALE, 16*SCALE, 16*SCALE); }

    // árboles y pickups
    for (const t of trees){ const x=Math.floor(t.x - cam.x), y=Math.floor(t.y - cam.y); ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.fillRect((x-8)*SCALE, (y+6)*SCALE, 16*SCALE, 4*SCALE); ctx.drawImage(ASSETS.tree, (x-16)*SCALE, (y-24)*SCALE, ASSETS.tree.width*SCALE, ASSETS.tree.height*SCALE); }
    for (const r of rocks){ const x=Math.floor(r.x - cam.x), y=Math.floor(r.y - cam.y); ctx.drawImage(ASSETS.rock, (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE); }
    for (const w of woods){ const x=Math.floor(w.x - cam.x), y=Math.floor(w.y - cam.y); ctx.drawImage(ASSETS.wood, (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE); }

    // fogatas
    for (const f of campfires){ const x=Math.floor(f.x - cam.x), y=Math.floor(f.y - cam.y);
      ctx.fillStyle='rgba(255,150,40,0.18)'; ctx.beginPath(); ctx.arc(x*SCALE, y*SCALE, 32*SCALE, 0, Math.PI*2); ctx.fill();
      ctx.drawImage(ASSETS.campfire, (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE);
    }

    // construcciones
    for (const b of buildings){
      const x=Math.floor(b.x - cam.x), y=Math.floor(b.y - cam.y);
      if (b.type==='door') drawDoor(x, y, false, b.open);
      else if (b.type==='trap') drawTrap(x, y, false, b.armed);
      else if (b.type==='shelter') drawShelter(x, y);
      else if (b.type==='workbench') drawWorkbench(x, y);
      else if (b.type==='furnace')   drawFurnace(x, y);
      else { const img=ASSETS[b.type]; if (!img) continue; ctx.drawImage(img, (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE); }
    }

    // bichos
    for (const c of crabs){ const x=Math.floor(c.x - cam.x), y=Math.floor(c.y - cam.y); ctx.drawImage(ASSETS.crab[c.anim||0], (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE); }
    for (const d of deers){ const x=Math.floor(d.x - cam.x), y=Math.floor(d.y - cam.y); ctx.drawImage(ASSETS.deer[d.anim||0], (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE); }
    for (const f of fishs){ const x=Math.floor(f.x - cam.x), y=Math.floor(f.y - cam.y); ctx.drawImage(ASSETS.fish[f.anim||0], (x-8)*SCALE, (y-8)*SCALE, 16*SCALE, 16*SCALE); }

    // enemigos
    for (const e of enemies){
      const x = Math.floor(e.x - cam.x), y = Math.floor(e.y - cam.y);
      ctx.fillStyle = '#b73a3a';
      ctx.fillRect((x-6)*SCALE, (y-6)*SCALE, 12*SCALE, 12*SCALE);
    }

    // NPCs
    for (const n of npcs){
      const x=Math.floor(n.x - cam.x), y=Math.floor(n.y - cam.y);
      ctx.fillStyle='#ffd166'; ctx.fillRect((x-3)*SCALE, (y-6)*SCALE, 6*SCALE, 8*SCALE);
      ctx.fillStyle='#5a3d1e'; ctx.fillRect((x-2)*SCALE, (y-9)*SCALE, 4*SCALE, 3*SCALE);
    }

    // jugador + barco debajo si corresponde
    const px=Math.floor(player.x - cam.x), py=Math.floor(player.y - cam.y);

    if (player.boatEquipped && inWater){
      drawBoatUnder(px, py);
    }

    // sombra del jugador
    ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.fillRect((px-8)*SCALE, (py+6)*SCALE, 16*SCALE, 4*SCALE);

    // jugador
    const frame = ASSETS.player[player.dirName][player.animFrame||0] || ASSETS.player.right[0];
    ctx.drawImage(frame, (px-8)*SCALE, (py-12)*SCALE, 16*SCALE, 16*SCALE);

    // equipo por encima del jugador
    drawEquippedOver(px, py);

    // flechas
    ctx.fillStyle='#ffd166';
    for (const p of projectiles){ const x=Math.floor(p.x - cam.x), y=Math.floor(p.y - cam.y); ctx.fillRect((x-1)*SCALE, (y-1)*SCALE, 2*SCALE, 2*SCALE); }

    drawBuildGhost();

    // Lluvia
    drawRain();

    // NOCHE + ILUMINACIÓN
    let nightAlpha = 0;
    if (timeOfDay >= 19) nightAlpha = Math.min(0.65, (timeOfDay - 19) / 3);
    else if (timeOfDay <= 5) nightAlpha = Math.min(0.65, (5 - timeOfDay) / 3);

    if (nightAlpha > 0){
      lightCtx.clearRect(0,0,W,H);
      lightCtx.globalCompositeOperation = 'source-over';
      lightCtx.fillStyle = `rgba(0,0,20,${nightAlpha})`;
      lightCtx.fillRect(0,0,W,H);

      lightCtx.globalCompositeOperation = 'destination-out';

      // Luz jugador
      pixelLight(lightCtx, px, py, 46, [0.55, 0.30, 0.12]);

      // Fogatas
      for (const f of campfires){
        const fx = Math.floor(f.x - cam.x);
        const fy = Math.floor(f.y - cam.y);
        pixelLight(lightCtx, fx, fy, 88, [1.0, 0.85, 0.55, 0.3, 0.16]);
      }

      ctx.drawImage(lightCvs, 0, 0, W, H, 0, 0, W*SCALE, H*SCALE);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of campfires){
        const fx = Math.floor((f.x - cam.x) * SCALE);
        const fy = Math.floor((f.y - cam.y) * SCALE);
        const s1 = 18 * SCALE, s2 = 34 * SCALE;
        ctx.globalAlpha = 0.25; ctx.fillStyle = 'rgba(255,200,120,1)';
        ctx.fillRect(fx - s2, fy - s2, s2*2, s2*2);
        ctx.globalAlpha = 0.16; ctx.fillStyle = 'rgba(255,170,80,1)';
        ctx.fillRect(fx - s1, fy - s1, s1*2, s1*2);
      }
      ctx.restore();
    }
  }

  function drawRain(){
    if (weather.state !== 'rain') return;
    rainPhase += 0.02;
    ctx.save();
    ctx.globalAlpha = 0.35 * weather.rain;
    const step = 8, len = 14;
    for (let y=-len; y<H+len; y+=step){
      for (let x=-len; x<W+len; x+=step){
        const ox = ((x + y*1.3 + (rainPhase*140)) % step) - step/2;
        ctx.beginPath();
        ctx.moveTo((x+ox)*SCALE, (y)*SCALE);
        ctx.lineTo((x+ox+3)*SCALE, (y+len)*SCALE);
        ctx.strokeStyle = '#9ec9ff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawDoor(x,y,ghost=false,open=false){
    const gx=(x-8)*SCALE, gy=(y-8)*SCALE, s=16*SCALE;
    ctx.save(); if (ghost) ctx.globalAlpha=0.6;
    ctx.fillStyle=open?'#4b6a4b':'#6b4d2e'; ctx.fillRect(gx, gy, s, s);
    ctx.fillStyle=open?'#8dc78d':'#3a2a18'; ctx.fillRect(gx+3*SCALE, gy+3*SCALE, 10*SCALE, 10*SCALE);
    if (!open){ ctx.fillStyle='#d2b48c'; ctx.fillRect(gx+11*SCALE, gy+8*SCALE, 2*SCALE, 2*SCALE); }
    ctx.restore();
  }
  function drawTrap(x,y,ghost=false,armed=true){
    const gx=(x-8)*SCALE, gy=(y-8)*SCALE, s=16*SCALE;
    ctx.save(); if (ghost) ctx.globalAlpha=0.6;
    ctx.fillStyle='#555'; ctx.fillRect(gx, gy, s, s);
    ctx.strokeStyle=armed?'#ffb703':'#aaa'; ctx.lineWidth=2; ctx.strokeRect(gx+3*SCALE, gy+3*SCALE, 10*SCALE, 10*SCALE);
    ctx.restore();
  }
  function drawShelter(x, y, ghost=false){
    const gx=(x-8)*SCALE, gy=(y-8)*SCALE;
    ctx.save(); if (ghost) ctx.globalAlpha=0.6;
    ctx.fillStyle='#6b4d2e';
    ctx.fillRect(gx+2*SCALE, gy+8*SCALE, 2*SCALE, 6*SCALE);
    ctx.fillRect(gx+12*SCALE, gy+8*SCALE, 2*SCALE, 6*SCALE);
    ctx.fillStyle='#8a0';
    ctx.fillRect(gx+1*SCALE, gy+4*SCALE, 14*SCALE, 4*SCALE);
    ctx.restore();
  }
  function drawWorkbench(x,y,ghost=false){
    const gx=(x-8)*SCALE, gy=(y-8)*SCALE, s=16*SCALE;
    ctx.save(); if (ghost) ctx.globalAlpha=0.6;
    ctx.fillStyle='#6b4d2e'; ctx.fillRect(gx, gy+8*SCALE, s, 6*SCALE);
    ctx.fillStyle='#8b6a3a'; ctx.fillRect(gx, gy+4*SCALE, s, 4*SCALE);
    ctx.restore();
  }
  function drawFurnace(x,y,ghost=false){
    const gx=(x-8)*SCALE, gy=(y-8)*SCALE, s=16*SCALE;
    ctx.save(); if (ghost) ctx.globalAlpha=0.6;
    ctx.fillStyle='#444'; ctx.fillRect(gx, gy, s, s);
    ctx.fillStyle='#222'; ctx.fillRect(gx+4*SCALE, gy+6*SCALE, 8*SCALE, 6*SCALE);
    ctx.restore();
  }

  // Luz por pasos cuadrados para nitidez retro
  function pixelLight(ctx2, cx, cy, radius, alphas=[1,0.7,0.35]){
    const bands = alphas.length;
    for (let i=bands-1;i>=0;i--){
      const r = Math.floor(radius * (i+1) / bands);
      ctx2.globalAlpha = alphas[i];
      ctx2.fillRect(cx - r, cy - r, r*2, r*2);
    }
    ctx2.globalAlpha = 1;
  }

  function drawMinimap(){
    const mm=document.getElementById('minimap'); const mctx=mm.getContext('2d'); const mw=mm.width, mh=mm.height;
    mctx.fillStyle='#0b1320'; mctx.fillRect(0,0,mw,mh);
    mctx.fillStyle='#1e5fa7'; mctx.fillRect(water.x/WORLD.w*mw, water.y/WORLD.h*mh, water.w/WORLD.w*mw, water.h/WORLD.h*mh);
    mctx.fillStyle='#2c8a2e'; for (let i=0;i<trees.length;i+=3){ const t=trees[i]; const x=t.x/WORLD.w*mw, y=t.y/WORLD.h*mh; mctx.fillRect(x-1,y-1,2,2); }
    mctx.fillStyle='#ffa726'; for (const f of campfires){ const x=f.x/WORLD.w*mw, y=f.y/WORLD.h*mh; mctx.fillRect(x-1,y-1,2,2); }
    mctx.fillStyle='#e0e0e0'; mctx.fillRect(player.x/WORLD.w*mw-2, player.y/WORLD.h*mh-2, 4,4);
    mctx.strokeStyle='#9eb1ff'; mctx.lineWidth=1; 
    mctx.strokeRect(cam.x/WORLD.w*mw, cam.y/WORLD.h*mh, W/WORLD.w*mw, H/WORLD.h*mh);
  }

  // NPC interacción con diálogo centrado
  function interactNPC(){
    let who=null, dmin=9999;
    for (const n of npcs){
      const d = Math.hypot(player.x - n.x, player.y - n.y);
      if (d < dmin){ dmin = d; who = n; }
    }
    if (!who || dmin > 18) return false;

    if (!who.talked){
      showDialog([`<b>${who.name}</b>`, '¡Menos mal te encontré! ¿Tenés 5 de madera?']);
      who.talked = true; saveLS();
      return true;
    }
    if (!who.quest.done){
      if (player.wood >= who.quest.need){
        player.wood -= who.quest.need;
        who.quest.done = true;
        showDialog([`<b>${who.name}</b>`, '¡Gracias! Tomá, te doy <b>10 flechas</b>.']);
        player.arrows += 10; updateInvUI(); saveLS();
      } else {
        showDialog([`<b>${who.name}</b>`, `Aún te faltan <b>${who.quest.need - player.wood}</b> de madera.`]);
      }
      return true;
    }
    if (!who.quest.rewarded){
      who.quest.rewarded = true; saveLS();
      showDialog([`<b>${who.name}</b>`, 'Si hacés un barco, podés salir por el norte.']);
      return true;
    }
    showDialog([`<b>${who.name}</b>`, '¡Nos vemos!']);
    return true;
  }

  // Atajos desktop (manuales)
  addEventListener('keydown', (e)=>{ const k=e.key.toLowerCase(); if (k==='s') { saveLS(); toast('Guardado.'); } if (k==='l') { if(loadLS()) toast('Cargado.'); else toast('No hay guardado.'); } });

})();
