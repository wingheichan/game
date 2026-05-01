// ============================================================
//  LinguaPlay — High Scores Module
// ============================================================

const HighScores = (() => {

  let filterGame = 'all';
  let filterLang = 'all';

  function render() {
    const scores = App.getHighScores();
    const wrap = document.getElementById('highscores-list');
    if (!wrap) return;

    // Build unique langs
    const langs = [...new Set(scores.map(s => s.language))].filter(Boolean);

    // Filter
    const filtered = scores.filter(s => {
      const gameOk = filterGame === 'all' || s.gameType === filterGame;
      const langOk = filterLang === 'all' || s.language === filterLang;
      return gameOk && langOk;
    });

    // Filter bar
    document.getElementById('scores-filter-game').innerHTML = `
      <button class="cat-btn ${filterGame==='all'?'active':''}" onclick="HighScores.setFilter('game','all')">All Games</button>
      <button class="cat-btn ${filterGame==='quiz'?'active':''}" onclick="HighScores.setFilter('game','quiz')">Quiz</button>
      <button class="cat-btn ${filterGame==='memory'?'active':''}" onclick="HighScores.setFilter('game','memory')">Memory</button>
      <button class="cat-btn ${filterGame==='falling'?'active':''}" onclick="HighScores.setFilter('game','falling')">Falling Fruits</button>
      <button class="cat-btn ${filterGame==='fill'?'active':''}" onclick="HighScores.setFilter('game','fill')">Fill Blank</button>
    `;

    document.getElementById('scores-filter-lang').innerHTML = `
      <button class="subcat-btn ${filterLang==='all'?'active':''}" onclick="HighScores.setFilter('lang','all')">All Languages</button>
      ${langs.map(l => `<button class="subcat-btn ${filterLang===l?'active':''}" onclick="HighScores.setFilter('lang','${l}')">${l.charAt(0).toUpperCase()+l.slice(1)}</button>`).join('')}
    `;

    if (!filtered.length) {
      wrap.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
          <div style="font-size:3rem;margin-bottom:16px">🏆</div>
          <div style="font-family:var(--font-display);font-size:1.4rem;margin-bottom:8px">No scores yet!</div>
          <div>Play some games to see your scores here.</div>
        </div>`;
      return;
    }

    const gameIcons = { quiz:'🎯', memory:'🧠', falling:'🍎', fill:'✍️' };
    const rankEmoji = ['🥇','🥈','🥉'];
    const rankClass = ['gold','silver','bronze'];

    wrap.innerHTML = filtered.map((s, i) => `
      <div class="score-row fade-in">
        <div class="score-rank ${rankClass[i]||''}">${rankEmoji[i] || (i+1)}</div>
        <div class="score-info">
          <div class="score-name">${escapeHTML(s.name || 'Player')}</div>
          <div class="score-meta">
            ${gameIcons[s.gameType]||'🎮'} ${capitalize(s.gameType||'')} &nbsp;•&nbsp;
            ${capitalize(s.language||'')} &nbsp;•&nbsp;
            ${s.subcategory||''} &nbsp;•&nbsp;
            ${s.correct||0}/${s.total||0} correct (${s.pct||0}%) &nbsp;•&nbsp;
            ${s.date||''}
          </div>
        </div>
        <div class="score-points">${s.score}</div>
      </div>
    `).join('');
  }

  function setFilter(type, value) {
    if (type === 'game') filterGame = value;
    if (type === 'lang') filterLang = value;
    render();
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function escapeHTML(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function confirmClear() {
    document.getElementById('clear-modal').classList.add('open');
  }

  function doClear() {
    App.clearScores();
    document.getElementById('clear-modal').classList.remove('open');
    App.toast('All scores cleared!', 'info');
    render();
  }

  return { render, setFilter, confirmClear, doClear };
})();
