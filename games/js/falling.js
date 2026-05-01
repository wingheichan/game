// ============================================================
//  LinguaPlay — Falling Fruits Game Module
// ============================================================
//  Question shown at top. Fruits with answer letters fall.
//  Player moves basket with mouse/touch to catch correct letters.
//  Collect correct letters to spell the translation.
// ============================================================

const FallingGame = (() => {
  const FRUITS = ['🍎','🍊','🍋','🍇','🍓','🍑','🍍','🥭','🍈','🫐','🍒','🥝'];
  const GAME_TIME = 90;
  const FALL_SPEED_INIT = 1.5;
  const FRUIT_SPAWN_RATE = 1800; // ms

  let words = [];
  let currentWordIdx = 0;
  let currentTarget = '';
  let collectedLetters = [];
  let score = 0;
  let lives = 3;
  let gameTimer = null;
  let timeLeft = GAME_TIME;
  let spawnInterval = null;
  let fruits = [];
  let animFrame = null;
  let basketX = 0;
  let gameArea = null;
  let gameRunning = false;
  let fallSpeed = FALL_SPEED_INIT;

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    const { language, category, subcategory } = App.state;
    words = await App.getVocabulary(language, category, subcategory);
    if (!words.length) { App.toast('No vocabulary found!', 'error'); return; }

    currentWordIdx = 0;
    score = 0;
    lives = 3;
    fruits = [];
    collectedLetters = [];
    timeLeft = GAME_TIME;
    fallSpeed = FALL_SPEED_INIT;
    App.showPage('falling');
    setupGame();
  }

  // ── Setup ──────────────────────────────────────────────────
  function setupGame() {
    gameArea = document.getElementById('falling-game-area');
    if (!gameArea) return;
    gameArea.innerHTML = '';

    // Stars background
    for (let i = 0; i < 30; i++) {
      const star = document.createElement('div');
      star.className = 'falling-star';
      star.style.cssText = `
        left: ${Math.random()*100}%;
        top: ${Math.random()*100}%;
        animation-delay: ${Math.random()*3}s;
        animation-duration: ${2 + Math.random()*3}s;
      `;
      gameArea.appendChild(star);
    }

    // Basket
    const basket = document.createElement('div');
    basket.className = 'basket';
    basket.id = 'basket';
    basket.innerHTML = `
      <div class="basket-handle"></div>
      <div class="basket-body">
        <div class="basket-weave"></div>
      </div>
    `;
    gameArea.appendChild(basket);
    basketX = gameArea.offsetWidth / 2;
    positionBasket();

    // Mouse/touch controls
    gameArea.addEventListener('mousemove', onMouseMove);
    gameArea.addEventListener('touchmove', onTouchMove, { passive: true });
    // Keyboard
    document.addEventListener('keydown', onKeyDown);

    loadWord();
    startTimer();
    startSpawning();
    gameRunning = true;
    requestAnimationFrame(gameLoop);
  }

  function onMouseMove(e) {
    const rect = gameArea.getBoundingClientRect();
    basketX = e.clientX - rect.left;
    positionBasket();
  }

  function onTouchMove(e) {
    const rect = gameArea.getBoundingClientRect();
    basketX = e.touches[0].clientX - rect.left;
    positionBasket();
  }

  let moveDir = 0;
  function onKeyDown(e) {
    if (!gameRunning) return;
    if (e.key === 'ArrowLeft')  { basketX = Math.max(50, basketX - 30); positionBasket(); }
    if (e.key === 'ArrowRight') { basketX = Math.min(gameArea.offsetWidth - 50, basketX + 30); positionBasket(); }
  }

  function positionBasket() {
    const b = document.getElementById('basket');
    if (!b) return;
    const w = gameArea.offsetWidth;
    basketX = Math.max(50, Math.min(w - 50, basketX));
    b.style.left = basketX + 'px';
  }

  // ── Current Word ───────────────────────────────────────────
  function loadWord() {
    if (currentWordIdx >= words.length) { currentWordIdx = 0; App.shuffle(words); }
    const word = words[currentWordIdx];
    currentTarget = word.translation.toUpperCase();
    collectedLetters = [];
    updateWordDisplay();
    updateQuestion(word);
    currentWordIdx++;
  }

  function updateQuestion(word) {
    const qEl = document.getElementById('falling-question-text');
    const hintEl = document.getElementById('falling-hint');
    if (qEl) qEl.textContent = word.word;
    if (hintEl) hintEl.textContent = `Catch the letters to spell: ${word.translation}`;
  }

  function updateWordDisplay() {
    const el = document.getElementById('falling-word-display');
    if (!el) return;
    el.innerHTML = currentTarget.split('').map((ch, i) => {
      const filled = i < collectedLetters.length && collectedLetters[i] === ch;
      return `<span style="
        display:inline-block;
        min-width:28px;
        margin:0 2px;
        padding:4px 6px;
        border-bottom: 3px solid ${filled ? 'var(--accent-mint)' : 'var(--accent-grape)'};
        color: ${filled ? 'var(--accent-mint)' : 'var(--text-muted)'};
        font-family: var(--font-mono);
        font-size: 1.2rem;
        font-weight:700;
        text-align:center;
      ">${filled ? ch : (ch === ' ' ? '&nbsp;' : '_')}</span>`;
    }).join('');
  }

  // ── Fruit Spawning ─────────────────────────────────────────
  function startSpawning() {
    clearInterval(spawnInterval);
    spawnInterval = setInterval(spawnFruit, FRUIT_SPAWN_RATE);
    spawnFruit(); // immediate first
  }

  function spawnFruit() {
    if (!gameRunning) return;
    const areaW = gameArea.offsetWidth;

    // Decide letter: sometimes correct next letter, sometimes distractor
    const nextIdx = collectedLetters.length;
    const nextLetter = (nextIdx < currentTarget.replace(/ /g, '').length)
      ? currentTarget.replace(/ /g, '')[nextIdx]
      : null;

    let letter;
    // 40% chance of correct letter, 60% distractor
    if (nextLetter && Math.random() < 0.4) {
      letter = nextLetter;
    } else {
      letter = randomLetter();
    }

    const emoji = FRUITS[Math.floor(Math.random() * FRUITS.length)];
    const x = 40 + Math.random() * (areaW - 80);
    const y = 60; // start below header

    const el = document.createElement('div');
    el.className = 'fruit-item';
    el.style.cssText = `left: ${x}px; top: ${y}px;`;
    el.innerHTML = `
      <div class="fruit-emoji">${emoji}</div>
      <div class="fruit-letter">${letter}</div>
    `;
    gameArea.appendChild(el);

    fruits.push({
      el, x, y,
      letter,
      speed: fallSpeed + Math.random() * 1.5,
      wobble: Math.random() * Math.PI * 2
    });
  }

  function randomLetter() {
    // Distractor: letters from the target word or random
    const pool = 'ABCDEFGHIJKLMNOPRSTW';
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── Game Loop ──────────────────────────────────────────────
  function gameLoop() {
    if (!gameRunning) return;
    const areaH = gameArea.offsetHeight;
    const areaW = gameArea.offsetWidth;
    const basketLeft  = basketX - 50;
    const basketRight = basketX + 50;
    const basketTop   = areaH - 60;

    fruits = fruits.filter(f => {
      f.wobble += 0.03;
      f.y += f.speed;
      f.x += Math.sin(f.wobble) * 0.5;
      f.el.style.top  = f.y + 'px';
      f.el.style.left = f.x + 'px';

      // Catch check
      const fruitMid = f.x + 12;
      const fruitBottom = f.y + 70;
      if (fruitBottom >= basketTop && fruitMid >= basketLeft && fruitMid <= basketRight) {
        catchFruit(f);
        f.el.remove();
        return false;
      }

      // Fallen off screen
      if (f.y > areaH) {
        f.el.remove();
        return false;
      }
      return true;
    });

    animFrame = requestAnimationFrame(gameLoop);
  }

  // ── Catch Logic ────────────────────────────────────────────
  function catchFruit(f) {
    const nextIdx = collectedLetters.length;
    // Skip spaces
    let targetIdx = nextIdx;
    while (targetIdx < currentTarget.length && currentTarget[targetIdx] === ' ') {
      collectedLetters.push(' ');
      targetIdx++;
    }

    const expected = currentTarget[targetIdx];

    if (f.letter === expected) {
      collectedLetters.push(f.letter);
      score += 20;
      updateHUD();
      updateWordDisplay();
      showCatchFlash(f.x, basketTop - 40, `+20`, false);
      App.toast(`✅ ${f.letter}`, 'success', 600);

      // Check word complete
      const cleaned = currentTarget.replace(/ /g, '');
      const collected = collectedLetters.filter(c => c !== ' ');
      if (collected.length >= cleaned.length) {
        score += 50;
        App.toast(`🎉 Word complete! +50 bonus`, 'success', 1500);
        showCatchFlash(basketX, basketTop - 80, `🎉 +50!`, false);
        setTimeout(loadWord, 1200);
      }
    } else {
      lives--;
      score = Math.max(0, score - 10);
      updateHUD();
      updateLivesDisplay();
      showCatchFlash(f.x, basketTop - 40, `-10`, true);
      shakeBasket();
      if (lives <= 0) { endGame(); }
    }
  }

  function showCatchFlash(x, y, text, isWrong) {
    const el = document.createElement('div');
    el.className = `catch-flash ${isWrong ? 'wrong' : ''}`;
    el.style.cssText = `left:${x}px; top:${y}px;`;
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

  // ── HUD ────────────────────────────────────────────────────
  function updateHUD() {
    const scoreEl = document.getElementById('falling-score');
    if (scoreEl) scoreEl.textContent = score;
  }

  function updateLivesDisplay() {
    const el = document.getElementById('falling-lives');
    if (el) el.textContent = '❤️'.repeat(lives) + '🖤'.repeat(Math.max(0, 3 - lives));
  }

  // ── Timer ──────────────────────────────────────────────────
  function startTimer() {
    updateTimerDisplay(timeLeft);
    gameTimer = setInterval(() => {
      timeLeft--;
      updateTimerDisplay(timeLeft);
      // Increase speed every 20s
      if (timeLeft % 20 === 0 && timeLeft > 0) {
        fallSpeed += 0.3;
      }
      if (timeLeft <= 0) endGame();
    }, 1000);
  }

  function updateTimerDisplay(t) {
    const el = document.getElementById('falling-timer');
    if (el) el.textContent = `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
  }

  // ── End ────────────────────────────────────────────────────
  function endGame() {
    gameRunning = false;
    clearInterval(gameTimer);
    clearInterval(spawnInterval);
    cancelAnimationFrame(animFrame);
    document.removeEventListener('keydown', onKeyDown);

    // Count completed words as "correct"
    const correct = Math.floor(score / 70);
    const total = Math.max(correct, words.length);
    UI.showResults({ score, correct, total, timeLeft, maxTime: GAME_TIME, gameType: 'falling' });
  }

  return { init };
})();
