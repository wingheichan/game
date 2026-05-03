// ============================================================
//  LinguaPlay — Space Invaders Game
// ============================================================
//
//  RULES
//  ─────
//  • The foreign word / question is shown at the top.
//  • 1 row of 10 alien ships, each carrying one letter.
//  • The answer letters are all present among the 10 ships.
//  • Remaining slots filled with "confuser" letters —
//    letters that sound similar (S↔C, K↔C, F↔PH, etc.)
//  • Aliens march left-right and slowly descend.
//  • Player moves a cannon left/right and shoots.
//  • You must shoot the answer letters IN ORDER.
//  • Shooting a wrong ship costs a life and the aliens
//    speed up briefly as punishment.
//  • When all answer letters are shot in order → next word.
//  • 3 lives, 90-second countdown.
//  • Runs on a <canvas> element for smooth animation.
// ============================================================

const InvadersGame = (() => {

  // ── Tunables ────────────────────────────────────────────────
  const GAME_TIME    = 90;
  const ALIEN_COLS   = 10;
  const ALIEN_ROWS   = 1;          // single row
  const LIVES_START  = 3;
  const BULLET_SPEED = 10;
  const ALIEN_DROP   = 10;         // px dropped each time they hit a wall
  const SPEED_INIT   = 0.6;        // px per frame horizontal
  const SPEED_STEP   = 0.15;       // added on wrong shot
  const SPEED_MAX    = 2.5;

  // Similar-sound confuser map  (key → possible confusers)
  const CONFUSERS = {
    S:['C','Z'],  C:['S','K'],  K:['C','Q'],  Q:['K','C'],
    F:['V','P'],  V:['F','B'],  B:['P','V'],  P:['B','F'],
    D:['T'],      T:['D'],      G:['J'],      J:['G'],
    N:['M'],      M:['N'],      L:['R'],      R:['L'],
    A:['E'],      E:['A','I'],  I:['E','Y'],  Y:['I'],
    O:['U'],      U:['O'],      W:['V'],      X:['Z'],
    H:['A'],      Z:['S','X'],
  };

  // Alien ship SVG glyphs (5 designs, cycled by column)
  const SHIP_GLYPHS = [
    // design 0 – classic invader
    `<polygon points="4,18 16,18 16,14 20,14 20,10 24,10 24,4 20,4 20,0 12,0 12,4 8,4 8,0 0,0 0,4 4,4 4,10 8,10 8,14 4,14" fill="currentColor"/>`,
    // design 1 – crab
    `<path d="M2,16 Q4,8 8,8 L12,4 L16,8 Q20,8 22,16 L18,18 L18,14 L12,12 L6,14 L6,18 Z" fill="currentColor"/>`,
    // design 2 – squid
    `<path d="M8,0 L16,0 L18,6 L22,4 L20,10 L22,18 L16,16 L12,20 L8,16 L2,18 L4,10 L2,4 L6,6 Z" fill="currentColor"/>`,
    // design 3 – bug
    `<path d="M4,2 L8,0 L12,2 L16,0 L20,2 L20,8 L22,6 L20,12 L16,18 L12,20 L8,18 L4,12 L2,6 L4,8 Z" fill="currentColor"/>`,
    // design 4 – UFO
    `<ellipse cx="12" cy="14" rx="10" ry="5" fill="currentColor"/><ellipse cx="12" cy="10" rx="6" ry="5" fill="currentColor"/>`,
  ];

  // ── State ────────────────────────────────────────────────────
  let words = [], wordIdx = 0;
  let targetWord = '', targetAnswer = '', targetClean = '';
  let shotCount  = 0;   // how many correct letters shot so far

  let score = 0, lives = LIVES_START, alienSpeed = SPEED_INIT;
  let timeLeft = GAME_TIME;

  let gameTimer = null, animFrame = null;
  let gameRunning = false;

  // Canvas / rendering
  let canvas = null, ctx = null;
  let W = 0, H = 0;

  // Game objects
  let aliens  = [];   // {x,y,letter,alive,glyph,color,highlight,highlightTimer}
  let bullets = [];   // {x,y,active}
  let cannon  = { x:0, y:0, w:40, h:20 };
  let particles = []; // {x,y,vx,vy,life,color}

  // Alien march state
  let alienDir    = 1;   // 1=right, -1=left
  let alienOffset = 0;   // accumulated horizontal offset from start positions

  // Input
  let keys = {};

  // ── Init ─────────────────────────────────────────────────────
  async function init() {
    const { language, category, subcategory } = App.state;
    const raw = await App.getVocabulary(language, category, subcategory);
    if (!raw || !raw.length) { App.toast('No vocabulary found!', 'error'); return; }

    words        = App.shuffle([...raw]);
    wordIdx      = 0;
    score        = 0;
    lives        = LIVES_START;
    alienSpeed   = SPEED_INIT;
    timeLeft     = GAME_TIME;
    gameRunning  = false;

    clearInterval(gameTimer);
    cancelAnimationFrame(animFrame);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);

    App.ActiveGame.register(() => {
      gameRunning = false;
      clearInterval(gameTimer);
      cancelAnimationFrame(animFrame);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup',   onKeyUp);
    });
    App.showPage('invaders');
    requestAnimationFrame(() => requestAnimationFrame(setupGame));
  }

  // ── Setup ─────────────────────────────────────────────────────
  function setupGame() {
    canvas = document.getElementById('invaders-canvas');
    if (!canvas) return;

    // Size canvas to its CSS box
    W = canvas.offsetWidth  || 800;
    H = canvas.offsetHeight || 500;
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');

    cannon.x = W / 2;
    cannon.y = H - 36;

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click',     onCanvasClick);

    // Touch
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: true });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });

    loadWord();
    startGameTimer();
    gameRunning = true;
    animFrame   = requestAnimationFrame(loop);
  }

  // ── Controls ─────────────────────────────────────────────────
  function onKeyDown(e) {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); fireBullet(); }
  }
  function onKeyUp(e)   { keys[e.key] = false; }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    cannon.x = Math.max(cannon.w/2, Math.min(W - cannon.w/2, e.clientX - r.left));
  }
  function onCanvasClick()   { fireBullet(); }
  function onTouchMove(e) {
    const r = canvas.getBoundingClientRect();
    cannon.x = Math.max(cannon.w/2, Math.min(W - cannon.w/2, e.touches[0].clientX - r.left));
  }
  function onTouchStart(e) {
    const r = canvas.getBoundingClientRect();
    cannon.x = Math.max(cannon.w/2, Math.min(W - cannon.w/2, e.touches[0].clientX - r.left));
    fireBullet();
  }

  // ── Word / Alien setup ────────────────────────────────────────
  function loadWord() {
    if (wordIdx >= words.length) { wordIdx = 0; words = App.shuffle([...words]); }
    const w      = words[wordIdx++];
    targetWord   = w.word;
    targetAnswer = w.translation.toUpperCase();
    targetClean  = targetAnswer.replace(/ /g, '');
    shotCount    = 0;

    // Update static UI (outside canvas)
    const qEl = document.getElementById('inv-question');
    const hEl = document.getElementById('inv-hint');
    if (qEl) qEl.textContent = targetWord;
    if (hEl) hEl.textContent = `Hint: ${w.hint}`;

    buildAliens();
    updateSlotsUI();
  }

  function buildAliens() {
    const answerLetters = targetClean.split('');
    const needed = [...answerLetters];        // must all appear at least once

    // Fill the rest with confusers until we have ALIEN_COLS letters
    const pool = [...needed];
    while (pool.length < ALIEN_COLS) {
      // Pick a random confuser for a random needed letter
      const src = needed[Math.floor(Math.random() * needed.length)];
      const conf = CONFUSERS[src];
      const candidate = conf ? conf[Math.floor(Math.random() * conf.length)]
                              : randomCapLetter();
      // Avoid duplicates of answer letters only if we already have enough
      pool.push(candidate);
    }

    // Truncate to exactly ALIEN_COLS and shuffle
    const letters = shuffle10(pool.slice(0, ALIEN_COLS));

    // Colors per alien (rotating palette)
    const COLORS = ['#a855f7','#38bdf8','#4ecdc4','#f9c846','#ff6b6b','#84cc16','#fb923c','#ec4899','#60a5fa','#34d399'];

    // Layout
    // Place aliens evenly across the canvas with 80px padding each side
    // so they have room to march before hitting a wall
    const padding = 80;
    const spacing = Math.floor((W - padding * 2) / (ALIEN_COLS - 1));
    const startX  = padding;
    const startY  = 90;

    aliens = letters.map((letter, i) => ({
      letter,
      alive:  true,
      x:      startX + i * spacing,
      y:      startY,
      baseX:  startX + i * spacing,
      glyph:  i % SHIP_GLYPHS.length,
      color:  COLORS[i % COLORS.length],
      highlight: false,
      highlightTimer: 0,
    }));

    alienOffset = 0;
    alienDir    = 1;
  }

  function shuffle10(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function randomCapLetter() {
    return String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }

  // ── Slots UI (outside canvas) ─────────────────────────────────
  function updateSlotsUI() {
    const el = document.getElementById('inv-slots');
    if (!el) return;
    let ci = 0;
    el.innerHTML = targetAnswer.split('').map(ch => {
      if (ch === ' ') return `<span style="display:inline-block;width:14px"></span>`;
      const filled = ci < shotCount;
      const letter = filled ? targetClean[ci] : '_';
      ci++;
      return `<span style="
        display:inline-block;min-width:26px;margin:0 2px;padding:3px 6px;
        border-bottom:3px solid ${filled ? 'var(--accent-mint)' : 'var(--accent-grape)'};
        color:${filled ? 'var(--accent-mint)' : 'var(--text-muted)'};
        font-family:var(--font-mono);font-size:1.1rem;font-weight:700;text-align:center;
      ">${letter}</span>`;
    }).join('');
  }

  // ── Firing ────────────────────────────────────────────────────
  let lastShot = 0;
  function fireBullet() {
    if (!gameRunning) return;
    const now = Date.now();
    if (now - lastShot < 300) return;   // 300ms cooldown
    lastShot = now;
    bullets.push({ x: cannon.x, y: cannon.y - cannon.h / 2, active: true });
  }

  // ── Main loop ─────────────────────────────────────────────────
  function loop() {
    if (!gameRunning) return;

    update();
    draw();

    animFrame = requestAnimationFrame(loop);
  }

  function update() {
    // Keyboard cannon movement
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) cannon.x = Math.max(cannon.w/2,       cannon.x - 5);
    if (keys['ArrowRight'] || keys['d'] || keys['D']) cannon.x = Math.min(W - cannon.w/2,   cannon.x + 5);

    // Move bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y -= BULLET_SPEED;
      if (b.y < 0) { bullets.splice(i, 1); continue; }

      // Bullet vs alien collision
      let hit = false;
      for (const a of aliens) {
        if (!a.alive) continue;
        if (Math.abs(b.x - a.x) < 28 && Math.abs(b.y - a.y) < 28) {
          hit = true;
          bullets.splice(i, 1);
          handleHit(a);
          break;
        }
      }
    }

    // Highlight timers
    aliens.forEach(a => {
      if (a.highlightTimer > 0) { a.highlightTimer--; a.highlight = a.highlightTimer > 0; }
    });

    // March aliens
    marchAliens();

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Aliens reached bottom → lose a life
    const aliveAliens = aliens.filter(a => a.alive);
    if (aliveAliens.length && aliveAliens.some(a => a.y > cannon.y - 30)) {
      loseLife();
    }
  }

  function marchAliens() {
    const alive = aliens.filter(a => a.alive);
    if (!alive.length) return;

    alienOffset += alienSpeed * alienDir;

    let hitWall = false;
    for (const a of alive) {
      a.x = a.baseX + alienOffset;
      if (a.x < 30 || a.x > W - 30) hitWall = true;
    }

    if (hitWall) {
      alienDir *= -1;
      // Nudge so they don't re-trigger immediately
      alienOffset += alienSpeed * alienDir * 2;
      // Drop down
      alive.forEach(a => { a.y += ALIEN_DROP; a.baseX = a.x - alienOffset; });
    }
  }

  // ── Hit logic ─────────────────────────────────────────────────
  function handleHit(alien) {
    const expected = targetClean[shotCount];

    if (alien.letter === expected) {
      // ✅ Correct
      alien.alive = false;
      shotCount++;
      score += 50;
      updateScoreEl();
      updateSlotsUI();
      spawnParticles(alien.x, alien.y, alien.color, 18);

      if (shotCount >= targetClean.length) {
        // Word complete
        score += 100;
        updateScoreEl();
        App.toast(`🎉 "${targetWord}" → "${targetAnswer}"  +100 bonus!`, 'success', 1800);
        setTimeout(() => {
          if (!gameRunning) return;
          loadWord();
        }, 1000);
      }
    } else {
      // ❌ Wrong
      alien.highlight = true;
      alien.highlightTimer = 25;
      lives--;
      score = Math.max(0, score - 20);
      alienSpeed = Math.min(SPEED_MAX, alienSpeed + SPEED_STEP);
      updateScoreEl();
      updateLivesEl();
      spawnParticles(alien.x, alien.y, '#ff6b6b', 10);
      // Flash cannon red
      cannon.hitFlash = 12;
      if (lives <= 0) endGame();
    }
  }

  function loseLife() {
    lives--;
    score = Math.max(0, score - 30);
    updateScoreEl();
    updateLivesEl();
    // Reset alien row
    buildAliens();
    if (lives <= 0) endGame();
  }

  // ── Particles ─────────────────────────────────────────────────
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 1.5 + Math.random() * 3;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 30 + Math.floor(Math.random() * 20),
        color,
      });
    }
  }

  // ── Drawing ───────────────────────────────────────────────────
  function draw() {
    // Background
    ctx.fillStyle = '#0d0f1a';
    ctx.fillRect(0, 0, W, H);

    // Stars
    drawStars();

    // Next-to-shoot indicator (subtle arrow below target alien)
    drawTargetIndicator();

    // Aliens
    aliens.forEach(drawAlien);

    // Bullets
    ctx.fillStyle = '#f9c846';
    ctx.shadowColor = '#f9c846';
    ctx.shadowBlur = 8;
    bullets.forEach(b => {
      ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
    });
    ctx.shadowBlur = 0;

    // Particles
    particles.forEach(p => {
      ctx.globalAlpha = p.life / 50;
      ctx.fillStyle   = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    ctx.globalAlpha = 1;

    // Cannon
    drawCannon();

    // Ground line
    ctx.strokeStyle = 'rgba(78,205,196,0.3)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - 10); ctx.lineTo(W, H - 10);
    ctx.stroke();
  }

  // Pre-generate star positions once
  const STARS = Array.from({length:60}, () => ({
    x: Math.random(), y: Math.random(),
    r: 0.5 + Math.random() * 1.5,
    a: 0.2 + Math.random() * 0.6,
  }));
  function drawStars() {
    STARS.forEach(s => {
      ctx.globalAlpha = s.a;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawTargetIndicator() {
    const expected = targetClean[shotCount];
    if (!expected) return;
    // Find the first alive alien with that letter
    const target = aliens.find(a => a.alive && a.letter === expected);
    if (!target) return;
    // Pulsing arrow below the alien
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
    ctx.globalAlpha = 0.4 + 0.4 * pulse;
    ctx.fillStyle   = '#f9c846';
    ctx.font        = 'bold 18px sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText('▲', target.x, target.y + 34);
    ctx.globalAlpha = 1;
  }

  function drawAlien(a) {
    if (!a.alive) return;

    ctx.save();
    ctx.translate(a.x, a.y);

    // Glow
    ctx.shadowColor = a.highlight ? '#ff6b6b' : a.color;
    ctx.shadowBlur  = a.highlight ? 28 : 14;

    // Scale up 2× so ships are clearly visible
    ctx.scale(1.5, 1.5);

    const col = a.highlight ? '#ff6b6b' : a.color;
    drawShipShape(a.glyph, col);

    // Letter label — drawn at 1× scale so it stays readable
    ctx.scale(0.667, 0.667);   // undo the 1.5× before drawing text
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#ffffff';
    ctx.font        = 'bold 16px "Space Mono", monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.letter, 0, 2);

    ctx.restore();
  }

  function drawShipShape(glyph, color) {
    ctx.fillStyle = color;
    const g = glyph % 5;
    if (g === 0) {
      // Classic invader
      ctx.fillRect(-10, -8,  4, 12);
      ctx.fillRect(  6, -8,  4, 12);
      ctx.fillRect( -6, -12, 12, 8);
      ctx.fillRect(-14, -4,  6, 6);
      ctx.fillRect(  8, -4,  6, 6);
      ctx.fillRect( -4, -16, 8, 6);
    } else if (g === 1) {
      // Crab
      ctx.beginPath();
      ctx.moveTo(-12, 8); ctx.lineTo(-8, -8); ctx.lineTo(0, -12);
      ctx.lineTo(8, -8);  ctx.lineTo(12, 8);  ctx.lineTo(8, 4);
      ctx.lineTo(0, 8);   ctx.lineTo(-8, 4);  ctx.closePath();
      ctx.fill();
      ctx.fillRect(-16, 2, 6, 4);
      ctx.fillRect(10,  2, 6, 4);
    } else if (g === 2) {
      // Squid
      ctx.beginPath();
      ctx.arc(0, -4, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-6, 4, 4, 8);
      ctx.fillRect( 2, 4, 4, 8);
      ctx.fillRect(-2, 6, 4, 6);
    } else if (g === 3) {
      // Bug
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-14, -4, 6, 3);
      ctx.fillRect(  8, -4, 6, 3);
      ctx.fillRect(-12,  2, 5, 3);
      ctx.fillRect(  7,  2, 5, 3);
    } else {
      // UFO disc
      ctx.beginPath();
      ctx.ellipse(0, 4, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -1, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCannon() {
    const cx = cannon.x, cy = cannon.y;

    // Hit flash
    if (cannon.hitFlash > 0) {
      cannon.hitFlash--;
      ctx.shadowColor = '#ff6b6b';
      ctx.shadowBlur  = 20;
    } else {
      ctx.shadowColor = 'var(--accent-mint)';
      ctx.shadowBlur  = 10;
    }

    const col = cannon.hitFlash > 0 ? '#ff6b6b' : '#4ecdc4';
    ctx.fillStyle = col;

    // Base
    ctx.beginPath();
    ctx.roundRect(cx - 20, cy - 10, 40, 16, 4);
    ctx.fill();

    // Barrel
    ctx.fillRect(cx - 4, cy - 24, 8, 16);

    // Nozzle
    ctx.fillRect(cx - 3, cy - 28, 6, 6);

    ctx.shadowBlur = 0;
  }

  // ── HUD helpers ───────────────────────────────────────────────
  function updateScoreEl() {
    const el = document.getElementById('inv-score');
    if (el) el.textContent = score;
  }

  function updateLivesEl() {
    const el = document.getElementById('inv-lives');
    if (el) el.textContent = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, 3 - lives));
  }

  // ── Timer ─────────────────────────────────────────────────────
  function startGameTimer() {
    setTimerEl(timeLeft);
    gameTimer = setInterval(() => {
      timeLeft--;
      setTimerEl(timeLeft);
      if (timeLeft <= 0) endGame();
    }, 1000);
  }

  function setTimerEl(t) {
    const el = document.getElementById('inv-timer');
    if (el) el.textContent = `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
  }

  // ── End ───────────────────────────────────────────────────────
  function endGame() {
    if (!gameRunning) return;
    App.ActiveGame.register(null);
    gameRunning = false;
    clearInterval(gameTimer);
    cancelAnimationFrame(animFrame);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);

    const wordsCompleted = Math.floor(score / 150);
    UI.showResults({
      score,
      correct: wordsCompleted,
      total:   Math.max(wordsCompleted + 1, 5),
      timeLeft,
      maxTime: GAME_TIME,
      gameType: 'invaders'
    });
  }

  return { init };
})();
