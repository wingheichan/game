// ============================================================
//  LinguaPlay — Memory Game Module
// ============================================================
//  Layout: Questions on LEFT, Answers on RIGHT
//  Mode 1: All cards closed (flip to reveal)
//  Mode 2: Cards open 10s then close (memorize then match)
//  Mode 3: All open (relaxed matching)
// ============================================================

const MemoryGame = (() => {
  const PAIRS = 8;
  const PREVIEW_SECONDS = 10;
  const GAME_TIME = 120; // 2 minutes

  let pairs = [];
  let selectedLeft  = null;
  let selectedRight = null;
  let matchedCount  = 0;
  let score         = 0;
  let wrongStreak   = 0;
  let mode          = 1;
  let gameTimer     = null;
  let timeLeft      = GAME_TIME;
  let shuffledRightOrder = [];

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    const { language, category, subcategory } = App.state;
    const words = await App.getVocabulary(language, category, subcategory);
    if (words.length < PAIRS) { App.toast('Not enough words. Try another subcategory!', 'error'); return; }
    pairs = words.slice(0, PAIRS);
    shuffledRightOrder = App.shuffle([...pairs]);
    matchedCount = 0;
    score = 0;
    wrongStreak = 0;
    selectedLeft = null;
    selectedRight = null;
    App.showPage('memory');
    renderBoard();
    setMode(mode);
  }

  // ── Mode Selection ─────────────────────────────────────────
  function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.mode) === m));
    // Restart with chosen mode
    startGame();
  }

  function startGame() {
    clearInterval(gameTimer);
    timeLeft = GAME_TIME;
    matchedCount = 0;
    score = 0;
    wrongStreak = 0;
    selectedLeft = null;
    selectedRight = null;

    // Reset cards
    document.querySelectorAll('.memory-card').forEach(c => {
      c.classList.remove('matched', 'selected');
    });

    updateHUD();

    if (mode === 1) {
      // All closed
      closeAllCards();
      startGameTimer();
    } else if (mode === 2) {
      // Show for 10 seconds then close
      openAllCards();
      startCountdown(PREVIEW_SECONDS, () => {
        closeAllCards();
        startGameTimer();
      });
    } else if (mode === 3) {
      // Open and stay open
      openAllCards();
      startGameTimer();
    }
  }

  // ── Board Rendering ────────────────────────────────────────
  function renderBoard() {
    const board = document.getElementById('memory-board');
    if (!board) return;
    board.innerHTML = `
      <div class="memory-col" id="left-col">
        <div class="memory-col-label">🌍 ${App.state.language.toUpperCase()}</div>
        ${pairs.map((p, i) => `
          <div class="memory-card" data-idx="${i}" data-side="left" onclick="MemoryGame.clickCard(this, ${i}, 'left')">
            <span class="card-face">${p.word}</span>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;align-items:center;font-size:1.5rem;color:var(--text-muted);padding:0 4px">↔</div>
      <div class="memory-col" id="right-col">
        <div class="memory-col-label">🇬🇧 ENGLISH</div>
        ${shuffledRightOrder.map((p, i) => `
          <div class="memory-card" data-idx="${i}" data-pair-idx="${pairs.indexOf(p)}" data-side="right" onclick="MemoryGame.clickCard(this, ${i}, 'right')">
            <span class="card-face">${p.translation}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── Card Interaction ───────────────────────────────────────
  function clickCard(el, idx, side) {
    if (el.classList.contains('matched')) return;
    if (mode === 1 || (mode === 2 && el.classList.contains('closed'))) {
      // Flip open
      el.classList.remove('closed');
    }

    if (side === 'left') {
      if (selectedLeft) selectedLeft.classList.remove('selected');
      selectedLeft = el;
      el.classList.add('selected');
    } else {
      if (selectedRight) selectedRight.classList.remove('selected');
      selectedRight = el;
      el.classList.add('selected');
    }

    if (selectedLeft && selectedRight) {
      checkMatch();
    }
  }

  function checkMatch() {
    const leftIdx  = parseInt(selectedLeft.dataset.idx);
    const rightPairIdx = parseInt(selectedRight.dataset.pairIdx);

    if (leftIdx === rightPairIdx) {
      // Match!
      matchedCount++;
      score += 150 - (wrongStreak * 10);
      score = Math.max(score, 10 * matchedCount);
      wrongStreak = 0;

      selectedLeft.classList.add('matched');
      selectedRight.classList.add('matched');
      selectedLeft.classList.remove('selected');
      selectedRight.classList.remove('selected');
      selectedLeft = null;
      selectedRight = null;
      App.toast('Match! ✨', 'success', 900);
      updateHUD();

      if (matchedCount === PAIRS) { setTimeout(endGame, 600); }
    } else {
      // Wrong
      wrongStreak++;
      score = Math.max(0, score - 20);
      selectedLeft.classList.add('shake');
      selectedRight.classList.add('shake');
      App.toast('Try again!', 'error', 800);

      setTimeout(() => {
        if (selectedLeft)  {
          selectedLeft.classList.remove('selected', 'shake');
          if (mode === 1) selectedLeft.classList.add('closed');
        }
        if (selectedRight) {
          selectedRight.classList.remove('selected', 'shake');
          if (mode === 1) selectedRight.classList.add('closed');
        }
        selectedLeft = null;
        selectedRight = null;
        updateHUD();
      }, 800);
    }
  }

  // ── Card State Helpers ─────────────────────────────────────
  function closeAllCards() {
    document.querySelectorAll('.memory-card:not(.matched)').forEach(c => c.classList.add('closed'));
  }

  function openAllCards() {
    document.querySelectorAll('.memory-card').forEach(c => c.classList.remove('closed'));
  }

  // ── Countdown overlay ─────────────────────────────────────
  function startCountdown(seconds, callback) {
    const el = document.getElementById('memory-countdown');
    el.style.display = 'block';
    let s = seconds;
    el.textContent = s;
    const iv = setInterval(() => {
      s--;
      el.textContent = s;
      if (s <= 0) {
        clearInterval(iv);
        el.style.display = 'none';
        callback();
      }
    }, 1000);
  }

  // ── Timer ──────────────────────────────────────────────────
  function startGameTimer() {
    updateTimerDisplay(timeLeft);
    gameTimer = setInterval(() => {
      timeLeft--;
      updateTimerDisplay(timeLeft);
      if (timeLeft <= 20) {
        document.getElementById('memory-timer')?.classList.add('timer-warning');
      }
      if (timeLeft <= 0) {
        clearInterval(gameTimer);
        endGame();
      }
    }, 1000);
  }

  function updateTimerDisplay(t) {
    const el = document.getElementById('memory-timer');
    if (el) el.textContent = `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
  }

  function updateHUD() {
    const scoreEl = document.getElementById('memory-score');
    const matchEl = document.getElementById('memory-matches');
    if (scoreEl) scoreEl.textContent = score;
    if (matchEl) matchEl.textContent = `${matchedCount}/${PAIRS}`;
  }

  // ── End ────────────────────────────────────────────────────
  function endGame() {
    clearInterval(gameTimer);
    const finalScore = score + (matchedCount === PAIRS ? timeLeft * 5 : 0);
    UI.showResults({ score: finalScore, correct: matchedCount, total: PAIRS, timeLeft, maxTime: GAME_TIME, gameType: 'memory' });
  }

  return { init, setMode, clickCard };
})();
