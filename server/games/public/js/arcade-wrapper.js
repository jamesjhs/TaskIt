// ========== TaskIt! Arcade — Stage 1: Overlay & Routing ==========

/** Seconds added to the daily play budget when a token is spent. */
const TOKEN_TIME_EXTENSION_SECONDS = 30;

function setArcadeCatalogue(games) {
  const enabledGames = Array.isArray(games) ? games.filter(game => game.enabled !== false && game.enabled !== 0) : [];
  ARCADE_GAME_ORDER = enabledGames.map(g => g.id);
  ARCADE_GAMES = {};
  enabledGames.forEach(g => {
    ARCADE_GAMES[g.id] = {
      id: g.id,
      title: g.title,
      icon: g.icon,
      subtitle: g.subtitle,
      gameId: g.gameId,
      scriptPath: g.scriptPath,
      sortOrder: g.sortOrder,
      updatedAt: g.updatedAt,
      scripts: g.scripts || [],
      styles: g.styles || [],
      revision: g.revision || '',
    };
  });
}

window.TaskItArcade = window.TaskItArcade || {
  games: {},
  gamesByScriptPath: {},
  scoreAliases: new Map(),
  register(definition) {
    if (!definition || typeof definition.mount !== 'function') return;
    const scriptEl = document.currentScript;
    if (scriptEl && scriptEl.src) {
      try {
        definition.__scriptPath = new URL(scriptEl.src, window.location.href).pathname;
      } catch {
        definition.__scriptPath = scriptEl.getAttribute('src') || '';
      }
    }
    // The selected catalogue row owns identity; legacy module IDs are compatibility aliases.
    const moduleGameId = definition.gameId;
    definition.gameId = scriptEl?.dataset?.arcadeGameId || moduleGameId || definition.__scriptPath;
    if (moduleGameId && moduleGameId !== definition.gameId) this.scoreAliases.set(moduleGameId, definition.gameId);
    this.games[definition.gameId] = definition;
    if (definition.__scriptPath) this.gamesByScriptPath[definition.__scriptPath] = definition;
  },
  get(gameId) {
    return this.games[gameId] || null;
  },
  getByScriptPath(scriptPath) {
    return scriptPath ? (this.gamesByScriptPath[scriptPath] || null) : null;
  },
  unregister(gameId) {
    if (!gameId || !this.games[gameId]) return;
    const existing = this.games[gameId];
    if (existing.__scriptPath && this.gamesByScriptPath[existing.__scriptPath] === existing) {
      delete this.gamesByScriptPath[existing.__scriptPath];
    }
    delete this.games[gameId];
  },
  submitScore(gameIdOrPayload, maybeScore) {
    return submitArcadeHighScore(gameIdOrPayload, maybeScore);
  },
  getHighScores(gameId) {
    return getArcadeHighScores(gameId);
  },
};

function normalizeArcadeScorePayload(gameIdOrPayload, maybeScore) {
  const payload = typeof gameIdOrPayload === 'object' && gameIdOrPayload !== null
    ? gameIdOrPayload
    : { gameId: gameIdOrPayload, score: maybeScore };
  const requestedId = String(payload.gameId || '').trim();
  const gameId = window.TaskItArcade.scoreAliases.get(requestedId) || requestedId;
  const score = Number(payload.score);
  if (!/^[a-z0-9_-]{2,64}$/.test(gameId)) return null;
  if (!Number.isInteger(score) || score < 0 || score > 1000000000) return null;
  return { gameId, score };
}

async function submitArcadeHighScore(gameIdOrPayload, maybeScore) {
  const payload = normalizeArcadeScorePayload(gameIdOrPayload, maybeScore);
  if (!payload || !gamificationEnabled) return null;
  if (!arcadePseudonym) {
    _pendingArcadeScore = payload;
    openArcadePseudonymModal();
    toast('Choose an arcade name to post your score.');
    return null;
  }
  try {
    const saved = await api('POST', '/gamification/arcade/high-scores', payload);
    if (saved) toast('Score posted as ' + saved.pseudonym + '.');
    return saved;
  } catch (err) {
    toast(err.message || 'Could not post high score.', 'error');
    return null;
  }
}

async function getArcadeHighScores(gameId) {
  const requestedId = String(gameId || '').trim();
  const safeGameId = window.TaskItArcade.scoreAliases.get(requestedId) || requestedId;
  if (!/^[a-z0-9_-]{2,64}$/.test(safeGameId)) return [];
  return api('GET', '/gamification/arcade/high-scores/' + encodeURIComponent(safeGameId));
}

function readArcadeScoreOnExit(gameId) {
  if (!activeArcadeGameInstance) return null;
  const readers = ['getHighScore', 'getScore'];
  for (const reader of readers) {
    if (typeof activeArcadeGameInstance[reader] !== 'function') continue;
    const result = activeArcadeGameInstance[reader]();
    if (result === null || result === undefined) return null;
    const payload = typeof result === 'object' && result !== null
      ? { gameId, score: result.score }
      : { gameId, score: result };
    return normalizeArcadeScorePayload(payload);
  }
  return null;
}

function arcadeScriptSrc(game) {
  if (!game || !game.scriptPath) return '';
  const appVersion = window.APP_VERSION || window._serverVersion || 'dev';
  const version = appVersion + '-' + (game.updatedAt || Date.now()) + '-' + Date.now();
  return game.scriptPath + (game.scriptPath.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(version);
}

let arcadeStyleElements = [];
const arcadeDependencyScripts = new Map();

function clearArcadeStyles() {
  arcadeStyleElements.forEach(element => element.remove());
  arcadeStyleElements = [];
}

function arcadeDependencyUrl(url, game) {
  const parsed = new URL(url, new URL(game.scriptPath, window.location.origin));
  if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith('/games/')) {
    throw new Error('Game dependencies must be served from /games/');
  }
  parsed.searchParams.set('v', game.revision || game.updatedAt || window.APP_VERSION || 'dev');
  return parsed.href;
}

async function arcadeLoadGameDependencies(game, definition) {
  const dependencies = definition.dependencies || {};
  if (!Array.isArray(dependencies.styles || []) || !Array.isArray(dependencies.scripts || [])) {
    throw new Error("Game dependencies.styles and dependencies.scripts must be arrays");
  }
  clearArcadeStyles();
  const styles = (dependencies.styles || []).map(url => new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = arcadeDependencyUrl(url, game);
    link.onload = resolve;
    link.onerror = () => reject(new Error('Could not load game stylesheet: ' + url));
    arcadeStyleElements.push(link);
    document.head.appendChild(link);
  }));
  await Promise.all(styles);
  // Classic dependency scripts execute in declared order, after registration and before mount.
  // Cache successful loads by revision so libraries are not evaluated on every replay.
  for (const url of dependencies.scripts || []) {
    const src = arcadeDependencyUrl(url, game);
    if (!arcadeDependencyScripts.has(src)) {
      const pending = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => { script.remove(); resolve(); };
        script.onerror = () => { script.remove(); reject(new Error('Could not load game dependency: ' + url)); };
        document.head.appendChild(script);
      });
      arcadeDependencyScripts.set(src, pending);
      pending.catch(() => arcadeDependencyScripts.delete(src));
    }
    await arcadeDependencyScripts.get(src);
  }
}

async function arcadeEnsureGameScript(game) {
  clearArcadeStyles();
  if (!game || !game.scriptPath) return Promise.resolve();
  const existingForPath = window.TaskItArcade && window.TaskItArcade.getByScriptPath(game.scriptPath);
  if (existingForPath && typeof window.TaskItArcade.unregister === 'function') {
    window.TaskItArcade.unregister(existingForPath.gameId);
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = arcadeScriptSrc(game);
    script.dataset.arcadeGameId = game.gameId;
    script.dataset.arcadeScriptPath = game.scriptPath;
    script.async = true;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => reject(new Error('Could not load game script: ' + game.scriptPath));
    document.body.appendChild(script);
  });
  const definition = window.TaskItArcade.getByScriptPath(game.scriptPath);
  if (!definition) throw new Error('Selected script did not register a TaskItArcade game');
  await arcadeLoadGameDependencies(game, definition);
}

/**
 * Opens the Arcade overlay for the given achievement badge key.
 *
 * Access rules:
 *   • Regular users: key must be in `unlockedArcadeKeys`, which is populated
 *     purely by count — N earned achievements (any) unlock the first N games
 *     listed in ARCADE_GAME_ORDER, regardless of which achievements were earned.
 *   • Site administrators: all registered keys are accessible so they can
 *     test every game without needing to earn any badge first.
 *
 * Includes a Time Budget pre-game check: if the user has consumed all of
 * their daily play allowance the game frame shows a locked message instead
 * of launching the game.  Admins bypass the time budget entirely.
 *
 * Stage 2 game modules listen for the 'arcade:open' CustomEvent on
 * #arcadeOverlay to boot themselves; 'arcade:close' is fired on exit.
 *
 * @param {string} badgeKey - One of the keys in ARCADE_GAMES.
 */
async function openArcade(badgeKey) {
  const game = ARCADE_GAMES[badgeKey];
  if (!game) return;

  // Authorization check: the key must be in the server-verified unlock set,
  // OR the current user must be the site administrator.
  const isAdmin = currentUser && currentUser.role === 'admin';
  if (!isAdmin && !unlockedArcadeKeys.has(badgeKey)) return;

  const overlay = document.getElementById('arcadeOverlay');
  if (!overlay) return;

  // Populate header
  setArcadeGameIcon(document.getElementById('arcadeGameIcon'), game.icon);
  document.getElementById('arcadeTitle').textContent        = game.title;

  // Store active game context on the element for Stage 2 modules
  overlay.dataset.activeGame   = badgeKey;
  overlay.dataset.activeGameId = game.gameId;
  if (!overlay.dataset.historyPushed) {
    pushArcadeHistory(badgeKey, game.gameId);
    overlay.dataset.historyPushed = '1';
  }

  // ── Time Budget pre-game check ──────────────────────────────────────────
  // Daily play time is tracked per calendar day in localStorage.
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('arcadePlayDate') !== today) {
    localStorage.setItem('arcadePlayDate', today);
    localStorage.setItem('arcadePlaySeconds', '0');
  }
  const playedSeconds  = parseInt(localStorage.getItem('arcadePlaySeconds') || '0', 10);
  const limitSeconds   = arcadeDailyPlayMinutes * 60;
  const remainingSeconds = Math.max(0, limitSeconds - playedSeconds);

  // Sync token display
  updateArcadeTokenDisplays();

  // Show overlay with animation
  overlay.classList.remove('hidden', 'arcade-animating');
  void overlay.offsetWidth; // intentional: force CSS reflow so .arcade-animating restart is registered
  overlay.classList.add('arcade-animating');
  document.body.classList.add('arcade-open');

  // ── Time budget HUD ────────────────────────────────────────────────────
  arcadeUpdateTimeBudget(remainingSeconds);

  const frame = document.getElementById('arcadeGameFrame');
  frame.replaceChildren();

  // If the daily limit is reached (non-admin), show locked screen
  if (remainingSeconds <= 0 && !isAdmin) {
    const lockDiv = document.createElement('div');
    lockDiv.className = 'arcade-time-locked';
    const lockIcon = document.createElement('span');
    lockIcon.className = 'arcade-time-locked-icon';
    lockIcon.setAttribute('aria-hidden', 'true');
    lockIcon.textContent = '\u23F1\uFE0F';
    const lockTitle = document.createElement('p');
    lockTitle.className = 'arcade-time-locked-title';
    lockTitle.textContent = 'Arcade Locked';
    const lockSub = document.createElement('p');
    lockSub.className = 'arcade-time-locked-sub';
    lockSub.textContent = 'Complete a task to earn more break time!';
    lockDiv.appendChild(lockIcon);
    lockDiv.appendChild(lockTitle);
    lockDiv.appendChild(lockSub);
    frame.appendChild(lockDiv);
    // Game does not start — do not fire arcade:open
    return;
  }

  // Render the coming-soon placeholder; Stage 2 replaces this
  const placeholder = document.createElement('div');
  placeholder.className = 'arcade-coming-soon';
  const iconEl = document.createElement('span');
  iconEl.className = 'arcade-coming-soon-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  setArcadeGameIcon(iconEl, game.icon);
  const titleEl = document.createElement('p');
  titleEl.className = 'arcade-coming-soon-title';
  titleEl.textContent = game.title;
  const subEl = document.createElement('p');
  subEl.className = 'arcade-coming-soon-sub';
  subEl.textContent = 'Mini-game arriving in Stage 2 \u2014 watch this space!';
  placeholder.appendChild(iconEl);
  placeholder.appendChild(titleEl);
  placeholder.appendChild(subEl);
  frame.appendChild(placeholder);

  // Start tracking play time: increment once per second while the arcade is open
  arcadeStartPlayTimer(overlay, limitSeconds, playedSeconds);

  try {
    await arcadeEnsureGameScript(game);
    if (overlay.dataset.activeGame !== badgeKey) return;

    const registeredGame = window.TaskItArcade && game.scriptPath
      ? window.TaskItArcade.getByScriptPath(game.scriptPath)
      : null;
    if (registeredGame) {
      const runtimeGameId = game.gameId;
      overlay.dataset.activeGameId = runtimeGameId;
      const context = {
        badgeKey,
        gameId: runtimeGameId,
        configuredGameId: game.gameId,
        title: game.title,
        game,
        assetUrl: relativePath => new URL(relativePath, new URL(game.scriptPath, window.location.origin)).href,
        submitScore: score => window.TaskItArcade.submitScore({ gameId: runtimeGameId, score }),
        getHighScores: () => window.TaskItArcade.getHighScores(runtimeGameId),
        spendToken: async () => {
          const data = await api('POST', '/gamification/arcade/spend-token');
          if (!data || typeof data.arcadeTokens !== 'number') throw new Error('Could not confirm token purchase');
          arcadeTokens = data.arcadeTokens;
          updateArcadeTokenDisplays();
          return data;
        },
      };
      if (activeArcadeGameInstance && typeof activeArcadeGameInstance.unmount === 'function') {
        activeArcadeGameInstance.unmount();
      }
      const mountedGame = registeredGame.mount(frame, context);
      activeArcadeGameInstance = mountedGame || registeredGame;
      return;
    }

    if (game.scriptPath) {
      throw new Error('Selected arcade script loaded but did not register a TaskItArcade game.');
    }

    // Backward-compatible fallback for older modules that still listen for
    // arcade:open directly.
    const context = { badgeKey, gameId: game.gameId, configuredGameId: game.gameId, title: game.title, game };
    overlay.dispatchEvent(new CustomEvent('arcade:open', {
      bubbles: false,
      detail: context,
    }));
  } catch (err) {
    frame.replaceChildren();
    const errorDiv = document.createElement('div');
    errorDiv.className = 'arcade-coming-soon';
    const errorTitle = document.createElement('p');
    errorTitle.className = 'arcade-coming-soon-title';
    errorTitle.textContent = 'Game could not load';
    const errorSub = document.createElement('p');
    errorSub.className = 'arcade-coming-soon-sub';
    errorSub.textContent = err.message || 'Please try again later.';
    errorDiv.appendChild(errorTitle);
    errorDiv.appendChild(errorSub);
    frame.appendChild(errorDiv);
  }
}

/**
 * Updates the time budget row text and the spend-token button state.
 * @param {number} remainingSeconds
 */
function arcadeUpdateTimeBudget(remainingSeconds) {
  const budgetEl = document.getElementById('arcadeTimeBudget');
  const textEl   = document.getElementById('arcadeTimeBudgetText');
  const spendBtn = document.getElementById('arcadeSpendTokenBtn');
  if (!budgetEl || !textEl) return;

  if (remainingSeconds <= 0) {
    textEl.textContent = '\u23F1\uFE0F No time remaining today';
  } else {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    textEl.textContent = '\u23F1\uFE0F ' + m + 'm ' + (s < 10 ? '0' : '') + s + 's remaining';
  }
  if (spendBtn) spendBtn.disabled = arcadeTokens < 1;
  budgetEl.classList.remove('hidden');
}

/** Interval ID for the in-session play timer (cleared on close). */
let _arcadeTimerInterval = null;

/**
 * Starts the per-second play timer that accumulates usage in localStorage
 * and keeps the time-budget HUD updated.  Clears any existing interval first
 * so there is never more than one timer running at a time.
 * @param {Element} overlay   The arcade overlay element (used to detect close).
 * @param {number}  limitSeconds  User's configured daily cap in seconds.
 * @param {number}  startedAt    Seconds already played at session start.
 */
function arcadeStartPlayTimer(overlay, limitSeconds, startedAt) {
  if (_arcadeTimerInterval !== null) {
    clearInterval(_arcadeTimerInterval);
    _arcadeTimerInterval = null;
  }
  let elapsed = 0;
  _arcadeTimerInterval = setInterval(function() {
    if (overlay.classList.contains('hidden')) {
      clearInterval(_arcadeTimerInterval);
      _arcadeTimerInterval = null;
      return;
    }
    elapsed++;
    const totalPlayed = startedAt + elapsed;
    localStorage.setItem('arcadePlaySeconds', String(totalPlayed));
    const remaining = Math.max(0, limitSeconds - totalPlayed);
    arcadeUpdateTimeBudget(remaining);
  }, 1000);
}

/**
 * Spends 1 Arcade Token to extend the user's daily play budget by 30 seconds.
 * Calls the backend, updates the local state, and fires `arcade:addTime` on
 * the overlay so active game modules can extend their own countdown.
 */
async function arcadeSpendToken() {
  const spendBtn = document.getElementById('arcadeSpendTokenBtn');
  if (spendBtn) spendBtn.disabled = true;
  try {
    const overlay = document.getElementById('arcadeOverlay');
    if (activeArcadeGameInstance && typeof activeArcadeGameInstance.spendToken === 'function') {
      const message = await activeArcadeGameInstance.spendToken();
      if (message) toast(message);
    } else if (overlay && !overlay.classList.contains('hidden')) {
      const data = await api('POST', '/gamification/arcade/spend-token');
      if (!data) return;
      arcadeTokens = data.arcadeTokens;
      updateArcadeTokenDisplays();

      // Extend the stored daily budget by TOKEN_TIME_EXTENSION_SECONDS so the HUD updates immediately
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem('arcadePlayDate') === today) {
        const current = parseInt(localStorage.getItem('arcadePlaySeconds') || '0', 10);
        const extended = Math.max(0, current - TOKEN_TIME_EXTENSION_SECONDS);
        localStorage.setItem('arcadePlaySeconds', String(extended));
      }

      // Notify active game modules to inject extra seconds into their own timer
      if (activeArcadeGameInstance && typeof activeArcadeGameInstance.addTime === 'function') {
        activeArcadeGameInstance.addTime(TOKEN_TIME_EXTENSION_SECONDS);
      }
      overlay.dispatchEvent(new CustomEvent('arcade:addTime', {
        bubbles: false,
        detail: { seconds: TOKEN_TIME_EXTENSION_SECONDS },
      }));

      toast('+' + TOKEN_TIME_EXTENSION_SECONDS + ' seconds added! \uD83C\uDF89');
    }
  } catch (err) {
    toast(err.message || 'Could not spend token', 'error');
    if (spendBtn) spendBtn.disabled = arcadeTokens < 1;
  }
}

/**
 * Closes the Arcade overlay and restores the main app.
 */
function closeArcade(options = {}) {
  const overlay = document.getElementById('arcadeOverlay');
  if (!overlay || overlay.classList.contains('hidden')) return;

  if (options.updateHistory !== false && history.state?.arcadeBadgeKey) {
    history.back();
    return;
  }

  // Stop play timer
  if (_arcadeTimerInterval !== null) {
    clearInterval(_arcadeTimerInterval);
    _arcadeTimerInterval = null;
  }

  const exitScore = readArcadeScoreOnExit(overlay.dataset.activeGameId);

  // Notify Stage 2 modules so they can tear down canvases / timers
  overlay.dispatchEvent(new CustomEvent('arcade:close', {
    bubbles: false,
    detail: { gameId: overlay.dataset.activeGameId },
  }));
  if (activeArcadeGameInstance && typeof activeArcadeGameInstance.unmount === 'function') {
    activeArcadeGameInstance.unmount();
  }
  activeArcadeGameInstance = null;
  clearArcadeStyles();

  // Hide time budget row until next open
  const budgetEl = document.getElementById('arcadeTimeBudget');
  if (budgetEl) budgetEl.classList.add('hidden');

  overlay.classList.add('hidden');
  document.body.classList.remove('arcade-open');
  delete overlay.dataset.activeGame;
  delete overlay.dataset.activeGameId;
  delete overlay.dataset.historyPushed;

  if (exitScore) submitArcadeHighScore(exitScore).catch(() => {});
}

// Keyboard escape-hatch: pressing Escape closes the arcade
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeArcade();
});

/**
 * One-time setup for arcade badge interaction on the achievements list.
 * Delegated listeners are attached here (once) rather than inside
 * renderGamificationProfile to avoid any risk of duplicate handlers.
 * openArcade() enforces the real access check on every call.
 */
document.addEventListener('DOMContentLoaded', function() {
  // Back button in the arcade overlay
  const backBtn = document.getElementById('arcadeBackBtn');
  if (backBtn) backBtn.addEventListener('click', closeArcade);

  const pseudonymSaveBtn = document.getElementById('arcadePseudonymSaveBtn');
  if (pseudonymSaveBtn) pseudonymSaveBtn.addEventListener('click', saveArcadePseudonym);
  const pseudonymDismissBtn = document.getElementById('arcadePseudonymDismissBtn');
  if (pseudonymDismissBtn) pseudonymDismissBtn.addEventListener('click', dismissArcadePseudonymModal);
  const pseudonymInput = document.getElementById('arcadePseudonymInput');
  if (pseudonymInput) {
    pseudonymInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveArcadePseudonym();
      }
    });
  }
  const gamifPseudonymSaveBtn = document.getElementById('gamifArcadePseudonymSaveBtn');
  if (gamifPseudonymSaveBtn) gamifPseudonymSaveBtn.addEventListener('click', saveGamifArcadePseudonym);
  const gamifPseudonymInput = document.getElementById('gamifArcadePseudonymInput');
  if (gamifPseudonymInput) {
    gamifPseudonymInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveGamifArcadePseudonym();
      }
    });
  }

  const overlay = document.getElementById('arcadeOverlay');
  if (overlay) {
    overlay.addEventListener('arcade:score', function(e) {
      if (!e || !e.detail) return;
      const detail = { ...e.detail, gameId: e.detail.gameId || overlay.dataset.activeGameId };
      submitArcadeHighScore(detail).catch(() => {});
    });
  }

  // Delegated click/keyboard listeners for arcade badges in the achievements list.
  // Attached here once so there is never a risk of duplicate handlers across
  // multiple calls to renderGamificationProfile. openArcade() enforces the
  // real access check on every call.
  const achEl = document.getElementById('gamifArcadeGamesList');
  if (!achEl) return;
  achEl.addEventListener('click', function(e) {
    const badge = e.target.closest('[data-arcade-key]');
    if (badge) openArcade(badge.dataset.arcadeKey);
  });
  achEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      const badge = e.target.closest('[data-arcade-key]');
      if (badge) { e.preventDefault(); openArcade(badge.dataset.arcadeKey); }
    }
  });
});

