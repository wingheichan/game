// ============================================================
//  LinguaPlay — Quiz Game Module
// ============================================================

const QuizGame = (() => {
  const TOTAL_QUESTIONS = 10;
  const TIME_PER_Q = 20;

  let words = [];
  let current = 0;
  let correct = 0;
  let timer = null;
  let timeLeft = TIME_PER_Q;
  let totalTimeLeft = 0;
  let answered = false;

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    const { language, category, subcategory } = App.state;
    words = await App.getVocabulary(language, category, subcategory);
    if (words.length < 4) {
      App.toast('Not enough vocabulary for this subcategory. Try another!', 'error');
      return;
    }
    words = words.slice(0, TOTAL_QUESTIONS);
    current = 0;
    correct = 0;
    totalTimeLeft = 0;
    App.showPage('quiz');
    renderQuestion();
  }

  // ── Render ─────────────────────────────────────────────────
  function renderQuestion() {
    clearInterval(timer);
    if (current >= words.length) { endGame(); return; }
    answered = false;
    timeLeft = TIME_PER_Q;

    const word = words[current];
    const allWords = cache_allWords();
    const options = buildOptions(word, allWords);

    const container = document.getElementById('quiz-container');
    container.innerHTML = `
      <div class="quiz-progress">
        Question ${current + 1} of ${words.length}
        <div class="progress-bar-wrap mt-sm">
          <div class="progress-bar" style="width: ${(current / words.length) * 100}%"></div>
        </div>
      </div>
      <div class="quiz-question bounce-in">
        <div class="word">${word.word}</div>
        <div class="hint">${word.hint}</div>
      </div>
      <div class="quiz-options">
        ${options.map((opt, i) => `
          <button class="quiz-option" data-answer="${opt.translation}" onclick="QuizGame.answer(this, '${esc(opt.translation)}', '${esc(word.translation)}')">
            <span style="opacity:0.5;font-size:0.8em;margin-right:8px">${String.fromCharCode(65+i)}.</span>
            ${opt.translation}
          </button>
        `).join('')}
      </div>
    `;

    updateHUD();
    startTimer();
  }

  function esc(s) { return s.replace(/'/g, "\\'"); }

  // Cache all words in current subcategory for option building
  let _cachedAll = null;
  function cache_allWords() {
    if (_cachedAll) return _cachedAll;
    _cachedAll = words;
    return words;
  }

  function buildOptions(correct, all) {
    const pool = App.shuffle(all.filter(w => w.translation !== correct.translation));
    const wrongs = pool.slice(0, 3);
    return App.shuffle([correct, ...wrongs]);
  }

  // ── Answer handling ────────────────────────────────────────
  function answer(btn, chosen, correctAns) {
    if (answered) return;
    answered = true;
    clearInterval(timer);
    totalTimeLeft += timeLeft;

    const isCorrect = chosen === correctAns;
    if (isCorrect) correct++;

    // Mark options
    document.querySelectorAll('.quiz-option').forEach(b => {
      b.classList.add('disabled');
      if (b.dataset.answer === correctAns) b.classList.add('correct');
      else if (b === btn && !isCorrect) b.classList.add('wrong');
    });

    if (!isCorrect) btn.classList.add('shake');
    updateHUD();

    setTimeout(() => { current++; renderQuestion(); }, 1200);
  }

  // ── Timer ──────────────────────────────────────────────────
  function startTimer() {
    updateTimerRing(timeLeft, TIME_PER_Q);
    timer = setInterval(() => {
      timeLeft--;
      updateTimerRing(timeLeft, TIME_PER_Q);
      if (timeLeft <= 5) {
        document.querySelector('.timer-center')?.classList.add('timer-warning');
      }
      if (timeLeft <= 0) {
        clearInterval(timer);
        App.toast('Time up!', 'error', 1000);
        // Auto-reveal
        document.querySelectorAll('.quiz-option').forEach(b => {
          b.classList.add('disabled');
          if (b.dataset.answer === words[current]?.translation) b.classList.add('correct');
        });
        setTimeout(() => { current++; renderQuestion(); }, 1000);
      }
    }, 1000);
  }

  function updateTimerRing(left, max) {
    const circle = document.querySelector('.timer-ring .fg');
    const center = document.querySelector('.timer-center');
    if (!circle || !center) return;
    const r = 22;
    const circ = 2 * Math.PI * r;
    const dash = (left / max) * circ;
    circle.style.strokeDasharray = `${dash} ${circ}`;
    circle.style.stroke = left <= 5 ? 'var(--accent-coral)' : 'var(--accent-mint)';
    center.textContent = left;
    center.style.color = left <= 5 ? 'var(--accent-coral)' : 'var(--accent-mint)';
  }

  function updateHUD() {
    const scoreEl = document.getElementById('quiz-score');
    const correctEl = document.getElementById('quiz-correct');
    if (scoreEl) scoreEl.textContent = correct * 100;
    if (correctEl) correctEl.textContent = `${correct}/${words.length}`;
  }

  // ── End ────────────────────────────────────────────────────
  function endGame() {
    clearInterval(timer);
    const score = App.calcScore(correct, words.length, totalTimeLeft, TIME_PER_Q * words.length);
    UI.showResults({ score, correct, total: words.length, timeLeft: totalTimeLeft, maxTime: TIME_PER_Q * words.length, gameType: 'quiz' });
  }

  return { init, answer };
})();
