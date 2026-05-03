// ============================================================
//  LinguaPlay — Humans vs Monsters
// ============================================================
//  • Question + 4 answer buttons shown at top (outside canvas)
//  • Monsters spawn from cave on the LEFT, walk RIGHT
//  • Correct answer → Human spawns from house on the RIGHT, walks LEFT
//  • Wrong answer   → nearest monster grows big (enraged) for 6s
//  • When human meets monster: human punches/kicks monster away
//  • Enraged monster defeats any human it touches in one hit
//  • If monsters reach the house → lose a life, house shakes
//  • 3 lives, 90-second timer, score for each monster defeated
// ============================================================

const HumansGame = (() => {

  // ── Constants ──────────────────────────────────────────────
  const GAME_TIME       = 90;
  const MONSTER_INTERVAL= 4000;   // ms between monster spawns
  const HUMAN_SPEED     = 1.8;
  const MONSTER_SPEED   = 0.7;
  const ENRAGED_SPEED   = 1.3;
  const ENRAGED_DURATION= 180;    // frames (~6 s at 60fps)
  const FIGHT_RANGE     = 38;     // px — punch range
  const QUESTIONS_TOTAL = 10;
  const CANVAS_H        = 340;

  // Palette
  const C = {
    sky:     '#0d1b3e',
    ground:  '#1a3a1a',
    grass:   '#2d6a2d',
    cave:    '#1a1010',
    house:   '#3a2010',
    human:   ['#f9c846','#4ecdc4','#38bdf8','#84cc16'],
    monster: ['#ff6b6b','#a855f7','#fb923c','#e879f9'],
  };

  // ── State ──────────────────────────────────────────────────
  let words = [], wordIdx = 0;
  let currentWord = null;
  let options     = [];
  let answered    = false;

  let score  = 0, lives = 3, questionsAnswered = 0;
  let timeLeft = GAME_TIME;

  let humans   = [];
  let monsters = [];
  let particles= [];
  let floaters = [];    // floating +/- score text

  let monsterTimer = null;
  let gameTimer    = null;
  let animFrame    = null;
  let gameRunning  = false;
  let monsterSpawnMs = MONSTER_INTERVAL;

  // Canvas
  let canvas = null, ctx = null, W = 0, H = CANVAS_H;

  // Animation helpers
  let houseShake = 0;   // frames remaining
  let caveShake  = 0;

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    const { language, category, subcategory } = App.state;
    const raw = await App.getVocabulary(language, category, subcategory);
    if (!raw || raw.length < 4) { App.toast('Need at least 4 words for this game!', 'error'); return; }

    words    = App.shuffle([...raw]);
    wordIdx  = 0;
    score    = 0;
    lives    = 3;
    questionsAnswered = 0;
    timeLeft = GAME_TIME;
    humans   = [];
    monsters = [];
    particles= [];
    floaters = [];
    houseShake = 0;
    monsterSpawnMs = MONSTER_INTERVAL;
    gameRunning = false;

    clearInterval(monsterTimer);
    clearInterval(gameTimer);
    cancelAnimationFrame(animFrame);

    App.ActiveGame.register(() => {
      gameRunning = false;
      clearInterval(gameTimer);
      clearInterval(monsterTimer);
      cancelAnimationFrame(animFrame);
    });
    App.showPage('humans');
    requestAnimationFrame(() => requestAnimationFrame(setupGame));
  }

  // ── Setup ──────────────────────────────────────────────────
  function setupGame() {
    canvas = document.getElementById('humans-canvas');
    if (!canvas) return;
    W = canvas.offsetWidth || 800;
    H = CANVAS_H;
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');

    loadQuestion();
    startGameTimer();
    scheduleMonster();
    gameRunning = true;
    animFrame = requestAnimationFrame(loop);
  }

  // ── Question logic ─────────────────────────────────────────
  function loadQuestion() {
    if (wordIdx >= words.length) { wordIdx = 0; words = App.shuffle([...words]); }
    currentWord = words[wordIdx++];
    answered    = false;

    // Build 4 options: 1 correct + 3 random wrong
    const pool = words.filter(w => w.translation !== currentWord.translation);
    const wrongs = App.shuffle([...pool]).slice(0, 3);
    options = App.shuffle([currentWord, ...wrongs]);

    renderQuestion();
  }

  function renderQuestion() {
    const qEl = document.getElementById('hvm-question');
    if (qEl) {
      qEl.innerHTML = `<span style="color:var(--accent-sun);font-family:var(--font-display);font-size:1.8rem">${currentWord.word}</span>
        <span style="color:var(--text-muted);font-size:0.8rem;display:block;margin-top:2px;font-style:italic">${currentWord.hint}</span>`;
    }

    const btnsEl = document.getElementById('hvm-options');
    if (!btnsEl) return;
    btnsEl.innerHTML = options.map((opt, i) => `
      <button class="hvm-btn" id="hvm-opt-${i}" onclick="HumansGame.answer(${i})">
        <span class="hvm-btn-key">${['A','B','C','D'][i]}</span>
        ${opt.translation}
      </button>
    `).join('');
  }

  function answer(idx) {
    if (!gameRunning || answered) return;
    answered = true;
    questionsAnswered++;

    const chosen  = options[idx];
    const correct = chosen.translation === currentWord.translation;

    // Visual feedback on buttons
    options.forEach((_, i) => {
      const b = document.getElementById(`hvm-opt-${i}`);
      if (!b) return;
      b.disabled = true;
      if (options[i].translation === currentWord.translation) b.classList.add('hvm-correct');
      else if (i === idx && !correct)                          b.classList.add('hvm-wrong');
    });

    if (correct) {
      spawnHuman();
      score += 10;
      updateHUD();
      floatText(W - 80, H - 60, '+10', '#4ecdc4');
    } else {
      enrageNearestMonster();
      floatText(W / 2, H / 2, '😈 Wrong!', '#ff6b6b');
    }

    // Next question after short delay
    setTimeout(() => {
      if (!gameRunning) return;
      if (questionsAnswered >= QUESTIONS_TOTAL) { endGame(); return; }
      loadQuestion();
    }, 1100);
  }

  // ── Spawning ───────────────────────────────────────────────
  function spawnHuman() {
    const colorIdx = humans.length % C.human.length;
    humans.push({
      x:      W - 70,            // spawn near house
      y:      groundY() - 28,
      vx:     -HUMAN_SPEED,      // moves LEFT
      color:  C.human[colorIdx],
      state:  'walk',            // walk | fight | dead
      health: 3,
      frame:  0,
      anim:   0,
      attackCooldown: 0,
      punchAnim: 0,
    });
  }

  function scheduleMonster() {
    clearInterval(monsterTimer);
    monsterTimer = setInterval(spawnMonster, monsterSpawnMs);
    spawnMonster(); // immediate first
  }

  function spawnMonster() {
    if (!gameRunning) return;
    const colorIdx = monsters.length % C.monster.length;
    monsters.push({
      x:       60,               // spawn near cave
      y:       groundY() - 26,
      vx:      MONSTER_SPEED,   // moves RIGHT
      color:   C.monster[colorIdx],
      state:   'walk',           // walk | enraged | dead | flying
      enrageTimer: 0,
      frame:   0,
      anim:    0,
      flyVx:   0,
      flyVy:   0,
      scale:   1,
    });
  }

  function enrageNearestMonster() {
    if (!monsters.length) return;
    const alive = monsters.filter(m => m.state === 'walk');
    if (!alive.length) return;
    // Pick the rightmost one (closest to house)
    const target = alive.reduce((a, b) => a.x > b.x ? a : b);
    target.state       = 'enraged';
    target.enrageTimer = ENRAGED_DURATION;
    target.vx          = ENRAGED_SPEED;
    caveShake = 15;
  }

  // ── Ground helpers ─────────────────────────────────────────
  function groundY() { return H - 55; }

  // ── Main loop ──────────────────────────────────────────────
  function loop() {
    if (!gameRunning) return;
    update();
    draw();
    animFrame = requestAnimationFrame(loop);
  }

  function update() {
    // Animate shakes
    if (houseShake > 0) houseShake--;
    if (caveShake  > 0) caveShake--;

    // Update monsters
    for (let i = monsters.length - 1; i >= 0; i--) {
      const m = monsters[i];
      m.anim++;

      if (m.state === 'dead') { monsters.splice(i, 1); continue; }

      if (m.state === 'flying') {
        m.x  += m.flyVx;
        m.y  += m.flyVy;
        m.flyVy += 0.4;
        m.flyVx *= 0.96;
        if (m.y > H + 60) { monsters.splice(i, 1); }
        continue;
      }

      if (m.state === 'enraged') {
        m.enrageTimer--;
        m.scale = 1 + 0.5 * Math.sin(m.anim * 0.15);  // pulsing big
        if (m.enrageTimer <= 0) { m.state = 'walk'; m.vx = MONSTER_SPEED; m.scale = 1; }
      }

      m.x += m.vx;

      // Monster reached house → lose life
      if (m.x > W - 55) {
        monsters.splice(i, 1);
        loseLife();
        continue;
      }
    }

    // Update humans
    for (let i = humans.length - 1; i >= 0; i--) {
      const h = humans[i];
      h.anim++;
      if (h.attackCooldown > 0) h.attackCooldown--;
      if (h.punchAnim     > 0) h.punchAnim--;

      if (h.state === 'dead') { humans.splice(i, 1); continue; }

      h.x += h.vx;

      // Human gone off left edge (cave) → remove (shouldn't happen but safety)
      if (h.x < -40) { humans.splice(i, 1); continue; }

      // Fight: check collision with monsters
      for (let j = monsters.length - 1; j >= 0; j--) {
        const m = monsters[j];
        if (m.state === 'flying' || m.state === 'dead') continue;

        const dist = Math.abs(h.x - m.x);
        if (dist < FIGHT_RANGE) {
          h.state = 'fight';
          m.state === 'walk' && (m.vx = 0);

          if (m.state === 'enraged') {
            // Enraged monster defeats human instantly
            h.state = 'dead';
            spawnParticles(h.x, h.y, h.color, 14);
            floatText(h.x, h.y - 20, '💀', '#ff6b6b');
          } else {
            // Human punches monster
            if (h.attackCooldown <= 0) {
              h.attackCooldown = 40;
              h.punchAnim = 12;
              m.health = (m.health || 2) - 1;
              spawnParticles(m.x, m.y, '#f9c846', 8);
              if (m.health <= 0) {
                // Monster sent flying
                m.state = 'flying';
                m.flyVx = -5 - Math.random() * 3;
                m.flyVy = -8 - Math.random() * 4;
                score += 30;
                updateHUD();
                floatText(m.x, m.y - 20, '+30', '#f9c846');
                // Human keeps walking
                h.state = 'walk';
              }
            }
          }
          break; // one monster at a time
        } else if (h.state === 'fight') {
          h.state = 'walk';
        }
      }

      if (h.state === 'walk') h.x += h.vx; // extra move when not fighting
    }

    // Particles + floaters
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y -= 1; f.life--;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  // ── Drawing ────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);

    drawBackground();
    drawCave();
    drawHouse();
    monsters.forEach(drawMonster);
    humans.forEach(drawHuman);
    drawParticles();
    drawFloaters();
  }

  function drawBackground() {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d1b3e');
    sky.addColorStop(0.7, '#1a2e1a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let s of BG_STARS) { ctx.beginPath(); ctx.arc(s.x*W, s.y*(H*0.6), s.r, 0, Math.PI*2); ctx.fill(); }

    // Ground
    ctx.fillStyle = '#1c3c1c';
    ctx.fillRect(0, groundY() + 28, W, H);

    // Grass strip
    ctx.fillStyle = '#2d6a2d';
    ctx.fillRect(0, groundY() + 24, W, 10);

    // Midground hills
    ctx.fillStyle = '#1a3a1a';
    ctx.beginPath();
    ctx.ellipse(W*0.3, groundY()+28, 120, 40, 0, Math.PI, 0);
    ctx.ellipse(W*0.7, groundY()+28, 100, 35, 0, Math.PI, 0);
    ctx.fill();
  }

  // Pre-generate star positions
  const BG_STARS = Array.from({length:40}, () => ({x:Math.random(), y:Math.random(), r:0.5+Math.random()*1.2}));

  function drawCave() {
    const cx = 30, cy = groundY() + 28;
    const shake = caveShake > 0 ? Math.sin(caveShake * 1.5) * 3 : 0;

    ctx.save();
    ctx.translate(shake, 0);

    // Rocky hill
    ctx.fillStyle = '#2a1a0a';
    ctx.beginPath();
    ctx.ellipse(cx + 10, cy, 55, 55, 0, Math.PI, 0);
    ctx.fill();

    // Cave opening
    ctx.fillStyle = '#0a0808';
    ctx.beginPath();
    ctx.ellipse(cx + 10, cy + 2, 22, 28, 0, Math.PI, 0);
    ctx.fill();

    // Dripping stalactites
    ctx.fillStyle = '#3a2010';
    for (let i = 0; i < 4; i++) {
      const sx = cx - 12 + i * 12;
      ctx.beginPath();
      ctx.moveTo(sx - 4, cy - 26);
      ctx.lineTo(sx + 4, cy - 26);
      ctx.lineTo(sx,     cy - 14);
      ctx.closePath();
      ctx.fill();
    }

    // Label
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👹 CAVE', cx + 10, cy - 60);

    ctx.restore();
  }

  function drawHouse() {
    const hx = W - 50, hy = groundY() + 28;
    const shake = houseShake > 0 ? Math.sin(houseShake * 1.5) * 4 : 0;

    ctx.save();
    ctx.translate(shake, 0);

    // House body
    ctx.fillStyle = '#5c3d1e';
    ctx.fillRect(hx - 38, hy - 58, 76, 58);

    // Roof
    ctx.fillStyle = '#8b2020';
    ctx.beginPath();
    ctx.moveTo(hx - 46, hy - 58);
    ctx.lineTo(hx,      hy - 90);
    ctx.lineTo(hx + 46, hy - 58);
    ctx.closePath();
    ctx.fill();

    // Chimney
    ctx.fillStyle = '#6b3010';
    ctx.fillRect(hx + 14, hy - 95, 14, 30);
    // Smoke puff
    const t = Date.now() / 800;
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#aaa';
    ctx.beginPath(); ctx.arc(hx+21, hy-98 - (t%1)*12, 6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx+18, hy-105- (t%1)*14, 4, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    // Door
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(hx - 10, hy - 32, 20, 32);
    ctx.fillStyle = '#f9c846';
    ctx.beginPath(); ctx.arc(hx + 6, hy - 16, 2, 0, Math.PI*2); ctx.fill();

    // Window
    ctx.fillStyle = '#ffeaa0';
    ctx.fillRect(hx - 30, hy - 50, 18, 16);
    ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 2;
    ctx.strokeRect(hx - 30, hy - 50, 18, 16);

    // Label
    ctx.fillStyle = '#4ecdc4';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏠 HOME', hx, hy - 98);

    ctx.restore();
  }

  function drawHuman(h) {
    if (h.state === 'dead') return;
    const { x, y, color, anim, punchAnim, state } = h;

    ctx.save();
    ctx.translate(x, y);

    // Walk bob
    const bob = state === 'walk' ? Math.sin(anim * 0.18) * 2 : 0;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.ellipse(0, 28 + bob, 14, 5, 0, 0, Math.PI*2); ctx.fill();

    // Body
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(-9, -10 + bob, 18, 24, 4); ctx.fill();

    // Head
    ctx.fillStyle = '#fdbcb4';
    ctx.beginPath(); ctx.arc(0, -18 + bob, 10, 0, Math.PI*2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(-3, -19 + bob, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 3, -19 + bob, 2, 0, Math.PI*2); ctx.fill();

    // Smile
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -16 + bob, 4, 0.2, Math.PI - 0.2); ctx.stroke();

    // Legs (walking animation)
    const legSwing = state === 'walk' ? Math.sin(anim * 0.18) * 12 : 0;
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, 14 + bob); ctx.lineTo(-4 - legSwing, 28 + bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 4, 14 + bob); ctx.lineTo( 4 + legSwing, 28 + bob); ctx.stroke();

    // Arm punch animation
    if (punchAnim > 0) {
      const ext = punchAnim / 12;
      ctx.strokeStyle = '#fdbcb4'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-9, -4 + bob); ctx.lineTo(-9 - 20*ext, -4 + bob); ctx.stroke();
      // Fist
      ctx.fillStyle = '#fdbcb4';
      ctx.beginPath(); ctx.arc(-9 - 20*ext, -4 + bob, 5, 0, Math.PI*2); ctx.fill();
      // Impact stars
      if (ext > 0.6) {
        ctx.fillStyle = '#f9c846'; ctx.font = '14px sans-serif';
        ctx.fillText('💥', -36 - 20*ext, -8 + bob);
      }
    } else {
      // Normal arms
      ctx.strokeStyle = '#fdbcb4'; ctx.lineWidth = 4;
      const armSwing = state === 'walk' ? Math.sin(anim * 0.18) * 8 : 0;
      ctx.beginPath(); ctx.moveTo(-9, -4 + bob); ctx.lineTo(-14 + armSwing, 8 + bob); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( 9, -4 + bob); ctx.lineTo( 14 - armSwing, 8 + bob); ctx.stroke();
    }

    ctx.restore();
  }

  function drawMonster(m) {
    if (m.state === 'dead') return;
    const { x, y, color, anim, state, scale, flyVx, flyVy } = m;

    ctx.save();
    ctx.translate(x, y);
    if (state === 'flying') {
      // Tumble
      ctx.rotate((anim * 0.15));
    }
    ctx.scale(scale, scale);

    const bob = state !== 'flying' ? Math.sin(anim * 0.14) * 2 : 0;
    const enraged = state === 'enraged';

    // Glow for enraged
    if (enraged) {
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur  = 20 + Math.sin(anim * 0.3) * 10;
    }

    // Shadow
    if (state !== 'flying') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.ellipse(0, 26+bob, 14, 4, 0, 0, Math.PI*2); ctx.fill();
    }

    // Body (blob shape)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -6+bob, 14, 18, 0, 0, Math.PI*2);
    ctx.fill();

    // Head (bigger, scary)
    ctx.fillStyle = enraged ? '#ff2200' : color;
    ctx.beginPath();
    ctx.ellipse(0, -22+bob, enraged ? 16 : 13, enraged ? 16 : 13, 0, 0, Math.PI*2);
    ctx.fill();

    // Horns
    ctx.fillStyle = '#8b0000';
    const hornH = enraged ? 12 : 8;
    ctx.beginPath(); ctx.moveTo(-8, -30+bob); ctx.lineTo(-11, -30-hornH+bob); ctx.lineTo(-5, -28+bob); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo( 8, -30+bob); ctx.lineTo( 11, -30-hornH+bob); ctx.lineTo(  5, -28+bob); ctx.closePath(); ctx.fill();

    // Eyes — angry slanted
    ctx.fillStyle = enraged ? '#ffff00' : '#ff4444';
    ctx.beginPath(); ctx.ellipse(-5, -23+bob, 4, 3, enraged ? -0.4 : 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 5, -23+bob, 4, 3, enraged ? 0.4 : 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-5, -23+bob, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 5, -23+bob, 2, 0, Math.PI*2); ctx.fill();

    // Mouth (fangs)
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, -16+bob, 5, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-5,-16+bob); ctx.lineTo(-3,-12+bob); ctx.lineTo(-1,-16+bob); ctx.fill();
    ctx.beginPath(); ctx.moveTo( 1,-16+bob); ctx.lineTo( 3,-12+bob); ctx.lineTo( 5,-16+bob); ctx.fill();

    // Arms (flailing)
    const armWave = Math.sin(anim * 0.2) * 15;
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, -8+bob); ctx.lineTo(-22, -2+bob+armWave); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 14, -8+bob); ctx.lineTo( 22, -2+bob-armWave); ctx.stroke();

    // Legs
    const legSwing = state !== 'flying' ? Math.sin(anim * 0.14) * 10 : 0;
    ctx.strokeStyle = color; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-5, 10+bob); ctx.lineTo(-5-legSwing, 24+bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 5, 10+bob); ctx.lineTo( 5+legSwing, 24+bob); ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Particles & floaters ───────────────────────────────────
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 1.5 + Math.random() * 4;
      particles.push({ x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed-2, life:30+Math.random()*20|0, color });
    }
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = p.life / 50;
      ctx.fillStyle   = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function floatText(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 60 });
  }

  function drawFloaters() {
    floaters.forEach(f => {
      ctx.globalAlpha = f.life / 60;
      ctx.fillStyle   = f.color;
      ctx.font        = 'bold 16px "Nunito", sans-serif';
      ctx.textAlign   = 'center';
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
  }

  // ── Life loss ──────────────────────────────────────────────
  function loseLife() {
    lives--;
    updateHUD();
    houseShake = 20;
    App.toast('👹 Monster reached the house!', 'error', 1500);
    if (lives <= 0) endGame();
  }

  // ── HUD ────────────────────────────────────────────────────
  function updateHUD() {
    const s = document.getElementById('hvm-score');
    const l = document.getElementById('hvm-lives');
    if (s) s.textContent = score;
    if (l) l.textContent = '❤️'.repeat(Math.max(0,lives)) + '🖤'.repeat(Math.max(0,3-lives));
  }

  // ── Timer ──────────────────────────────────────────────────
  function startGameTimer() {
    setTimerEl(timeLeft);
    gameTimer = setInterval(() => {
      timeLeft--;
      setTimerEl(timeLeft);
      // Speed up monsters as time progresses
      if (timeLeft % 20 === 0 && timeLeft > 0) {
        monsterSpawnMs = Math.max(1800, monsterSpawnMs - 400);
        scheduleMonster();
      }
      if (timeLeft <= 0) endGame();
    }, 1000);
  }

  function setTimerEl(t) {
    const el = document.getElementById('hvm-timer');
    if (el) el.textContent = `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
  }

  // ── End ────────────────────────────────────────────────────
  function endGame() {
    if (!gameRunning) return;
    App.ActiveGame.register(null);
    gameRunning = false;
    clearInterval(gameTimer);
    clearInterval(monsterTimer);
    cancelAnimationFrame(animFrame);

    UI.showResults({
      score,
      correct: Math.floor(score / 40),
      total:   QUESTIONS_TOTAL,
      timeLeft,
      maxTime: GAME_TIME,
      gameType: 'humans'
    });
  }

  return { init, answer };
})();
