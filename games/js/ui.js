// ============================================================
//  LinguaPlay — UI / Home Module
// ============================================================

const UI = (() => {

  // ── Render Language Cards ──────────────────────────────────
  async function renderLanguages() {
    const grid = document.getElementById('lang-grid');
    if (!grid) return;
    const languages = await App.getLanguages();
    grid.innerHTML = languages.map(lang => `
      <div class="lang-card bounce-in" data-lang="${lang.id}" onclick="UI.selectLanguage('${lang.id}')">
        <span class="lang-flag">${lang.flag}</span>
        <div class="lang-name">${lang.name}</div>
      </div>
    `).join('');
  }

  function selectLanguage(langId) {
    App.state.language = langId;
    App.state.category = null;
    App.state.subcategory = null;
    document.querySelectorAll('.lang-card').forEach(c =>
      c.classList.toggle('selected', c.dataset.lang === langId));
    App.toast(`Language set to ${langId.charAt(0).toUpperCase() + langId.slice(1)}`, 'success');
    renderCategories(langId);
    document.getElementById('game-select-section').classList.remove('hidden');
    document.getElementById('category-section').classList.remove('hidden');
  }

  // ── Render Categories ──────────────────────────────────────
  async function renderCategories(langId) {
    const catBtns = document.getElementById('cat-buttons');
    const subcatBtns = document.getElementById('subcat-buttons');
    catBtns.innerHTML = '';
    subcatBtns.innerHTML = '';

    const languages = await App.getLanguages();
    const lang = languages.find(l => l.id === langId);
    if (!lang) return;

    lang.categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-btn';
      btn.textContent = cat.name;
      btn.dataset.cat = cat.id;
      btn.onclick = () => selectCategory(lang, cat);
      catBtns.appendChild(btn);
    });
  }

  function selectCategory(lang, cat) {
    App.state.category = cat.id;
    App.state.subcategory = null;
    document.querySelectorAll('.cat-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.cat === cat.id));

    const subcatBtns = document.getElementById('subcat-buttons');
    subcatBtns.innerHTML = '';
    cat.subcategories.forEach(sub => {
      const btn = document.createElement('button');
      btn.className = 'subcat-btn';
      btn.textContent = sub;
      btn.dataset.sub = sub;
      btn.onclick = () => selectSubcategory(sub, btn);
      subcatBtns.appendChild(btn);
    });
    // auto-select first subcategory
    if (cat.subcategories.length > 0) {
      const firstBtn = subcatBtns.firstChild;
      selectSubcategory(cat.subcategories[0], firstBtn);
    }
  }

  function selectSubcategory(sub, btn) {
    App.state.subcategory = sub;
    document.querySelectorAll('.subcat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  // ── Launch Game ────────────────────────────────────────────
  function launchGame(gameId) {
    if (!App.state.language) { App.toast('Please select a language first!', 'error'); return; }
    if (!App.state.category)  { App.toast('Please select a category!', 'error'); return; }
    if (!App.state.subcategory) { App.toast('Please select a subcategory!', 'error'); return; }
    App.state.game = gameId;
    switch(gameId) {
      case 'quiz':    QuizGame.init(); break;
      case 'memory':  MemoryGame.init(); break;
      case 'falling': FallingGame.init(); break;
      case 'fill':    FillGame.init(); break;
    }
  }

  // ── Name Prompt ────────────────────────────────────────────
  function promptName() {
    const modal = document.getElementById('name-modal');
    modal.classList.add('open');
    const input = document.getElementById('name-input');
    input.value = App.state.playerName;
    input.focus();
  }

  function saveName() {
    const input = document.getElementById('name-input');
    const name = input.value.trim() || 'Player';
    App.state.playerName = name;
    localStorage.setItem('linguaplay_name', name);
    document.getElementById('name-modal').classList.remove('open');
    document.getElementById('nav-player-name').textContent = name;
    App.toast(`Welcome, ${name}!`, 'success');
  }

  // ── Show Results ───────────────────────────────────────────
  function showResults({ score, correct, total, timeLeft, maxTime, gameType }) {
    const pct = Math.round((correct / total) * 100) || 0;
    const grade = App.getGrade(pct);
    const lang = App.state.language;
    const sub  = App.state.subcategory;

    // Save score
    App.saveScore({
      name: App.state.playerName,
      score,
      correct,
      total,
      pct,
      language: lang,
      subcategory: sub,
      gameType,
      date: new Date().toLocaleDateString()
    });

    const resultsDiv = document.getElementById('results-content');
    resultsDiv.innerHTML = `
      <div class="score-display bounce-in">
        <div class="score-big">${score}</div>
        <div class="score-grade" style="color: ${grade.color}">${grade.label}</div>
        <div class="stars">${starsHTML(pct)}</div>
        <div class="score-breakdown mt-lg">
          <div class="score-stat">
            <div class="score-stat-value" style="color: var(--accent-mint)">${correct}/${total}</div>
            <div class="score-stat-label">Correct</div>
          </div>
          <div class="score-stat">
            <div class="score-stat-value" style="color: var(--accent-sky)">${pct}%</div>
            <div class="score-stat-label">Accuracy</div>
          </div>
          <div class="score-stat">
            <div class="score-stat-value" style="color: var(--accent-coral)">${score}</div>
            <div class="score-stat-label">Points</div>
          </div>
        </div>
        <div class="flex gap-md justify-center mt-lg flex-wrap">
          <button class="btn btn-primary" onclick="UI.launchGame('${gameType}')">🔄 Play Again</button>
          <button class="btn btn-secondary" onclick="App.showPage('home')">🏠 Home</button>
          <button class="btn btn-secondary" onclick="App.showPage('highscores'); HighScores.render()">🏆 High Scores</button>
        </div>
      </div>
    `;
    App.showPage('results');
  }

  function starsHTML(pct) {
    const full  = pct >= 80 ? 3 : pct >= 50 ? 2 : 1;
    const empty = 3 - full;
    return '⭐'.repeat(full) + '☆'.repeat(empty);
  }

  // ── Public ─────────────────────────────────────────────────
  return { renderLanguages, selectLanguage, renderCategories, launchGame, showResults, promptName, saveName };
})();
