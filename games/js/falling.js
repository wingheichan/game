// ============================================================
//  LinguaPlay — Falling Fruits Game  (fixed rewrite)
// ============================================================

const FallingGame = (() => {

  const FRUITS     = ['🍎','🍊','🍋','🍇','🍓','🍑','🍍','🥭','🍈','🫐','🍒','🥝'];
  const GAME_TIME  = 90;
  const SPEED_INIT = 1.8;
  const SPEED_MAX  = 5.0;
  const SPAWN_MS   = 1600;
  const BASKET_HW  = 52;   // basket half-width for collision

  let words = [], wordIdx = 0;
  let targetWord = '', targetAnswer = '', targetClean = '';
  let collected  = [];   // correctly caught letters (no spaces)

  let score = 0, lives = 3, fallSpeed = SPEED_INIT;
  let timeLeft = GAME_TIME;

  let gameTimer = null, spawnTimer = null, animFrame = null;
  let gameRunning = false;

  let fruits   = [];   // active fruit objects {el, x, y, letter, speed, wobble, dead}
  let basketX  = 300;
  let gameArea = null;

  // ── Init ────────────────────────────────────────────────────
  async function init() {
    const { language, category, subcategory } = App.state;
    const raw = await App.getVocabulary(language, category, subcategory);
    if (!raw || !raw.length) { App.toast('No vocabulary found!', 'error'); return; }

    // Hard-reset every piece of state so replaying works cleanly
    words      = App.shuffle([...raw]);
    wordIdx    = 0;
    score      = 0;
    lives      = 3;
    fallSpeed  = SPEED_INIT;
    timeLeft   = GAME_TIME;
    collected  = [];
    fruits     = [];
    gameRunning = false;

    clearInterval(gameTimer);
    clearInterval(spawnTimer);
    cancelAnimationFrame(animFrame);
    document.removeEventListener('keydown', onKeyDown);

    App.ActiveGame.register(() => {
      gameRunning = false;
      clearInterval(gameTimer);
      clearInterval(spawnTimer);
      cancelAnimationFrame(animFrame);
      document.removeEventListener('keydown', onKeyDown);
      fruits.forEach(f => { try { f.el.remove(); } catch(e){} });
      fruits = [];
    });
    App.showPage('falling');
    // wait one frame so the page is rendered and offsetWidth is valid
    requestAnimationFrame(() => requestAnimationFrame(setupGame));
  }

  // ── Setup canvas (called AFTER page is visible) ─────────────
  function setupGame() {
    gameArea = document.getElementById('falling-game-area');
    if (!gameArea) return;

    // Wipe only the canvas — question/HUD/word-display live outside it
    gameArea.innerHTML = '';

    // Decorative stars
    for (let i = 0; i < 25; i++) {
      const s = document.createElement('div');
      s.className = 'falling-star';
      s.style.cssText =
        `left:${Math.random()*100}%;top:${Math.random()*100}%;` +
        `animation-delay:${(Math.random()*3).toFixed(2)}s;` +
        `animation-duration:${(2+Math.random()*3).toFixed(2)}s;`;
      gameArea.appendChild(s);
    }

    // Basket
    const b = document.createElement('div');
    b.id = 'basket';
    b.className = 'basket';
    b.innerHTML = `<div class="basket-handle"></div>
                   <div class="basket-body"><div class="basket-weave"></div></div>`;
    gameArea.appendChild(b);

    basketX = gameArea.offsetWidth / 2;
    moveBasket();

    // Controls
    gameArea.addEventListener('mousemove', onMouseMove);
    gameArea.addEventListener('touchmove',  onTouchMove, { passive: true });
    document.addEventListener('keydown', onKeyDown);

    // Kick everything off
    loadWord();
    startGameTimer();
    spawnFruit();
    spawnTimer  = setInterval(spawnFruit, SPAWN_MS);
    gameRunning = true;
    animFrame   = requestAnimationFrame(loop);
  }

  // ── Controls ────────────────────────────────────────────────
  function onMouseMove(e) {
    basketX = clamp(e.clientX - gameArea.getBoundingClientRect().left);
    moveBasket();
  }
  function onTouchMove(e) {
    basketX = clamp(e.touches[0].clientX - gameArea.getBoundingClientRect().left);
    moveBasket();
  }
  function onKeyDown(e) {
    if (!gameRunning) return;
    if (e.key === 'ArrowLeft')  { basketX = clamp(basketX - 32); moveBasket(); }
    if (e.key === 'ArrowRight') { basketX = clamp(basketX + 32); moveBasket(); }
  }
  function clamp(x) { return Math.max(BASKET_HW, Math.min(gameArea.offsetWidth - BASKET_HW, x)); }
  function moveBasket() {
    const b = document.getElementById('basket');
    if (b) b.style.left = basketX + 'px';
  }

  // ── Word management ──────────────────────────────────────────
  function loadWord() {
    if (wordIdx >= words.length) { wordIdx = 0; words = App.shuffle([...words]); }
    const w     = words[wordIdx++];
    targetWord  = w.word;
    targetAnswer = w.translation.toUpperCase();
    targetClean  = targetAnswer.replace(/ /g, '');
    collected    = [];

    // These elements live OUTSIDE the canvas — always safe to update
    const qEl   = document.getElementById('falling-question-text');
    if (qEl)    qEl.textContent  = targetWord;

    redrawSlots();
  }

  function redrawSlots() {
    const el = document.getElementById('falling-word-display');
    if (!el) return;
    let ci = 0;
    el.innerHTML = targetAnswer.split('').map(ch => {
      if (ch === ' ') return `<span style="display:inline-block;width:14px"></span>`;
      const filled = ci < collected.length;
      const disp   = filled ? collected[ci] : '_';
      ci++;
      return `<span style="
        display:inline-block;min-width:26px;margin:0 2px;padding:3px 5px;
        border-bottom:3px solid ${filled ? 'var(--accent-mint)' : 'var(--accent-grape)'};
        color:${filled ? 'var(--accent-mint)' : 'var(--text-muted)'};
        font-family:var(--font-mono);font-size:1.1rem;font-weight:700;text-align:center;
      ">${disp}</span>`;
    }).join('');
  }

  // ── Spawning ─────────────────────────────────────────────────
  function spawnFruit() {
    if (!gameRunning || !gameArea) return;

    const areaW  = gameArea.offsetWidth || 600;
    const needed = targetClean[collected.length] || null;
    // 45 % chance of spawning the correct next letter
    const letter = (needed && Math.random() < 0.45) ? needed : randomLetter(needed);

    const emoji = FRUITS[Math.floor(Math.random() * FRUITS.length)];
    const x     = 40 + Math.random() * (areaW - 80);

    const el = document.createElement('div');
    el.className = 'fruit-item';
    // position:absolute; start ABOVE the visible canvas (negative y)
    el.style.cssText = `position:absolute;left:${x}px;top:-70px;pointer-events:none;`;
    el.innerHTML = `<div class="fruit-emoji">${emoji}</div>
                    <div class="fruit-letter">${letter}</div>`;
    gameArea.appendChild(el);

    fruits.push({ el, x, y: -70, letter,
      speed:  fallSpeed + Math.random() * 1.2,
      wobble: Math.random() * Math.PI * 2,
      dead:   false });
  }

  function randomLetter(exclude) {
    const pool = 'ABCDEFGHIJKLMNOPRSTUW';
    let ch, t = 0;
    do { ch = pool[Math.floor(Math.random() * pool.length)]; } while (ch === exclude && ++t < 10);
    return ch;
  }

  // ── Game loop ────────────────────────────────────────────────
  function loop() {
    if (!gameRunning) return;

    const areaH   = gameArea.offsetHeight || 480;
    const bTop    = areaH - 58;          // y-coordinate of basket top edge
    const bLeft   = basketX - BASKET_HW;
    const bRight  = basketX + BASKET_HW;

    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      if (f.dead) { fruits.splice(i, 1); continue; }

      // Move fruit
      f.wobble += 0.025;
      f.y      += f.speed;
      f.x      += Math.sin(f.wobble) * 0.6;
      f.el.style.top  = f.y + 'px';
      f.el.style.left = f.x + 'px';

      const cx     = f.x + 18;   // fruit centre-x
      const bottom = f.y + 68;   // fruit bottom

      // Basket collision
      if (bottom >= bTop && cx >= bLeft && cx <= bRight) {
        f.dead = true;
        f.el.remove();
        fruits.splice(i, 1);
        onCatch(f.letter, f.x, bTop);
        continue;
      }

      // Off-screen bottom
      if (f.y > areaH + 10) {
        f.dead = true;
        f.el.remove();
        fruits.splice(i, 1);
      }
    }

    animFrame = requestAnimationFrame(loop);
  }

  // ── Catch handler ─────────────────────────────────────────────
  function onCatch(letter, fx, bTop) {
    const expected = targetClean[collected.length];

    if (letter === expected) {
      collected.push(letter);
      score += 20;
      updateScoreEl();
      redrawSlots();
      popText(fx, bTop - 36, '+20', false);

      if (collected.length >= targetClean.length) {
        // Word complete!
        score += 50;
        updateScoreEl();
        popText(basketX - 20, bTop - 80, '🎉 +50!', false);
        App.toast(`🎉 "${targetWord}" = "${targetAnswer}"  +50 bonus!`, 'success', 1800);

        clearInterval(spawnTimer);
        // Remove all fruits still on screen
        fruits.forEach(f => { f.dead = true; f.el.remove(); });
        fruits = [];

        setTimeout(() => {
          if (!gameRunning) return;
          loadWord();
          spawnFruit();
          spawnTimer = setInterval(spawnFruit, SPAWN_MS);
        }, 1300);
      }

    } else {
      lives--;
      score = Math.max(0, score - 10);
      updateScoreEl();
      updateLivesEl();
      popText(fx, bTop - 36, '-10', true);
      shakeBasket();
      if (lives <= 0) endGame();
    }
  }

  // ── Visual helpers ────────────────────────────────────────────
  function popText(x, y, text, bad) {
    if (!gameArea) return;
    const el = document.createElement('div');
    el.className = `catch-flash${bad ? ' wrong' : ''}`;
    el.style.cssText = `left:${x}px;top:${y}px;`;
    el.textContent = text;
    gameArea.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function shakeBasket() {
    const b = document.getElementById('basket');
    if (!b) return;
    b.classList.add('shake');
    setTimeout(() => b.classList.remove('shake'), 400);
  }

  function updateScoreEl() {
    const el = document.getElementById('falling-score');
    if (el) el.textContent = score;
  }

  function updateLivesEl() {
    const el = document.getElementById('falling-lives');
    if (el) el.textContent = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, 3 - lives));
  }

  // ── Timer ─────────────────────────────────────────────────────
  function startGameTimer() {
    setTimerEl(timeLeft);
    gameTimer = setInterval(() => {
      timeLeft--;
      setTimerEl(timeLeft);
      fallSpeed = Math.min(SPEED_MAX, SPEED_INIT + (GAME_TIME - timeLeft) * 0.03);
      if (timeLeft <= 0) endGame();
    }, 1000);
  }

  function setTimerEl(t) {
    const el = document.getElementById('falling-timer');
    if (el) el.textContent = `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
  }

  // ── End ───────────────────────────────────────────────────────
  function endGame() {
    if (!gameRunning) return;
    App.ActiveGame.register(null);
    gameRunning = false;
    clearInterval(gameTimer);
    clearInterval(spawnTimer);
    cancelAnimationFrame(animFrame);
    document.removeEventListener('keydown', onKeyDown);
    fruits.forEach(f => { f.dead = true; f.el.remove(); });
    fruits = [];

    const wordsCompleted = Math.floor(score / 70);
    UI.showResults({
      score,
      correct: wordsCompleted,
      total:   Math.max(wordsCompleted + 1, 5),
      timeLeft,
      maxTime: GAME_TIME,
      gameType: 'falling'
    });
  }

  return { init };
})();
