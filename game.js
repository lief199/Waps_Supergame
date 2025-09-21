(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // -------------------- UI Elements --------------------
  const ui = {
    p1hp: document.querySelector('#p1hp .fill'),
    p1st: document.querySelector('#p1st .fill'),
    p2hp: document.querySelector('#p2hp .fill'),
    p2st: document.querySelector('#p2st .fill'),
    timer: document.getElementById('timer')
  };

  // -------------------- Overlay Screens --------------------
  const startScreen = document.getElementById('startScreen');
  const startBtn = document.getElementById('startBtn');
  const rematchScreen = document.getElementById('rematchScreen');
  const rematchBtn = document.getElementById('rematchBtn');
  const rematchMessage = document.getElementById('rematchMessage');
  const rematchLeaderboardEl = document.getElementById('rematchLeaderboard');
  const menuBtn = document.getElementById('menuBtn');

  // -------------------- Player name state --------------------
  let player1Name = 'P1';
  let player2Name = 'P2';
  let gameStarted = false;
  let paused = true;
  let lastWinnerName = ''; // store last winner for rematch API

  // -------------------- Center Screens --------------------
  function centerScreen(screen) {
    screen.style.display = 'flex';
    screen.style.top = '50%';
    screen.style.left = '50%';
    screen.style.transform = 'translate(-50%, -50%)';
  }
  function showStartScreen() { centerScreen(startScreen); }
  function showRematchScreen(winner) {
    lastWinnerName = winner;
    rematchMessage.textContent = winner + " Wins!";
    centerScreen(rematchScreen);
    paused = true;
  }

  // -------------------- Game Start --------------------
  startBtn.addEventListener('click', () => {
    const n1 = document.getElementById('player1Name');
    const n2 = document.getElementById('player2Name');
    player1Name = (n1 && n1.value.trim()) ? n1.value.trim() : 'P1';
    player2Name = (n2 && n2.value.trim()) ? n2.value.trim() : 'P2';

    const p1Label = document.getElementById('p1NameLabel');
    const p2Label = document.getElementById('p2NameLabel');
    if(p1Label) p1Label.textContent = `${player1Name} (Sky Blue)`;
    if(p2Label) p2Label.textContent = `${player2Name} (Orange)`;

    startScreen.style.display = 'none';
    gameStarted = true;
    paused = false;
    resetGame(true);
  });

  // -------------------- Rematch Button --------------------
  rematchBtn.addEventListener('click', () => {
    rematchScreen.style.display = 'none';
    if(lastWinnerName) saveMatchResult(lastWinnerName);

    if (p1Wins >= 2 || p2Wins >= 2) {
      resetGame(true);  
    } else {
      resetRound(true); 
    }

    gameStarted = true; 
    paused = false;     
    updatePauseMenu();
  });

  // -------------------- Menu Button --------------------
  if(menuBtn) {
    menuBtn.addEventListener('click', () => {
      rematchScreen.style.display = 'none';
      showStartScreen();
      paused = true;
    });
  }

  // -------------------- Load Sprites --------------------
  const P1sprites = {
    idle: Object.assign(new Image(), { src: 'images/blue.png' }),
    left: Object.assign(new Image(), { src: 'images/blue-leftjab.png' }),
    right: Object.assign(new Image(), { src: 'images/blue-rightjab.png' }),
    shield: Object.assign(new Image(), { src: 'images/blue-shield.png' })
  };
  const P2sprites = {
    idle: Object.assign(new Image(), { src: 'images/red.png' }),
    left: Object.assign(new Image(), { src: 'images/red-left.png' }),
    right: Object.assign(new Image(), { src: 'images/red-right.png' }),
    shield: Object.assign(new Image(), { src: 'images/red-shield.png' })
  };

  // -------------------- World & Game State --------------------
  const WORLD = { w: canvas.width, h: canvas.height, floorY: 460, ringPad: 60 };
  let showHitboxes = false, roundTime = 99, lastSecTick = 0;
  let countdown = 0, countdownActive = false;
  let roundNumber = 1, maxRounds = 3, p1Wins = 0, p2Wins = 0, roundActive = false;

  const Keys = { a:false,d:false,f:false,g:false,w:false,ArrowUp:false,
                 ArrowLeft:false,ArrowRight:false,period:false,slash:false,
                 Enter:false,r:false,o:false };

  const KeyMap = {
    'KeyA':'a','KeyD':'d','KeyF':'f','KeyG':'g','KeyW':'w',
    'ArrowLeft':'ArrowLeft','ArrowRight':'ArrowRight','Period':'period','Slash':'slash','ArrowUp':'ArrowUp',
    'Enter':'Enter','KeyR':'r','KeyO':'o'
  };

  addEventListener('keydown', e => {
    const k = KeyMap[e.code]; if(!k) return;
    if(['Enter','h'].includes(k)) e.preventDefault();
    Keys[k]=true;
    if(k==='Enter'){ paused=!paused; updatePauseMenu(); }
    if(k==='o') showHitboxes=!showHitboxes;
    if(k==='r') resetGame();
  });
  addEventListener('keyup', e => { const k = KeyMap[e.code]; if(k) Keys[k]=false; });

  // -------------------- Attacks --------------------
  const ATTACKS = {
    leftJab:{ damage:10, range:45, width:15, height:10, windup:150, active:120, recover:180, knockback:3.5, stamCost:6 },
    rightJab:{ damage:10.5, range:45, width:15 , height:10, windup:150, active:120, recover:180, knockback:3, stamCost:7 }
  };
  const COVER = { reduce:0.4, stamPerHit:12, stamPerTick:8/60, pushback:8 };
  const STAM = { max:100, regen:12/60, cooldown:700 };

  function createPlayer(x, name, sprites){
    return {x, y:WORLD.floorY-120, w:60, h:120, dir:1, vx:0, speed:0.4,
            maxHP:100, hp:100, maxStam:STAM.max, stam:STAM.max, stamLock:0,
            attacking:null, attackTimer:0, hasHit:false, covering:false, hitstun:0,
            coverTimer:0, name, sprites};
  }

  const P1 = createPlayer(WORLD.ringPad+60, player1Name, P1sprites);
  const P2 = createPlayer(WORLD.w-WORLD.ringPad-120, player2Name, P2sprites); P2.dir=-1;

  // -------------------- Pause Menu --------------------
  function updatePauseMenu(){ document.getElementById('pauseMenu').style.display = paused?'flex':'none'; }
  document.getElementById('resumeBtn').addEventListener('click', ()=>{ paused=false; updatePauseMenu(); });

  // -------------------- Scoreboard --------------------
  function updateScoreboard(){
    document.getElementById('p1score').textContent = `${player1Name} Wins: ${p1Wins}`;
    document.getElementById('p2score').textContent = `${player2Name} Wins: ${p2Wins}`;
    document.getElementById('round').textContent = `Round: ${roundNumber} / ${maxRounds}`;
  }

  // -------------------- Reset / Round --------------------
  function resetRound(startCountdownFlag = false){
    Object.assign(P1, createPlayer(WORLD.ringPad+60, player1Name, P1sprites));
    Object.assign(P2, createPlayer(WORLD.w-WORLD.ringPad-120, player2Name, P2sprites)); P2.dir=-1;
    roundTime=99; lastSecTick=0; updateScoreboard();
    if(startCountdownFlag) startCountdown();
  }
  function resetGame(startCountdownFlag = false){
    roundNumber=1; p1Wins=0; p2Wins=0;
    resetRound(startCountdownFlag);
  }
  function startCountdown(){
    countdown=3; countdownActive=true; paused=true; roundActive=false;
    let interval=setInterval(()=>{
      if(countdown>1) countdown--;
      else { clearInterval(interval); countdown="FIGHT!";
             setTimeout(()=>{countdownActive=false; paused=false; roundActive=true;},1000); }
    },1000);
  }

  // -------------------- Utility --------------------
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const rectsOverlap=(a,b)=>a && b && a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
  function makeHurtbox(p){ return { x:p.x+p.w*0.25, y:p.y+p.h*0.1, w:p.w*0.5, h:p.h*0.9 }; }
  function makeHitbox(p, kind) {
    const def = ATTACKS[kind]; if(!def) return null;
    const w = def.range - def.width;
    const h = def.height;
    const x = p.dir === 1 ? p.x + p.w - 35 : p.x + 35 - w;
    return { x, y: p.y + p.h*0.25, w, h };
  }

  // -------------------- Input Handling --------------------
  function readInputs(){ return {
    p1:{left:Keys.a,right:Keys.d,leftJab:Keys.f,rightJab:Keys.g,cover:Keys.w},
    p2:{left:Keys.ArrowLeft,right:Keys.ArrowRight,leftJab:Keys.period,rightJab:Keys.slash,cover:Keys.ArrowUp}
  }; }
  let prev={p1:{},p2:{}};
  function getPresses(inputs){
    const out={p1:{},p2:{}};
    for(const side of ['p1','p2']){
      for(const k in inputs[side]) out[side][k]=inputs[side][k]&&!prev[side][k];
    }
    prev=JSON.parse(JSON.stringify(inputs));
    return out;
  }

  // -------------------- Attack Logic --------------------
  function tryStartAttack(p,kind){
    const def = ATTACKS[kind]; if(!def) return;
    if(p.attacking||p.hitstun>0||p.stam<def.stamCost) return;
    p.attacking=kind; p.attackTimer=0; p.hasHit=false; p.stam-=def.stamCost; p.stamLock=STAM.cooldown;
  }
  function applyHit(attacker,defender,kind){
    const def = ATTACKS[kind]; if(!def) return;
    let dmg = def.damage;
    if(defender.covering && defender.stam>0){
      defender.stam=Math.max(0,defender.stam-COVER.stamPerHit);
      defender.x+=defender.dir*-COVER.pushback;
      dmg*=COVER.reduce;
    }
    defender.hp=Math.max(0,defender.hp-dmg);
    defender.hitstun=240; defender.vx=(attacker.dir===1?1:-1)*def.knockback;
  }

  // -------------------- Player Tick --------------------
  function tickPlayer(p,inps,presses,opp,dt){
    if(p.hitstun>0){ p.hitstun-=dt; p.x+=p.vx; p.vx*=0.8; return; }
    p.covering=inps.cover;
    if(!p.attacking && p.stam>0){ if(inps.left){p.x-=p.speed*dt;p.dir=-1;} if(inps.right){p.x+=p.speed*dt;p.dir=1;} }
    if(presses.leftJab) tryStartAttack(p,'leftJab');
    if(presses.rightJab) tryStartAttack(p,'rightJab');

    if(p.attacking){
      p.attackTimer+=dt;
      const def=ATTACKS[p.attacking]; const t=p.attackTimer;
      if(t>def.windup && t<=def.windup+def.active && !p.hasHit){
        const hb=makeHitbox(p,p.attacking);
        if(rectsOverlap(hb,makeHurtbox(opp))){ applyHit(p,opp,p.attacking); p.hasHit=true; }
      }
      if(t>def.windup+def.active+def.recover){ p.attacking=null; p.attackTimer=0; }
    }

    if(p.stam<STAM.max){ p.stamLock>0?p.stamLock-=dt:p.stam=Math.min(STAM.max,p.stam+STAM.regen*dt); }
    p.x=clamp(p.x,WORLD.ringPad,WORLD.w-WORLD.ringPad-p.w);
    if(p.covering){ p.stam=Math.max(0,p.stam-COVER.stamPerTick*dt); p.coverTimer=(p.coverTimer||0)+dt; } else p.coverTimer=0;
  }

  // -------------------- KO / Round End --------------------
  function checkKO(){
    if(!roundActive || !gameStarted) return;
    if(P1.hp <= 0){
      roundActive = false;
      p2Wins++;
      updateScoreboard();
      endRound(player2Name);
    }
    else if(P2.hp <= 0){
      roundActive = false;
      p1Wins++;
      updateScoreboard();
      endRound(player1Name);
    }
  }

  function endRound(winnerName) {
    countdown = "K.O!";
    countdownActive = true;
    roundActive = false;

    setTimeout(() => {
      countdownActive = false;
      const winsNeeded = Math.ceil(maxRounds / 2);

      if (p1Wins >= winsNeeded || p2Wins >= winsNeeded) {
        saveMatchResult(winnerName);
        getLeaderboard();
        showRematchScreen(winnerName);
        paused = true;
        gameStarted = false;
      } else {
        roundNumber++;
        resetRound(true);
      }
    }, 1500);
  }

  // -------------------- Draw / UI Functions --------------------
  function drawRing(){
    ctx.fillStyle="#3b4a5a"; ctx.fillRect(0,WORLD.floorY,WORLD.w,WORLD.h-WORLD.floorY);
    ctx.fillStyle="#2f6fab"; ctx.fillRect(40,WORLD.floorY-20,WORLD.w-80,20);
    ctx.strokeStyle="#d9d9d9"; ctx.lineWidth=4;
    for(let i=0;i<3;i++){
      let y=WORLD.floorY-40-i*20;
      ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(WORLD.w-40,y); ctx.stroke();
    }
    ctx.fillStyle="#bfbfbf";
    ctx.fillRect(30,WORLD.floorY-160,20,160);
    ctx.fillRect(WORLD.w-50,WORLD.floorY-160,20,160);
  }

  function drawPlayer(p){
  // choose sprite
  let img = p.covering ? p.sprites.shield :
            p.attacking === 'leftJab' ? p.sprites.left :
            p.attacking === 'rightJab' ? p.sprites.right :
            p.sprites.idle;

  // ensure image is loaded
  if(img){
    if(!img.complete) img.onload = ()=>{}; // force load
    const frameCount = 4;
    const frameHeight = img.height / (frameCount || 1); // avoid division by 0
    let frame = 0;

    if(p.attacking){
      const def = ATTACKS[p.attacking];
      const total = def.windup + def.active + def.recover;
      frame = Math.floor((p.attackTimer / total) * frameCount);
      if(frame >= frameCount) frame = frameCount - 1;
    } else if(p.covering){
      const progress = Math.min(1, (p.coverTimer || 0) / 200);
      frame = Math.floor(progress * (frameCount - 1));
    } else {
      frame = Math.floor(Date.now() / 200) % frameCount;
    }

    ctx.save();
    ctx.globalAlpha = 0.95;

    // draw according to direction
    if(p.dir === 1){
      ctx.translate(p.x + p.w, p.y);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(p.x, p.y);
    }

    ctx.drawImage(img, 0, frame * frameHeight, img.width, frameHeight, 0, 0, p.w, p.h);
    ctx.restore();
  } else {
    // fallback rectangle if image not ready
    ctx.fillStyle = "#fff";
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }

  // draw hitboxes if enabled
  if(showHitboxes){
    const hurt = makeHurtbox(p);
    ctx.strokeStyle = "lime";
    ctx.strokeRect(hurt.x, hurt.y, hurt.w, hurt.h);
    if(p.attacking){
      const hb = makeHitbox(p, p.attacking);
      if(hb){ ctx.strokeStyle = "red"; ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); }
    }
  }
}


  function updateUI(){ 
    ui.p1hp.style.width=`${P1.hp}%`; 
    ui.p1st.style.width=`${P1.stam}%`; 
    ui.p2hp.style.width=`${P2.hp}%`; 
    ui.p2st.style.width=`${P2.stam}%`; 
    ui.timer.textContent = roundTime; 
  }

  // -------------------- Leaderboard API --------------------
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx7zkKnhE5dRqEYgfZl3tgJ6a60F9DQOiSQ9L_m4rFStQm_A4cTanCiWWOeuYynG-tBGQ/exec";

  async function saveMatchResult(winnerName) {
  try {
    const response = await fetch(SCRIPT_URL + '?winner=' + encodeURIComponent(winnerName));
    const result = await response.json();
    console.log('Match saved:', result);
  } catch (err) {
    console.error('Failed to save match:', err);
  }
}

async function getLeaderboard() {
  try {
    const response = await fetch(SCRIPT_URL); // remove ?action=getLeaderboard
    const data = await response.json();

    if (!data || !Array.isArray(data)) return;

    rematchLeaderboardEl.innerHTML = '';
    data.forEach(entry => {
      const div = document.createElement('div');
      div.textContent = `${entry.name}: ${entry.wins}`;
      rematchLeaderboardEl.appendChild(div);
    });

  } catch (err) {
    console.error('Failed to load leaderboard:', err);
  }
}



  // -------------------- Main Loop --------------------
  let last=0;
  function loop(ts){
    if(!last) last=ts; let dt=ts-last; last=ts;
    if(!paused && gameStarted){
      let inputs=readInputs();
      let presses=getPresses(inputs);
      tickPlayer(P1,inputs.p1,presses.p1,P2,dt);
      tickPlayer(P2,inputs.p2,presses.p2,P1,dt);
      checkKO();
    }

    ctx.clearRect(0,0,WORLD.w,WORLD.h);
    drawRing(); drawPlayer(P1); drawPlayer(P2);

    if(countdownActive){
      ctx.save(); ctx.font="bold 100px Arial Black"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.lineWidth=8;
      if(countdown==="FIGHT!"){ const pulse=(Math.sin(Date.now()/150)+1)/2; ctx.fillStyle=`rgb(${200+pulse*55},0,0)`; ctx.strokeStyle="black"; }
      else ctx.fillStyle="yellow", ctx.strokeStyle="black";
      ctx.strokeText(countdown,WORLD.w/2,WORLD.h/2); ctx.fillText(countdown,WORLD.w/2,WORLD.h/2); ctx.restore();
    }

    updateUI(); updateScoreboard();
    if(!paused && ts-lastSecTick>1000){ roundTime=Math.max(0,roundTime-1); lastSecTick=ts; }

    requestAnimationFrame(loop);
  }

  // -------------------- Init --------------------
  showStartScreen();
  const p1LabelInit = document.getElementById('p1NameLabel');
  const p2LabelInit = document.getElementById('p2NameLabel');
  if(p1LabelInit) p1LabelInit.textContent = `${player1Name} (Sky Blue)`;
  if(p2LabelInit) p2LabelInit.textContent = `${player2Name} (Orange)`;

  resetGame(false);
  getLeaderboard();
  requestAnimationFrame(loop);
})();
