// ============================================================
//  LinguaPlay — Space Invaders  (still ships, drop on wrong)
// ============================================================
//
//  NEW GAMEPLAY
//  ─────────────────────────────────────────────────────────
//  • Ships stand still in a single row at the top.
//  • Shoot the answer letters IN ORDER to clear the word.
//  • Shooting a WRONG ship: that ship starts falling down.
//    If it reaches the cannon → lose a life, row resets.
//  • Shooting a CORRECT ship: destroyed, +50 pts.
//  • Word complete → next word, +100 bonus.
//  • No triangle indicator — player must read the letter slots.
// ============================================================

const InvadersGame = (() => {

  // ── Constants ──────────────────────────────────────────────
  const GAME_TIME    = 90;
  const ALIEN_COLS   = 10;
  const LIVES_START  = 3;
  const BULLET_SPEED = 10;
  const DROP_SPEED   = 1.4;    // px per frame a punished ship falls

  const CONFUSERS = {
    S:['C','Z'],  C:['S','K'],  K:['C','Q'],  Q:['K','C'],
    F:['V','P'],  V:['F','B'],  B:['P','V'],  P:['B','F'],
    D:['T'],      T:['D'],      G:['J'],      J:['G'],
    N:['M'],      M:['N'],      L:['R'],      R:['L'],
    A:['E'],      E:['A','I'],  I:['E','Y'],  Y:['I'],
    O:['U'],      U:['O'],      W:['V'],      X:['Z'],
    H:['A'],      Z:['S','X'],
  };

  // ── State ──────────────────────────────────────────────────
  let words = [], wordIdx = 0;
  let targetWord = '', targetAnswer = '', targetClean = '';
  let shotCount  = 0;

  let score = 0, lives = LIVES_START;
  let timeLeft = GAME_TIME;

  let gameTimer = null, animFrame = null;
  let gameRunning = false;

  let canvas = null, ctx = null, W = 0, H = 0;

  // aliens: {x, y, homeY, letter, alive, dropping, color, highlight, highlightTimer}
  let aliens    = [];
  let bullets   = [];
  let particles = [];
  let cannon    = { x:0, y:0, w:40, h:20, hitFlash:0 };

  let keys = {};

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    const { language, category, subcategory } = App.state;
    const raw = await App.getVocabulary(language, category, subcategory);
    if (!raw || !raw.length) { App.toast('No vocabulary found!', 'error'); return; }

    words       = App.shuffle([...raw]);
    wordIdx     = 0;
    score       = 0;
    lives       = LIVES_START;
    timeLeft    = GAME_TIME;
    gameRunning = false;
    aliens = []; bullets = []; particles = [];

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

  // ── Setup ──────────────────────────────────────────────────
  function setupGame() {
    canvas = document.getElementById('invaders-canvas');
    if (!canvas) return;
    W = canvas.offsetWidth  || 800;
    H = canvas.offsetHeight || 560;
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');

    cannon.x = W / 2;
    cannon.y = H - 36;

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click',     onCanvasClick);
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: true });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });

    loadWord();
    startGameTimer();
    gameRunning = true;
    animFrame = requestAnimationFrame(loop);
  }

  // ── Controls ───────────────────────────────────────────────
  function onKeyDown(e) {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); fireBullet(); }
  }
  function onKeyUp(e) { keys[e.key] = false; }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    cannon.x = clampCannon(e.clientX - r.left);
  }
  function onCanvasClick() { fireBullet(); }
  function onTouchMove(e) {
    const r = canvas.getBoundingClientRect();
    cannon.x = clampCannon(e.touches[0].clientX - r.left);
  }
  function onTouchStart(e) {
    const r = canvas.getBoundingClientRect();
    cannon.x = clampCannon(e.touches[0].clientX - r.left);
    fireBullet();
  }
  function clampCannon(x) { return Math.max(cannon.w/2, Math.min(W - cannon.w/2, x)); }

  // ── Word loading ───────────────────────────────────────────
  function loadWord() {
    if (wordIdx >= words.length) { wordIdx = 0; words = App.shuffle([...words]); }
    const w      = words[wordIdx++];
    targetWord   = w.word;
    targetAnswer = w.translation.toUpperCase();
    targetClean  = targetAnswer.replace(/ /g, '');
    shotCount    = 0;

    const qEl = document.getElementById('inv-question');
    if (qEl) qEl.textContent = targetWord;

    buildAliens();
    updateSlotsUI();
  }

  function buildAliens() {
    const needed = targetClean.split('');
    const pool   = [...needed];

    while (pool.length < ALIEN_COLS) {
      const src  = needed[Math.floor(Math.random() * needed.length)];
      const conf = CONFUSERS[src];
      pool.push(conf ? conf[Math.floor(Math.random() * conf.length)]
                     : String.fromCharCode(65 + Math.floor(Math.random() * 26)));
    }

    const letters = shuffleArr(pool.slice(0, ALIEN_COLS));
    const COLORS  = ['#a855f7', '#4ecdc4'];
    const padding = 60;
    const spacing = Math.floor((W - padding * 2) / (ALIEN_COLS - 1));
    const homeY   = 80;

    aliens = letters.map((letter, i) => ({
      letter,
      alive:    true,
      dropping: false,
      x:        padding + i * spacing,
      y:        homeY,
      homeY,
      color:    COLORS[i % 2],
      highlight:      false,
      highlightTimer: 0,
    }));
  }

  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── Slots UI ───────────────────────────────────────────────
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

  // ── Firing ─────────────────────────────────────────────────
  let lastShot = 0;
  function fireBullet() {
    if (!gameRunning) return;
    const now = Date.now();
    if (now - lastShot < 280) return;
    lastShot = now;
    bullets.push({ x: cannon.x, y: cannon.y - cannon.h / 2 });
  }

  // ── Game loop ──────────────────────────────────────────────
  function loop() {
    if (!gameRunning) return;
    update();
    draw();
    animFrame = requestAnimationFrame(loop);
  }

  function update() {
    // Keyboard move
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) cannon.x = clampCannon(cannon.x - 5);
    if (keys['ArrowRight'] || keys['d'] || keys['D']) cannon.x = clampCannon(cannon.x + 5);

    // Move bullets upward
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y -= BULLET_SPEED;
      if (b.y < 0) { bullets.splice(i, 1); continue; }

      // Bullet–alien collision
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

    // Highlight flash timers
    aliens.forEach(a => {
      if (a.highlightTimer > 0) { a.highlightTimer--; a.highlight = a.highlightTimer > 0; }
    });

    // Drop punished ships
    for (let i = aliens.length - 1; i >= 0; i--) {
      const a = aliens[i];
      if (!a.alive || !a.dropping) continue;
      a.y += DROP_SPEED;
      // Reached cannon level → lose life, rebuild row
      if (a.y >= cannon.y - 20) {
        lives--;
        updateLivesEl();
        cannon.hitFlash = 14;
        spawnParticles(cannon.x, cannon.y, '#ff6b6b', 14);
        buildAliens();          // full row reset, dropping ship gone
        updateSlotsUI();
        if (lives <= 0) { endGame(); return; }
        break;
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (cannon.hitFlash > 0) cannon.hitFlash--;
  }

  // ── Hit handler ────────────────────────────────────────────
  function handleHit(alien) {
    const expected = targetClean[shotCount];

    if (alien.letter === expected) {
      // ✅ Correct — destroy ship
      alien.alive = false;
      shotCount++;
      score += 50;
      updateScoreEl();
      updateSlotsUI();
      spawnParticles(alien.x, alien.y, alien.color, 18);

      if (shotCount >= targetClean.length) {
        score += 100;
        updateScoreEl();
        App.toast(`🎉 "${targetWord}" → "${targetAnswer}"  +100!`, 'success', 1600);
        App.timer(() => { if (gameRunning) loadWord(); }, 900);
      }
    } else {
      // ❌ Wrong — this ship starts falling, score penalty
      alien.dropping      = true;
      alien.highlight     = true;
      alien.highlightTimer = 20;
      score = Math.max(0, score - 20);
      updateScoreEl();
      cannon.hitFlash = 12;
      spawnParticles(alien.x, alien.y, '#ff6b6b', 10);
    }
  }

  // ── Particles ──────────────────────────────────────────────
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 1.5 + Math.random() * 3;
      particles.push({ x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
        life: 28 + Math.floor(Math.random() * 18), color });
    }
  }

  // ── Drawing ────────────────────────────────────────────────
  const STARS = Array.from({length:60}, () => ({
    x: Math.random(), y: Math.random(),
    r: 0.5 + Math.random() * 1.5,
    a: 0.2 + Math.random() * 0.6,
  }));

  function draw() {
    ctx.fillStyle = '#0d0f1a';
    ctx.fillRect(0, 0, W, H);

    // Stars
    STARS.forEach(s => {
      ctx.globalAlpha = s.a;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Aliens
    aliens.forEach(drawAlien);

    // Bullets
    ctx.fillStyle  = '#f9c846';
    ctx.shadowColor = '#f9c846';
    ctx.shadowBlur  = 8;
    bullets.forEach(b => ctx.fillRect(b.x - 2, b.y - 8, 4, 12));
    ctx.shadowBlur  = 0;

    // Particles
    particles.forEach(p => {
      ctx.globalAlpha = p.life / 46;
      ctx.fillStyle   = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    ctx.globalAlpha = 1;

    // Cannon
    drawCannon();

    // Ground line
    ctx.strokeStyle = 'rgba(78,205,196,0.25)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, H - 10); ctx.lineTo(W, H - 10); ctx.stroke();
  }

  function drawAlien(a) {
    if (!a.alive) return;
    ctx.save();
    ctx.translate(a.x, a.y);

    ctx.shadowColor = a.highlight ? '#ff6b6b' : a.color;
    ctx.shadowBlur  = a.highlight ? 22 : 10;

    // Classic invader shape at 1.5× original coords
    ctx.fillStyle = a.highlight ? '#ff6b6b' : a.color;
    ctx.fillRect(-15, -12,  6, 18);
    ctx.fillRect(  9, -12,  6, 18);
    ctx.fillRect( -9, -18, 18, 12);
    ctx.fillRect(-21,  -6,  9,  9);
    ctx.fillRect( 12,  -6,  9,  9);
    ctx.fillRect( -6, -24, 12,  9);

    // Letter
    ctx.shadowBlur   = 0;
    ctx.font         = '600 15px Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle  = 'rgba(0,0,0,0.75)';
    ctx.lineWidth    = 3;
    ctx.lineJoin     = 'round';
    ctx.strokeText(a.letter, 0, -2);
    ctx.fillStyle    = '#ffffff';
    ctx.fillText(a.letter, 0, -2);

    ctx.restore();
  }

  function drawCannon() {
    const cx = cannon.x, cy = cannon.y;
    ctx.shadowColor = cannon.hitFlash > 0 ? '#ff6b6b' : '#4ecdc4';
    ctx.shadowBlur  = cannon.hitFlash > 0 ? 22 : 10;
    ctx.fillStyle   = cannon.hitFlash > 0 ? '#ff6b6b' : '#4ecdc4';
    ctx.beginPath(); ctx.roundRect(cx - 20, cy - 10, 40, 16, 4); ctx.fill();
    ctx.fillRect(cx - 4, cy - 24, 8, 16);
    ctx.fillRect(cx - 3, cy - 28, 6,  6);
    ctx.shadowBlur = 0;
  }

  // ── HUD ────────────────────────────────────────────────────
  function updateScoreEl() {
    const el = document.getElementById('inv-score');
    if (el) el.textContent = score;
  }
  function updateLivesEl() {
    const el = document.getElementById('inv-lives');
    if (el) el.textContent = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, 3 - lives));
  }

  // ── Timer ──────────────────────────────────────────────────
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

  // ── End ────────────────────────────────────────────────────
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
