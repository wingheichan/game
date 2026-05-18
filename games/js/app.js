// ============================================================
//  LinguaPlay — Core App Module
// ============================================================

const App = (() => {
  // ── State ──────────────────────────────────────────────────
  const state = {
    page: 'home',
    language: null,
    category: null,
    subcategory: null,
    game: null,
    vocabulary: [],
    highScores: [],
    playerName: localStorage.getItem('linguaplay_name') || 'Player'
  };

  // ── Data Cache ─────────────────────────────────────────────
  const cache = {};

  async function loadJSON(path) {
    if (cache[path]) return cache[path];
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cache[path] = data;
      return data;
    } catch (e) {
      console.error('Failed to load', path, e);
      return null;
    }
  }

  // ── Navigation ─────────────────────────────────────────────
  function showPage(id) {
    ActiveGame.stop();   // kill any running game before navigating
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pg = document.getElementById('page-' + id);
    if (pg) {
      pg.classList.add('active');
      pg.classList.add('fade-in');
      setTimeout(() => pg.classList.remove('fade-in'), 400);
    }
    document.querySelectorAll('.nav-links button').forEach(b => {
      b.classList.toggle('active', b.dataset.page === id);
    });
    state.page = id;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Toast ──────────────────────────────────────────────────
  function toast(msg, type = 'info', duration = 2500) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  // ── High Score System ──────────────────────────────────────
  function getHighScores() {
    try {
      return JSON.parse(localStorage.getItem('linguaplay_scores') || '[]');
    } catch { return []; }
  }

  function saveScore(entry) {
    const scores = getHighScores();
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score);
    localStorage.setItem('linguaplay_scores', JSON.stringify(scores.slice(0, 100)));
  }

  function clearScores() {
    localStorage.removeItem('linguaplay_scores');
  }

  // ── Vocabulary helper ──────────────────────────────────────
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function getVocabulary(lang, cat, subcat) {
    const data = await loadJSON('games/json/vocabulary.json');
    if (!data) return [];
    const words = data[lang]?.[cat]?.[subcat] ?? [];
    return shuffle(words);
  }

  async function getSentences(lang, cat, subcat) {
    const data = await loadJSON('games/json/fill-sentences.json');
    if (!data) return [];
    const sentences = data[lang]?.[cat]?.[subcat] ?? [];
    return shuffle(sentences);
  }

  async function getLanguages() {
    const data = await loadJSON('games/json/languages.json');
    return data?.languages ?? [];
  }

  // ── Scoring formula ────────────────────────────────────────
  function calcScore(correct, total, timeLeft, maxTime) {
    const accuracy = correct / total;
    const timeBonus = Math.round((timeLeft / maxTime) * 200);
    const base = Math.round(correct * 100 * accuracy);
    return base + timeBonus;
  }

  function getGrade(pct) {
    if (pct >= 95) return { label: '🏆 Perfect!', color: '#f9c846' };
    if (pct >= 80) return { label: '⭐ Excellent!', color: '#4ecdc4' };
    if (pct >= 65) return { label: '👍 Good Job!', color: '#38bdf8' };
    if (pct >= 50) return { label: '📚 Keep Practicing', color: '#a855f7' };
    return { label: '💪 Try Again!', color: '#ff6b6b' };
  }

  // ── Active-game cleanup registry ─────────────────────────────
  // Each game calls ActiveGame.register(cleanupFn) when it starts.
  // App.showPage() calls ActiveGame.stop() before switching pages
  // so timers/loops never leak into the background.
  // Tracked setTimeout — use App.timer() instead of setTimeout() in games.
  // All pending timers are cancelled automatically when the game stops.
  const _timers = new Set();
  function timer(fn, ms) {
    const id = setTimeout(() => { _timers.delete(id); fn(); }, ms);
    _timers.add(id);
    return id;
  }
  function clearAllTimers() {
    _timers.forEach(id => clearTimeout(id));
    _timers.clear();
  }

  const ActiveGame = {
    _fn: null,
    register(fn) { this._fn = fn; },
    stop() {
      clearAllTimers();                          // kill every pending setTimeout
      if (this._fn) { try { this._fn(); } catch(e){} this._fn = null; }
    }
  };

  // ── Public API ─────────────────────────────────────────────
  return {
    state,
    showPage,
    ActiveGame,
    timer,
    toast,
    loadJSON,
    getVocabulary,
    getSentences,
    getLanguages,
    shuffle,
    calcScore,
    getGrade,
    getHighScores,
    saveScore,
    clearScores
  };
})();
