/**
 * TaskIt! Arcade — Stage 2 Mini-Game: Whac-A-Bug
 * ================================================
 * GameId : 'whac_a_bug'
 * Badge  : task_50 (🐛 Whac-A-Bug)
 *
 * Self-contained IIFE — no globals are exported.
 *
 * Boots when #arcadeOverlay dispatches 'arcade:open' with
 * gameId === 'whac_a_bug'.  Tears down cleanly on 'arcade:close'.
 * Responds to 'arcade:addTime' to inject extra seconds (token economy).
 *
 * Mechanics:
 *   • 4×4 grid of bug holes.  55-second base timer.
 *   • Regular bugs (🐛) appear for ~1.8 s — clicking awards +1 point.
 *   • Golden bugs (✨) appear less often — clicking awards +3 points
 *     and adds 5 bonus seconds to the timer.  Their spawn rate slowly
 *     decreases as the game progresses (−1 weight per 10 elapsed seconds,
 *     floor of 5).
 *   • System errors (💀) appear occasionally — clicking deducts 10 points
 *     AND applies a 5-second time penalty.
 *   • Bugs that are not clicked in time simply disappear.
 *   • Spawn rate ramps up linearly: +5 % speed every 30 seconds of play.
 *
 * CSS classes are defined in app.css under the .wab-* namespace.
 */
(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────

  /** Total cells in the 4×4 grid. */
  const GRID_SIZE = 16;
  /** Base game duration in seconds. */
  const BASE_DURATION = 55;

  /**
   * Bug type definitions.
   *   weight    — relative spawn probability (must sum to TOTAL_WEIGHT below).
   *   duration  — milliseconds the bug stays visible before auto-hiding.
   *   emoji     — displayed inside the cell.
   *   points    — score delta when clicked.
   *   bonusTime — extra seconds added to the timer when clicked (0 for none).
   *   cssClass  — appended to .wab-cell to give the cell its colour.
   */
  const BUG_TYPES = [
    { id: 'bug',    weight: 70, duration: 1800, emoji: '\uD83D\uDC1B', points:  1, bonusTime: 0, cssClass: 'wab-cell--bug'    },
    { id: 'golden', weight: 20, duration: 1400, emoji: '\u2728',       points:  3, bonusTime: 5, cssClass: 'wab-cell--golden' },
    { id: 'error',  weight: 10, duration: 2200, emoji: '\uD83D\uDC80', points: -10, bonusTime: 0, cssClass: 'wab-cell--error'  },
  ];

  const TOTAL_WEIGHT = BUG_TYPES.reduce(function (s, b) { return s + b.weight; }, 0);

  /** Minimum ms between two consecutive spawns (base rate). */
  const SPAWN_INTERVAL_MS = 700;

  // ── Game state ────────────────────────────────────────────────────────────

  /** Current score. */
  let _score = 0;
  /** Remaining seconds on the countdown. */
  let _timeLeft = BASE_DURATION;
  /** Whether a game session is currently running. */
  let _active = false;
  /** Whether the round has ended. */
  let _over = false;
  /** Elapsed seconds since the game started (used for speed ramping). */
  let _elapsedSeconds = 0;
  /** Current speed multiplier; increases by 5 % every 30 elapsed seconds. */
  let _speedMultiplier = 1.0;

  /**
   * Per-cell state.  Index corresponds to the DOM cell index (0–15).
   * Each entry: { bugType: BUG_TYPES[n] | null, timeoutId: number | null }
   */
  const _cells = Array.from({ length: GRID_SIZE }, function () {
    return { bugType: null, timeoutId: null };
  });

  /** Main 1-second countdown interval. */
  let _countdownInterval = null;
  /** Spawn scheduler interval. */
  let _spawnInterval = null;

  // ── Weighted-random bug picker ─────────────────────────────────────────────

  /**
   * Returns a dynamically-weighted bug type.
   * The golden-bug weight starts at 20 and decreases by 1 for every 10
   * elapsed seconds, down to a minimum of 5, so golden bugs become rarer
   * as the game progresses.
   */
  function pickBugType() {
    var goldenWeight = Math.max(5, BUG_TYPES[1].weight - Math.floor(_elapsedSeconds / 10));
    var weights = [BUG_TYPES[0].weight, goldenWeight, BUG_TYPES[2].weight];
    var total   = weights.reduce(function (s, w) { return s + w; }, 0);
    var roll    = Math.random() * total;
    var cumulative = 0;
    for (var i = 0; i < BUG_TYPES.length; i++) {
      cumulative += weights[i];
      if (roll < cumulative) return BUG_TYPES[i];
    }
    return BUG_TYPES[0];
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Reset and start a fresh game. */
  function startGame() {
    _score          = 0;
    _timeLeft       = BASE_DURATION;
    _active         = true;
    _over           = false;
    _elapsedSeconds = 0;
    _speedMultiplier = 1.0;
    _cells.forEach(function (c) { c.bugType = null; c.timeoutId = null; });
    render();
    startTimers();
  }

  /** Clear all running intervals and outstanding cell timeouts. */
  function stopTimers() {
    if (_countdownInterval !== null) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
    }
    if (_spawnInterval !== null) {
      clearInterval(_spawnInterval);
      _spawnInterval = null;
    }
    _cells.forEach(function (c) {
      if (c.timeoutId !== null) {
        clearTimeout(c.timeoutId);
        c.timeoutId = null;
      }
    });
  }

  /**
   * (Re-)starts the spawn scheduler at the current speed multiplier.
   * Called on game start and every time the multiplier changes.
   */
  function restartSpawnInterval() {
    if (_spawnInterval !== null) {
      clearInterval(_spawnInterval);
      _spawnInterval = null;
    }
    var intervalMs = SPAWN_INTERVAL_MS / _speedMultiplier;
    _spawnInterval = setInterval(function () {
      if (!_active || _over) return;
      spawnBug();
    }, intervalMs);
  }

  /** Start the countdown and spawn scheduler. */
  function startTimers() {
    // 1-second countdown with linear speed ramp
    _countdownInterval = setInterval(function () {
      if (!_active) return;
      _timeLeft--;
      _elapsedSeconds++;
      updateHud();
      if (_timeLeft <= 0) { endGame(); return; }

      // Recalculate speed multiplier: +5 % per 30 elapsed seconds
      var newMultiplier = 1.0 + 0.05 * Math.floor(_elapsedSeconds / 30);
      if (newMultiplier !== _speedMultiplier) {
        _speedMultiplier = newMultiplier;
        restartSpawnInterval();
      }
    }, 1000);

    restartSpawnInterval();
  }

  // ── Spawn logic ────────────────────────────────────────────────────────────

  function spawnBug() {
    // Collect indices of cells that are currently empty
    var emptyIndices = [];
    for (var i = 0; i < GRID_SIZE; i++) {
      if (_cells[i].bugType === null) emptyIndices.push(i);
    }
    if (emptyIndices.length === 0) return;

    var idx     = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    var bugType = pickBugType();
    _cells[idx].bugType = bugType;

    // Update cell appearance
    var cellEl = document.getElementById('wab-cell-' + idx);
    if (!cellEl) return;
    cellEl.textContent = bugType.emoji;
    cellEl.className   = 'wab-cell ' + bugType.cssClass;

    // Auto-hide after the bug's duration elapses
    var tid = setTimeout(function () {
      hideBug(idx);
    }, bugType.duration);
    _cells[idx].timeoutId = tid;
  }

  function hideBug(idx) {
    _cells[idx].bugType   = null;
    _cells[idx].timeoutId = null;
    var cellEl = document.getElementById('wab-cell-' + idx);
    if (cellEl) {
      cellEl.textContent = '';
      cellEl.className   = 'wab-cell';
    }
  }

  // ── Click handler ──────────────────────────────────────────────────────────

  function handleCellClick(idx) {
    if (!_active || _over) return;
    var cell = _cells[idx];
    if (!cell.bugType) return; // empty hole — no-op

    var bugType = cell.bugType;

    // Cancel the auto-hide timeout
    if (cell.timeoutId !== null) {
      clearTimeout(cell.timeoutId);
      cell.timeoutId = null;
    }

    // Award points and bonus time (or apply time penalty for errors)
    _score = Math.max(-999, _score + bugType.points);
    if (bugType.bonusTime > 0) {
      _timeLeft = Math.min(_timeLeft + bugType.bonusTime, 999);
    } else if (bugType.id === 'error') {
      _timeLeft = Math.max(0, _timeLeft - 5);
    }

    updateHud();
    if (_timeLeft <= 0) { endGame(); return; }

    // Brief whack animation then hide
    var cellEl = document.getElementById('wab-cell-' + idx);
    if (cellEl) {
      cellEl.classList.add('wab-cell--whacked');
      setTimeout(function () { hideBug(idx); }, 180);
    } else {
      hideBug(idx);
    }
  }

  // ── HUD updates ───────────────────────────────────────────────────────────

  function updateHud() {
    var scoreEl = document.getElementById('wab-score');
    var timerEl = document.getElementById('wab-timer');
    if (scoreEl) scoreEl.textContent = 'Score: ' + _score;
    if (timerEl) {
      timerEl.textContent = '\u23F1\uFE0F ' + _timeLeft + 's';
      if (_timeLeft <= 10) {
        timerEl.classList.add('wab-timer-danger');
      } else {
        timerEl.classList.remove('wab-timer-danger');
      }
    }
  }

  // ── End game ──────────────────────────────────────────────────────────────

  function endGame() {
    _over   = true;
    _active = false;
    stopTimers();

    // Hide all remaining bugs
    for (var i = 0; i < GRID_SIZE; i++) {
      if (_cells[i].bugType !== null) hideBug(i);
    }

    var msgEl    = document.getElementById('wab-msg');
    var replayEl = document.getElementById('wab-replay');
    if (msgEl) {
      if (_score > 0) {
        msgEl.textContent = '\uD83C\uDF89 Time\u2019s up! Final score: ' + _score;
        msgEl.style.color = '';
      } else {
        msgEl.textContent = '\uD83D\uDCA5 Better luck next time! Score: ' + _score;
        msgEl.style.color = 'var(--wab-err)';
      }
    }
    if (replayEl) replayEl.style.display = 'inline-block';
  }

  // ── Full render ────────────────────────────────────────────────────────────

  function render() {
    var frame = document.getElementById('arcadeGameFrame');
    if (!frame) return;
    frame.innerHTML = '';

    var root = document.createElement('div');
    root.className = 'wab-root';

    // HUD
    var hud = document.createElement('div');
    hud.className = 'wab-hud';

    var scoreEl = document.createElement('span');
    scoreEl.id          = 'wab-score';
    scoreEl.textContent = 'Score: 0';

    var timerEl = document.createElement('span');
    timerEl.id          = 'wab-timer';
    timerEl.textContent = '\u23F1\uFE0F ' + BASE_DURATION + 's';

    hud.appendChild(scoreEl);
    hud.appendChild(timerEl);
    root.appendChild(hud);

    // 4×4 grid
    var grid = document.createElement('div');
    grid.className = 'wab-grid';

    for (var i = 0; i < GRID_SIZE; i++) {
      var cell = document.createElement('div');
      cell.className = 'wab-cell';
      cell.id        = 'wab-cell-' + i;
      // IIFE to capture i in the closure
      (function (idx) {
        cell.addEventListener('click', function () { handleCellClick(idx); });
      }(i));
      grid.appendChild(cell);
    }
    root.appendChild(grid);

    // End message
    var msgEl = document.createElement('p');
    msgEl.id        = 'wab-msg';
    msgEl.className = 'wab-msg';
    root.appendChild(msgEl);

    // Replay button
    var replayBtn = document.createElement('button');
    replayBtn.id        = 'wab-replay';
    replayBtn.className = 'wab-replay';
    replayBtn.textContent = '\uD83D\uDD04 Play Again';
    replayBtn.addEventListener('click', function () {
      stopTimers();
      startGame();
    });
    root.appendChild(replayBtn);

    frame.appendChild(root);
  }

  // ── Arcade event wiring ───────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var overlay = document.getElementById('arcadeOverlay');
    if (!overlay) return;

    overlay.addEventListener('arcade:open', function (e) {
      if (e.detail.gameId !== 'whac_a_bug') return;
      _active = true;
      startGame();
    });

    overlay.addEventListener('arcade:close', function () {
      if (!_active && !_over) return;
      _active = false;
      stopTimers();
    });

    // Token economy: inject extra seconds into the running timer
    overlay.addEventListener('arcade:addTime', function (e) {
      if (overlay.dataset.activeGameId !== 'whac_a_bug') return;
      if (!_active || _over) return;
      var extra = (e.detail && e.detail.seconds) ? e.detail.seconds : 30;
      _timeLeft = Math.min(_timeLeft + extra, 999);
      updateHud();
    });
  });

}());
