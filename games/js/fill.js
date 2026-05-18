// ============================================================
//  LinguaPlay — Fill in the Blank Game Module
// ============================================================

const FillGame = (() => {
  const TOTAL_QUESTIONS = 10;
  const TIME_PER_Q = 30;

  let sentences = [];
  let words = [];
  let current = 0;
  let correct = 0;
  let timer = null;
  let timeLeft = TIME_PER_Q;
  let totalTimeLeft = 0;
  let answered = false;
  let hintUsed = false;

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    const { language, category, subcategory } = App.state;
    sentences = await App.getSentences(language, category, subcategory);

    // Fallback: generate fill-in from vocabulary if no sentences
    if (!sentences.length) {
      words = await App.getVocabulary(language, category, subcategory);
      sentences = words.slice(0, TOTAL_QUESTIONS).map(w => ({
        sentence: `The word for "${w.hint}" is _____.`,
        answer: w.word,
        hint: w.translation
      }));
    }

    if (!sentences.length) { App.toast('No data for this selection!', 'error'); return; }
    sentences = sentences.slice(0, TOTAL_QUESTIONS);
    current = 0;
    correct = 0;
    totalTimeLeft = 0;
    App.ActiveGame.register(() => { clearInterval(timer); });
    App.showPage('fill');
    renderQuestion();
  }

  // ── Render ─────────────────────────────────────────────────
  function renderQuestion() {
    clearInterval(timer);
    if (current >= sentences.length) { endGame(); return; }
    answered = false;
    hintUsed = false;
    timeLeft = TIME_PER_Q;

    const q = sentences[current];
    const sentenceHTML = q.sentence.replace('_____', `<span class="fill-blank" id="blank-display">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>`);

    const container = document.getElementById('fill-container');
    container.innerHTML = `
      <div class="quiz-progress">
        Question ${current + 1} of ${sentences.length}
        <div class="progress-bar-wrap mt-sm">
          <div class="progress-bar" style="width:${(current / sentences.length) * 100}%"></div>
        </div>
      </div>
      <div class="fill-sentence-area bounce-in">
        <div class="fill-sentence">${sentenceHTML}</div>
        <input
          type="text"
          class="fill-input"
          id="fill-answer-input"
          placeholder="Type your answer…"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </div>
      <div class="flex gap-md justify-center flex-wrap">
        <button class="btn btn-primary" onclick="FillGame.submit()">✅ Check</button>
        <button class="btn btn-secondary btn-sm" onclick="FillGame.skip()">⏭ Skip</button>
      </div>
      <div id="fill-feedback" class="mt-md text-center" style="min-height:40px;font-size:1.1rem;font-weight:700;"></div>
    `;

    const input = document.getElementById('fill-answer-input');
    input.focus();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    input.addEventListener('input', (e) => {
      const blank = document.getElementById('blank-display');
      if (blank) blank.textContent = e.target.value || ' ';
    });

    updateHUD();
    startTimer();
  }

  // ── Submit ─────────────────────────────────────────────────
  function submit() {
    if (answered) return;
    const input = document.getElementById('fill-answer-input');
    if (!input) return;
    const userAnswer = input.value.trim();
    if (!userAnswer) { App.toast('Type an answer first!', 'info', 1000); return; }
    checkAnswer(userAnswer);
  }

  function checkAnswer(userAnswer) {
    answered = true;
    clearInterval(timer);
    totalTimeLeft += timeLeft;

    const q = sentences[current];
    const isCorrect = userAnswer.toLowerCase().trim() === q.answer.toLowerCase().trim();

    const input = document.getElementById('fill-answer-input');
    const feedback = document.getElementById('fill-feedback');

    if (isCorrect) {
      correct++;
      input.classList.add('correct');
      feedback.innerHTML = `<span style="color:var(--accent-mint)">✅ Correct! "${q.answer}"</span>`;
      App.toast('Correct! 🎉', 'success', 1200);
    } else {
      input.classList.add('wrong');
      input.classList.add('shake');
      feedback.innerHTML = `<span style="color:var(--accent-coral)">❌ Answer: <strong style="color:var(--text-primary)">${q.answer}</strong></span>`;
      App.toast('Incorrect!', 'error', 1200);
    }

    input.disabled = true;
    updateHUD();
    App.timer(() => { current++; renderQuestion(); }, 1600);
  }

  function skip() {
    if (answered) return;
    answered = true;
    clearInterval(timer);
    const q = sentences[current];
    const feedback = document.getElementById('fill-feedback');
    if (feedback) feedback.innerHTML = `<span style="color:var(--text-muted)">Skipped — Answer: <strong style="color:var(--text-primary)">${q.answer}</strong></span>`;
    App.timer(() => { current++; renderQuestion(); }, 1200);
  }

  // ── Timer ──────────────────────────────────────────────────
  function startTimer() {
    updateTimerRing(timeLeft, TIME_PER_Q);
    timer = setInterval(() => {
      timeLeft--;
      updateTimerRing(timeLeft, TIME_PER_Q);
      if (timeLeft <= 0) {
        clearInterval(timer);
        App.toast('Time up! ⏰', 'error', 1000);
        const q = sentences[current];
        const feedback = document.getElementById('fill-feedback');
        if (feedback) feedback.innerHTML = `<span style="color:var(--accent-coral)">⏰ Time's up! Answer: <strong style="color:var(--text-primary)">${q.answer}</strong></span>`;
        answered = true;
        App.timer(() => { current++; renderQuestion(); }, 1400);
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
    circle.style.stroke = left <= 8 ? 'var(--accent-coral)' : 'var(--accent-mint)';
    center.textContent = left;
    center.style.color = left <= 8 ? 'var(--accent-coral)' : 'var(--accent-mint)';
  }

  function updateHUD() {
    const scoreEl = document.getElementById('fill-score');
    const correctEl = document.getElementById('fill-correct');
    if (scoreEl) scoreEl.textContent = correct * 120;
    if (correctEl) correctEl.textContent = `${correct}/${sentences.length}`;
  }

  // ── End ────────────────────────────────────────────────────
  function endGame() {
    App.ActiveGame.register(null);
    clearInterval(timer);
    const score = App.calcScore(correct, sentences.length, totalTimeLeft, TIME_PER_Q * sentences.length);
    UI.showResults({ score, correct, total: sentences.length, timeLeft: totalTimeLeft, maxTime: TIME_PER_Q * sentences.length, gameType: 'fill' });
  }

  return { init, submit, skip };
})();
