/**
 * TaskIt! Arcade - Second Look
 * Game ID: second_look
 *
 * A short observation game: study one task, let time pass, then tap the
 * changed details. Arcade tokens buy hints instead of extra time.
 */
(function () {
  'use strict';

  // Stable arcade identifier used when reading and submitting this game's scores.
  var GAME_ID = 'second_look';
  // Lives are shared across every round in the current level, then reset on level-up.
  var LIVES_PER_LEVEL = 4;
  // The player studies the original task for this many seconds before it changes.
  var PREVIEW_SECONDS = 5;
  // Brief overlay duration between showing the original task and asking for changes.
  var TRANSITION_MS = 800;
  // Difficulty progression: visible task fields, maximum changes, rounds, and search time.
  var LEVELS = [
    { name: 'Intro', columns: ['status', 'title', 'due'], changes: 2, games: 4, findSeconds: 18 },
    { name: 'Focused', columns: ['status', 'title', 'due', 'priority'], changes: 3, games: 5, findSeconds: 20 },
    { name: 'Sharp', columns: ['status', 'title', 'due', 'priority', 'tag'], changes: 4, games: 6, findSeconds: 24 },
    { name: 'Expert', columns: ['status', 'title', 'due', 'priority', 'tag', 'end'], changes: 5, games: 7, findSeconds: 28 },
  ];

  // Point values are centralized so scoring rules remain easy to review and tune.
  var SCORE = {
    detail: 100,
    timeDetail: 150,
    wrong: -50,
    missed: -75,
    perfect: 300,
    speed: 50,
    streak: 25,
  };

  // Sample data keeps the game self-contained; each title has a deliberately similar variant.
  var TASK_TITLES = [
    'Submit report', 'Confirm booking', 'Review notes', 'Send invoice',
    'Plan sprint', 'Book appointment', 'Email client', 'Prepare agenda',
  ];
  // Explicit variants avoid awkward pluralization when generating a changed title.
  var TITLE_VARIANTS = {
    'Submit report': 'Submit reports',
    'Confirm booking': 'Confirm bookings',
    'Review notes': 'Review note',
    'Send invoice': 'Send invoices',
    'Plan sprint': 'Plan sprint notes',
    'Book appointment': 'Book appointments',
    'Email client': 'Email clients',
    'Prepare agenda': 'Prepare agendas',
  };
  // Tags carry both display text and a CSS color name used by the task renderer.
  var TAGS = [
    { name: 'Work', color: 'blue' },
    { name: 'Home', color: 'green' },
    { name: 'Admin', color: 'amber' },
    { name: 'Study', color: 'violet' },
    { name: 'Health', color: 'rose' },
  ];
  // Ordered options are cycled when producing a changed priority.
  var PRIORITIES = ['Low', 'Med', 'High'];

  // The single mutable model for the game. Rendering reads it; game actions update it.
  var state = {
    // Host element and lifecycle/phase control.
    frame: null,
    active: false,
    phase: 'idle',
    // Progress through LEVELS and the current level's shared life pool.
    levelIndex: 0,
    roundIndex: 0,
    levelLives: LIVES_PER_LEVEL,
    // Accumulated score and accuracy-related counters.
    score: 0,
    streak: 0,
    wrongClicks: 0,
    totalChanges: 0,
    totalFound: 0,
    // Per-detail lookup maps: membership/value indicates a UI selection or outcome.
    selectedIds: {},
    foundChangeIds: {},
    missedChangeIds: {},
    incorrectIds: {},
    hintedIds: {},
    hintFlashIds: {},
    // The original task, its altered version, and the changes the player must find.
    currentOriginal: null,
    currentChanged: null,
    activeChanges: [],
    // Current-round scoring counters and the start time used for speed bonuses.
    roundFound: 0,
    roundWrong: 0,
    roundMissed: 0,
    roundLivesLost: 0,
    roundScore: 0,
    findStartedAt: 0,
    countdownLabel: '',
    // Handles let phase changes and unmount reliably cancel pending callbacks.
    timers: [],
    intervals: [],
    // Completion/scoreboard integration state.
    completed: false,
    finalRating: null,
    lastScorePayload: null,
    scoreSubmitted: false,
    leaderboardRows: [],
    leaderboardStatus: 'Loading scores...',
    originalSpendButtonText: '',
  };

  // Choose one array element uniformly at random; callers provide a non-empty list.
  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  // Return a shuffled copy using Fisher-Yates, leaving the caller's array untouched.
  function shuffle(items) {
    var copy = items.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  // Format a numeric hour or minute as two digits for the task's HH:MM display.
  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // Convert minutes since midnight into a zero-padded clock string.
  function minutesToTime(minutes) {
    return pad2(Math.floor(minutes / 60)) + ':' + pad2(minutes % 60);
  }

  // Parse the HH:MM string representation into minutes since midnight.
  function timeToMinutes(value) {
    var parts = value.split(':');
    return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
  }

  // Move a displayed task time by a small amount while keeping it near work hours.
  function shiftTime(value) {
    var minutes = timeToMinutes(value) + randomItem([-30, -15, 15, 30]);
    if (minutes < 8 * 60) minutes += 45;
    if (minutes > 17 * 60) minutes -= 45;
    return minutesToTime(minutes);
  }

  // Select an option other than the current one, falling back if no alternative exists.
  function nextDifferent(value, pool) {
    var choices = pool.filter(function (item) { return item !== value; });
    return randomItem(choices.length ? choices : pool);
  }

  // Make a JSON-safe deep copy of the plain task record before applying alterations.
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Cancel every outstanding timeout and interval, then discard their handles.
  function clearTimers() {
    state.timers.forEach(function (id) { clearTimeout(id); });
    state.intervals.forEach(function (id) { clearInterval(id); });
    state.timers = [];
    state.intervals = [];
  }

  // Register a timeout and remove its handle when it fires so cleanup stays accurate.
  function setTimeoutTracked(fn, ms) {
    var id = setTimeout(function () {
      state.timers = state.timers.filter(function (timerId) { return timerId !== id; });
      fn();
    }, ms);
    state.timers.push(id);
    return id;
  }

  // Register a repeating callback so clearTimers/unmount can stop it later.
  function setIntervalTracked(fn, ms) {
    var id = setInterval(fn, ms);
    state.intervals.push(id);
    return id;
  }

  // Restore all per-session counters and transient data to their initial values.
  function resetSession() {
    clearTimers();
    state.phase = 'idle';
    state.levelIndex = 0;
    state.roundIndex = 0;
    state.levelLives = LIVES_PER_LEVEL;
    state.score = 0;
    state.streak = 0;
    state.wrongClicks = 0;
    state.totalChanges = 0;
    state.totalFound = 0;
    state.selectedIds = {};
    state.foundChangeIds = {};
    state.missedChangeIds = {};
    state.incorrectIds = {};
    state.hintedIds = {};
    state.hintFlashIds = {};
    state.currentOriginal = null;
    state.currentChanged = null;
    state.activeChanges = [];
    state.roundFound = 0;
    state.roundWrong = 0;
    state.roundMissed = 0;
    state.roundLivesLost = 0;
    state.roundScore = 0;
    state.findStartedAt = 0;
    state.countdownLabel = '';
    state.completed = false;
    state.finalRating = null;
    state.lastScorePayload = null;
    state.scoreSubmitted = false;
    state.leaderboardRows = [];
    state.leaderboardStatus = 'Loading scores...';
  }

  // Sum the configured rounds across all difficulty levels for HUD progress.
  function totalGames() {
    return LEVELS.reduce(function (sum, level) { return sum + level.games; }, 0);
  }

  // Count rounds belonging to levels already passed, excluding the current level.
  function completedGamesBeforeCurrentLevel() {
    return LEVELS.slice(0, state.levelIndex).reduce(function (sum, level) {
      return sum + level.games;
    }, 0);
  }

  // Convert zero-based level/round indices to a player-facing one-based game number.
  function overallGameNumber() {
    return completedGamesBeforeCurrentLevel() + state.roundIndex + 1;
  }

  // Create one synthetic task whose fields form the baseline the player memorizes.
  function generateTask(roundIndex) {
    // Round index gently advances times and cycles priority without using real user data.
    var baseMinutes = (9 * 60) + (roundIndex * 35) + randomItem([0, 15]);
    var endMinutes = baseMinutes + randomItem([30, 45, 60, 75]);
    var tag = TAGS[(roundIndex + Math.floor(Math.random() * TAGS.length)) % TAGS.length];
    return {
      id: 'task-1',
      done: Math.random() < 0.35,
      title: randomItem(TASK_TITLES),
      due: minutesToTime(baseMinutes),
      end: minutesToTime(endMinutes),
      priority: PRIORITIES[roundIndex % PRIORITIES.length],
      tag: tag.name,
      tagColor: tag.color,
    };
  }

  // Describe every field that can change, including its old/new values and display ID.
  function buildChangeCandidates(task) {
    return [
      { id: 'task-1-status', field: 'done', kind: 'detail', before: task.done, after: !task.done, label: 'status' },
      { id: 'task-1-title', field: 'title', kind: 'detail', before: task.title, after: TITLE_VARIANTS[task.title] || (task.title + 's'), label: 'title' },
      { id: 'task-1-due', field: 'due', kind: 'time', before: task.due, after: shiftTime(task.due), label: 'due time' },
      { id: 'task-1-priority', field: 'priority', kind: 'detail', before: task.priority, after: nextDifferent(task.priority, PRIORITIES), label: 'priority' },
      { id: 'task-1-tag', field: 'tag', kind: 'detail', before: task.tag, after: nextDifferent(task.tag, TAGS.map(function (tag) { return tag.name; })), label: 'tag' },
      { id: 'task-1-end', field: 'end', kind: 'time', before: task.end, after: shiftTime(task.end), label: 'end time' },
    ];
  }

  // Return the active difficulty configuration, with a safe fallback for invalid indices.
  function currentLevel() {
    return LEVELS[state.levelIndex] || LEVELS[0];
  }

  // Map internal field name "done" to the visible column name "status" before checking.
  function candidateIsVisible(change, level) {
    return level.columns.indexOf(change.field === 'done' ? 'status' : change.field) !== -1;
  }

  // Choose a random, difficulty-appropriate subset of task details to alter this round.
  function generateChanges(task) {
    var level = currentLevel();
    var candidates = buildChangeCandidates(task).filter(function (change) {
      return candidateIsVisible(change, level);
    });
    var maxCount = Math.min(level.changes, candidates.length);
    var count = 1 + Math.floor(Math.random() * maxCount);
    var selected = shuffle(candidates).slice(0, count);
    return shuffle(selected).map(function (change) {
      change.found = false;
      return change;
    });
  }

  // Produce the second task view by copying the baseline and applying selected changes.
  function applyChanges(task, changes) {
    var changed = clone(task);
    changes.forEach(function (change) {
      changed[change.field] = change.after;
      if (change.field === 'tag') {
        var tag = TAGS.filter(function (item) { return item.name === change.after; })[0];
        if (tag) changed.tagColor = tag.color;
      }
    });
    return changed;
  }

  // Start a fresh session, load scores asynchronously, and enter the first level.
  function startGame() {
    resetSession();
    state.active = true;
    loadLeaderboard();
    startLevel(0);
  }

  // Begin a level with a restored life pool, then start its first round.
  function startLevel(levelIndex) {
    state.levelIndex = levelIndex;
    state.levelLives = LIVES_PER_LEVEL;
    startRound(0);
  }

  // Reset round-only state, generate both task views, then launch the memorization timer.
  function startRound(roundIndex) {
    clearTimers();
    state.roundIndex = roundIndex;
    state.phase = 'preview';
    state.selectedIds = {};
    state.foundChangeIds = {};
    state.missedChangeIds = {};
    state.incorrectIds = {};
    state.hintedIds = {};
    state.hintFlashIds = {};
    state.roundFound = 0;
    state.roundWrong = 0;
    state.roundMissed = 0;
    state.roundLivesLost = 0;
    state.roundScore = 0;
    state.streak = 0;
    state.currentOriginal = generateTask(roundIndex);
    state.activeChanges = generateChanges(state.currentOriginal);
    state.currentChanged = applyChanges(state.currentOriginal, state.activeChanges);
    state.totalChanges += state.activeChanges.length;
    startCountdown(PREVIEW_SECONDS, function (left) {
      state.countdownLabel = left + 's';
      renderGame();
    }, startTransition);
    renderGame();
  }

  // Move from preview to a short transition overlay, guarding against stale callbacks.
  function startTransition() {
    if (!state.active || state.phase !== 'preview') return;
    clearTimers();
    state.phase = 'transition';
    state.countdownLabel = '';
    renderGame();
    setTimeoutTracked(startFinding, TRANSITION_MS);
  }

  // Reveal the altered task and start the level-specific time limit for finding changes.
  function startFinding() {
    if (!state.active || state.phase !== 'transition') return;
    clearTimers();
    state.phase = 'finding';
    state.findStartedAt = Date.now();
    startCountdown(currentLevel().findSeconds, function (left) {
      state.countdownLabel = left + 's';
      renderHudOnly();
    }, function () {
      endRound('timeout');
    });
    renderGame();
  }

  // Run a deadline-based countdown; onTick receives remaining whole seconds.
  function startCountdown(seconds, onTick, onDone) {
    // Derive remaining time from a fixed deadline rather than decrementing each interval.
    var endAt = Date.now() + (seconds * 1000);
    function tick() {
      var left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (onTick) onTick(left);
      if (left <= 0) {
        clearTimers();
        if (onDone) onDone();
      }
    }
    tick();
    setIntervalTracked(tick, 250);
  }

  // Look up a generated change by the stable ID carried by its corresponding button.
  function findChange(detailId) {
    for (var i = 0; i < state.activeChanges.length; i++) {
      if (state.activeChanges[i].id === detailId) return state.activeChanges[i];
    }
    return null;
  }

  // Toggle a task detail in/out of the player's answer while the find phase is active.
  function handleDetailClick(detailId) {
    if (!state.active || state.phase !== 'finding') return;
    if (state.selectedIds[detailId]) delete state.selectedIds[detailId];
    else state.selectedIds[detailId] = Date.now();
    renderGame();
  }

  // Award correct-answer points and record the result for this detail.
  function scoreCorrect(change, orderIndex, selectedAt) {
    var base = change.kind === 'time' ? SCORE.timeDetail : SCORE.detail;
    var selectedTime = Number(selectedAt) || Date.now();
    var speed = ((selectedTime - state.findStartedAt) / 1000) <= 3 ? SCORE.speed : 0;
    var streakBonus = orderIndex > 0 ? SCORE.streak * orderIndex : 0;
    var points = base + speed + streakBonus;
    state.score = Math.max(0, state.score + points);
    state.roundScore += points;
    state.roundFound += 1;
    state.totalFound += 1;
    state.foundChangeIds[change.id] = { points: points };
    change.found = true;
  }

  // Apply a wrong-answer penalty and mark the clicked field for result feedback.
  function scoreWrongGuess(detailId) {
    state.wrongClicks += 1;
    state.roundWrong += 1;
    state.incorrectIds[detailId] = true;
    state.score = Math.max(0, state.score + SCORE.wrong);
    state.roundScore += SCORE.wrong;
  }

  // Freeze input, score all selected answers, penalize missed changes, and show results.
  function endRound(reason) {
    if (!state.active || state.phase !== 'finding') return;
    clearTimers();
    state.phase = 'round-results';
    var missed = 0;
    var correctOrder = 0;
    Object.keys(state.selectedIds).forEach(function (detailId) {
      var change = findChange(detailId);
      if (change) {
        scoreCorrect(change, correctOrder, state.selectedIds[detailId]);
        correctOrder += 1;
      } else {
        scoreWrongGuess(detailId);
      }
    });
    state.activeChanges.forEach(function (change) {
      if (!state.foundChangeIds[change.id]) {
        state.missedChangeIds[change.id] = true;
        missed += 1;
      }
    });
    state.roundMissed = missed;
    state.roundLivesLost = state.roundWrong + missed;
    state.levelLives = Math.max(0, state.levelLives - state.roundLivesLost);
    if (missed > 0) {
      state.score = Math.max(0, state.score + (missed * SCORE.missed));
      state.roundScore += missed * SCORE.missed;
    }
    if ((reason === 'ready' || reason === 'timeout') && missed === 0 && state.roundWrong === 0) {
      state.score += SCORE.perfect;
      state.roundScore += SCORE.perfect;
    }
    renderGame();
  }

  // Advance after results, ending early on zero lives or after the final level.
  function nextRoundOrComplete() {
    if (state.phase !== 'round-results') return;
    if (state.levelLives <= 0) completeGame();
    else if (state.roundIndex + 1 < currentLevel().games) startRound(state.roundIndex + 1);
    else if (state.levelIndex + 1 < LEVELS.length) startLevel(state.levelIndex + 1);
    else completeGame();
  }

  // Freeze the session, calculate its rating, and hand the final score to arcade services.
  function completeGame() {
    clearTimers();
    state.phase = 'complete';
    state.completed = true;
    state.finalRating = getRating();
    state.lastScorePayload = { gameId: GAME_ID, score: Math.max(0, Math.floor(state.score)) };
    renderGame();
    submitFinalScore();
    loadLeaderboard();
  }

  // Choose the player-facing result message from survival, accuracy, and mistakes.
  function getRating() {
    // Accuracy is based only on required changes; wrong extra taps are handled separately.
    var accuracy = state.totalChanges ? state.totalFound / state.totalChanges : 0;
    if (state.levelLives <= 0 && state.levelIndex + 1 < LEVELS.length) {
      return { title: 'Out of Lives', text: 'You reached level ' + (state.levelIndex + 1) + ' before the details got away.' };
    }
    if (state.totalFound === state.totalChanges && state.wrongClicks === 0) {
      return { title: 'Perfect Focus', text: 'Nothing slipped past you.' };
    }
    if (accuracy >= 0.85) return { title: 'Detail Oriented', text: 'You caught the changes that matter.' };
    if (accuracy >= 0.65) return { title: 'Sharp Eye', text: 'Good instincts. A few details moved fast.' };
    return { title: 'Second Glance Needed', text: 'The clock hid a few clues.' };
  }

  // Mark one unselected, unhinted change and briefly highlight it in the interface.
  function revealHint() {
    var hidden = state.activeChanges.filter(function (change) {
      return !state.selectedIds[change.id] && !state.hintedIds[change.id];
    });
    if (!hidden.length) return null;
    var change = hidden[0];
    state.hintedIds[change.id] = true;
    state.hintFlashIds[change.id] = true;
    renderGame();
    setTimeoutTracked(function () {
      delete state.hintFlashIds[change.id];
      if (state.phase === 'finding') renderGame();
    }, 1000);
    return change;
  }

  // Spend an arcade token through the host API and reveal one still-hidden change.
  async function spendToken() {
    if (!state.active || state.phase !== 'finding') return '';
    if (typeof api !== 'function') throw new Error('TaskIt API is unavailable');
    var hidden = state.activeChanges.filter(function (change) {
      return !state.selectedIds[change.id] && !state.hintedIds[change.id];
    });
    if (!hidden.length) return 'No hidden changes left to hint.';
    var data = await api('POST', '/gamification/arcade/spend-token');
    if (data && typeof data.arcadeTokens === 'number') {
      arcadeTokens = data.arcadeTokens;
      updateArcadeTokenDisplays();
    }
    var hinted = revealHint();
    return hinted ? 'Hint used.' : 'Hint used.';
  }

  // Submit the completed positive score once, when the host exposes its score service.
  function submitFinalScore() {
    if (state.scoreSubmitted || !state.lastScorePayload || state.lastScorePayload.score <= 0) return;
    state.scoreSubmitted = true;
    if (window.TaskItArcade && typeof window.TaskItArcade.submitScore === 'function') {
      window.TaskItArcade.submitScore(state.lastScorePayload).then(function () {
        loadLeaderboard();
      }).catch(function () {});
    }
  }

  // Fetch this game's leaderboard and render an appropriate loading/empty/error state.
  function loadLeaderboard() {
    state.leaderboardStatus = 'Loading scores...';
    if (!window.TaskItArcade || typeof window.TaskItArcade.getHighScores !== 'function') {
      state.leaderboardRows = [];
      state.leaderboardStatus = 'Scores unavailable.';
      renderGame();
      return;
    }
    window.TaskItArcade.getHighScores(GAME_ID).then(function (rows) {
      state.leaderboardRows = Array.isArray(rows) ? rows.slice(0, 8) : [];
      state.leaderboardStatus = state.leaderboardRows.length ? '' : 'No scores yet.';
      if (state.phase === 'idle' || state.phase === 'complete' || state.phase === 'round-results') renderGame();
    }).catch(function () {
      state.leaderboardRows = [];
      state.leaderboardStatus = 'Could not load scores.';
      if (state.phase === 'idle' || state.phase === 'complete' || state.phase === 'round-results') renderGame();
    });
  }

  // Return the host-provided public nickname, or an empty string when unavailable.
  function arcadeNickname() {
    return typeof arcadePseudonym === 'string' ? arcadePseudonym : '';
  }

  // Allow the host/game UI to end an active session through the normal completion path.
  function endGame() {
    if (!state.active || state.phase === 'idle' || state.phase === 'complete') return;
    completeGame();
  }

  // Temporarily relabel the host's generic token button to explain its in-game use.
  function updateTokenButton() {
    var button = document.getElementById('arcadeSpendTokenBtn');
    if (!button) return;
    if (!state.originalSpendButtonText) state.originalSpendButtonText = button.textContent;
    button.textContent = 'Hint (1 token)';
    button.title = 'Reveal one changed detail in Second Look.';
  }

  // Put the host's token button back exactly as it was before this game mounted.
  function restoreTokenButton() {
    var button = document.getElementById('arcadeSpendTokenBtn');
    if (!button || !state.originalSpendButtonText) return;
    button.textContent = state.originalSpendButtonText;
    button.title = '';
    state.originalSpendButtonText = '';
  }

  function injectStyles() {
    if (document.getElementById('second-look-styles')) return;
    var style = document.createElement('style');
    style.id = 'second-look-styles';
    style.textContent =
      '.second-look-game{--sl-ink:#111827;--sl-muted:#64748b;--sl-line:#dbe3ef;--sl-card:#fff;--sl-good:#047857;--sl-good-bg:#d1fae5;--sl-bad:#b91c1c;--sl-bad-bg:#fee2e2;--sl-miss:#b45309;--sl-miss-bg:#fef3c7;--sl-hint:#1d4ed8;--sl-hint-bg:#dbeafe;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;padding:12px;color:var(--sl-ink);background:linear-gradient(180deg,#f8fafc 0%,#eef6ff 100%);font-family:inherit;box-sizing:border-box;overflow:hidden}' +
      '.second-look-game *{box-sizing:border-box}.sl-start,.sl-complete{margin:auto;max-width:560px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px}.sl-title{font-size:clamp(1.6rem,4vw,2.25rem);line-height:1;margin:0;font-weight:900;color:#0f172a}.sl-sub{margin:0;color:#475569;font-size:.98rem;line-height:1.45}.sl-primary{border:0;border-radius:8px;padding:10px 14px;font-weight:800;cursor:pointer;min-height:42px;background:#2563eb;color:#fff}.sl-secondary{border:1px solid #cbd5e1;border-radius:8px;padding:9px 12px;font-weight:800;cursor:pointer;min-height:38px;background:#fff;color:#334155}.sl-ready{align-self:center;min-width:136px}.sl-primary:focus-visible,.sl-secondary:focus-visible,.sl-detail:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}' +
      '.sl-hud{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px 10px;margin-bottom:8px;background:#fff;border:1px solid var(--sl-line);border-radius:8px;box-shadow:0 4px 14px rgba(15,23,42,.06)}.sl-status{min-width:0}.sl-status strong{display:block;font-size:.95rem}.sl-status span{display:block;color:var(--sl-muted);font-size:.78rem;margin-top:2px}.sl-stats{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.sl-pill{border:1px solid #dbeafe;background:#eff6ff;color:#1e3a8a;border-radius:999px;padding:5px 8px;font-size:.78rem;font-weight:800;white-space:nowrap}.sl-pill--hot{background:#fff7ed;border-color:#fed7aa;color:#9a3412}' +
      '.sl-board-wrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:10px;overflow:auto;border:1px solid var(--sl-line);background:rgba(255,255,255,.76);border-radius:8px;padding:10px}.sl-board{width:min(100%,760px);display:flex;flex-direction:column;gap:8px}.sl-instruction{font-size:.88rem;font-weight:850;color:#334155;text-align:center}.sl-note{background:#fff8c9;border:1px solid #fde68a;border-radius:8px;padding:12px;box-shadow:0 14px 24px rgba(120,80,20,.16),inset 0 -18px 28px rgba(253,230,138,.22);transform:rotate(-.35deg)}.sl-planner-head{display:flex;align-items:center;justify-content:center;gap:10px;padding:4px 6px 10px;color:#854d0e}.sl-planner-head strong{font-size:.92rem;letter-spacing:.03em;text-transform:uppercase}.sl-phase-note{font-size:.84rem;color:#475569;text-align:center}.sl-task{display:grid;gap:7px;align-items:stretch;padding:0;background:transparent}.sl-cols-3{grid-template-columns:64px minmax(150px,1.3fr) minmax(78px,1fr)}.sl-cols-4{grid-template-columns:64px minmax(150px,1.3fr) repeat(2,minmax(78px,1fr))}.sl-cols-5{grid-template-columns:64px minmax(150px,1.3fr) repeat(3,minmax(78px,1fr))}.sl-cols-6{grid-template-columns:64px minmax(150px,1.3fr) repeat(4,minmax(78px,1fr))}' +
      '.sl-detail{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;border:1px solid rgba(180,83,9,.18);background:rgba(255,255,255,.62);color:#111827;border-radius:7px;min-height:48px;min-width:54px;padding:8px 8px;font:inherit;font-size:.82rem;text-align:center;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.65);transition:transform .12s ease,border-color .12s ease,background .12s ease}.sl-detail:hover{border-color:#f59e0b;background:#fff7ed;transform:translateY(-1px)}.sl-detail[disabled]{cursor:default}.sl-detail[disabled]:hover{transform:none}.sl-check{text-align:center;font-weight:900}.sl-title-field{font-weight:850}.sl-clock{font-variant-numeric:tabular-nums}.sl-priority-High{background:#ffe4e6;color:#9f1239}.sl-priority-Med{background:#ffedd5;color:#9a3412}.sl-priority-Low{background:#dcfce7;color:#047857}.sl-tag-blue{background:#dbeafe;color:#1d4ed8}.sl-tag-green{background:#dcfce7;color:#166534}.sl-tag-amber{background:#fef3c7;color:#92400e}.sl-tag-violet{background:#ede9fe;color:#5b21b6}.sl-tag-rose{background:#ffe4e6;color:#be123c}.sl-selected{border-color:#334155!important;background:#e2e8f0!important;color:#0f172a!important}.sl-found{border-color:var(--sl-good)!important;background:var(--sl-good-bg)!important;color:#064e3b!important}.sl-missed{border-color:var(--sl-miss)!important;background:var(--sl-miss-bg)!important;color:#78350f!important}.sl-hinted{border-color:var(--sl-hint)!important;background:var(--sl-hint-bg)!important;color:#1e3a8a!important}.sl-hint-flash{border-color:#f59e0b!important;background:#fef08a!important;color:#713f12!important;animation:sl-hint-pulse 1s ease 1}.sl-wrong{border-color:var(--sl-bad)!important;background:var(--sl-bad-bg)!important;color:#7f1d1d!important;animation:sl-shake .18s linear 1}.sl-badge{display:block;margin-top:3px;font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.sl-float{position:absolute;right:4px;top:-9px;font-size:.68rem;font-weight:900;background:#111827;color:#fff;border-radius:999px;padding:1px 5px;pointer-events:none}' +
      '.sl-transition{position:absolute;inset:12px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(15,23,42,.88);color:#fff;font-size:1.5rem;font-weight:900;z-index:5}.sl-results{position:static;width:min(100%,760px);background:#fff;border:1px solid var(--sl-line);border-radius:8px;box-shadow:0 10px 24px rgba(15,23,42,.14);padding:12px;display:grid;grid-template-columns:1fr;gap:10px;z-index:6}.sl-results-head{display:block}.sl-results h3{margin:0;font-size:1rem}.sl-results p{margin:3px 0 0;color:#475569;font-size:.85rem}.sl-result-actions{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap}.sl-result-actions .sl-primary{margin-left:auto}.sl-perfect{color:#047857;font-weight:900}.sl-complete-stats{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.sl-scoreboard{width:100%;margin-top:4px;border:1px solid var(--sl-line);border-radius:8px;background:#fff;padding:10px;text-align:left}.sl-scoreboard h3{margin:0 0 4px;font-size:.95rem;color:#0f172a}.sl-score-note{margin:0 0 8px!important;color:#64748b!important;font-size:.78rem!important}.sl-score-row{display:grid;grid-template-columns:32px 1fr auto;gap:8px;align-items:center;padding:5px 0;border-top:1px solid #eef2f7;font-size:.84rem}.sl-score-row:first-of-type{border-top:0}.sl-score-rank{font-weight:900;color:#64748b}.sl-score-name{font-weight:800;color:#0f172a;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sl-score-points{font-variant-numeric:tabular-nums;color:#1e3a8a;font-weight:900}.sl-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}' +
      '@keyframes sl-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}@keyframes sl-hint-pulse{0%,100%{transform:scale(1)}35%{transform:scale(1.04)}}@media (prefers-reduced-motion:reduce){.sl-detail{transition:none}.sl-wrong,.sl-hint-flash{animation:none}}' +
      '@media (max-width:720px){.second-look-game{padding:8px}.sl-hud{grid-template-columns:1fr}.sl-stats{justify-content:flex-start}.sl-task{grid-template-columns:64px minmax(150px,1fr);}.sl-board-wrap{padding:8px}}' +
      '@media (max-width:430px){.sl-task{grid-template-columns:1fr}.sl-planner-head{align-items:flex-start;flex-direction:column}.sl-detail{min-height:42px}}';
    document.head.appendChild(style);
  }

  function renderGame() {
    if (!state.frame) return;
    injectStyles();
    updateTokenButton();
    state.frame.replaceChildren();
    var root = document.createElement('div');
    root.className = 'second-look-game';
    root.addEventListener('click', function (event) {
      var target = event.target.closest && event.target.closest('.sl-detail');
      if (!target || !root.contains(target)) return;
      event.preventDefault();
      handleDetailClick(target.dataset.detailId);
    });
    if (state.phase === 'idle') root.appendChild(buildStart());
    else if (state.phase === 'complete') root.appendChild(buildComplete());
    else {
      root.appendChild(buildHud());
      root.appendChild(buildBoardArea());
    }
    var live = document.createElement('div');
    live.className = 'sl-live';
    live.setAttribute('aria-live', 'polite');
    live.textContent = liveText();
    root.appendChild(live);
    state.frame.appendChild(root);
  }

  function renderHudOnly() {
    var existing = state.frame && state.frame.querySelector('.sl-hud');
    if (!existing) renderGame();
    else existing.replaceWith(buildHud());
  }

  function buildStart() {
    var start = document.createElement('div');
    start.className = 'sl-start';
    var title = document.createElement('h2');
    title.className = 'sl-title';
    title.textContent = 'Second Look';
    var sub = document.createElement('p');
    sub.className = 'sl-sub';
    sub.textContent = 'Study one task. Time will pass. Tap every detail that changed.';
    var button = document.createElement('button');
    button.className = 'sl-primary';
    button.type = 'button';
    button.textContent = 'Start';
    button.addEventListener('click', startGame);
    start.appendChild(title);
    start.appendChild(sub);
    start.appendChild(buildScoreboard());
    start.appendChild(button);
    return start;
  }

  function buildHud() {
    var level = currentLevel();
    var hud = document.createElement('div');
    hud.className = 'sl-hud';
    var status = document.createElement('div');
    status.className = 'sl-status';
    var title = document.createElement('strong');
    title.textContent = phaseTitle();
    var sub = document.createElement('span');
    sub.textContent = 'Level ' + (state.levelIndex + 1) + ' - ' + level.name +
      ' | Game ' + (state.roundIndex + 1) + ' of ' + level.games +
      ' | ' + hudProgressText();
    status.appendChild(title);
    status.appendChild(sub);
    var stats = document.createElement('div');
    stats.className = 'sl-stats';
    stats.appendChild(pill('Score ' + state.score));
    stats.appendChild(pill('Lives ' + state.levelLives, state.levelLives <= 1));
    stats.appendChild(pill(state.countdownLabel || '--', state.phase === 'finding'));
    stats.appendChild(pill('Game ' + overallGameNumber() + '/' + totalGames()));
    hud.appendChild(status);
    hud.appendChild(stats);
    return hud;
  }

  function pill(text, hot) {
    var el = document.createElement('span');
    el.className = 'sl-pill' + (hot ? ' sl-pill--hot' : '');
    el.textContent = text;
    return el;
  }

  function phaseTitle() {
    if (state.phase === 'preview') return 'Study the details';
    if (state.phase === 'transition') return 'Time passes...';
    if (state.phase === 'finding') return 'What changed?';
    if (state.phase === 'round-results') return 'Round results';
    return 'Second Look';
  }

  function hudProgressText() {
    if (state.phase === 'finding') {
      return Object.keys(state.selectedIds).length + ' selected';
    }
    return state.roundFound + '/' + state.activeChanges.length + ' found';
  }

  function buildBoardArea() {
    var wrap = document.createElement('div');
    wrap.className = 'sl-board-wrap';
    var task = (state.phase === 'preview' || state.phase === 'transition') ? state.currentOriginal : state.currentChanged;
    wrap.appendChild(buildScene(task));
    if (state.phase === 'transition') {
      var overlay = document.createElement('div');
      overlay.className = 'sl-transition';
      overlay.textContent = 'Time passes...';
      wrap.appendChild(overlay);
    }
    if (state.phase === 'round-results') wrap.appendChild(buildRoundResults());
    return wrap;
  }

  function buildScene(task) {
    var level = currentLevel();
    var board = document.createElement('div');
    board.className = 'sl-board';
    var instruction = document.createElement('div');
    instruction.className = 'sl-instruction';
    instruction.textContent = state.phase === 'finding' ? 'Tap changed details' : 'Memorise the task details';
    board.appendChild(instruction);
    var noteWrap = document.createElement('div');
    noteWrap.className = 'sl-note';
    var head = document.createElement('div');
    head.className = 'sl-planner-head';
    var title = document.createElement('strong');
    title.textContent = 'Task details';
    head.appendChild(title);
    noteWrap.appendChild(head);
    noteWrap.appendChild(buildTask(task));
    board.appendChild(noteWrap);
    if (state.phase === 'finding') board.appendChild(buildReadyButton());
    return board;
  }

  function buildReadyButton() {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sl-primary sl-ready';
    button.textContent = 'Ready!';
    button.setAttribute('aria-label', 'Submit your selected changes');
    button.addEventListener('click', function () {
      endRound('ready');
    });
    return button;
  }

  function buildTask(task) {
    var level = currentLevel();
    var row = document.createElement('div');
    row.className = 'sl-task sl-cols-' + level.columns.length;
    level.columns.forEach(function (column) {
      row.appendChild(buildColumnButton(column, task));
    });
    return row;
  }

  function buildColumnButton(column, task) {
    if (column === 'status') {
      return detailButton('task-1-status', task.done ? 'Done' : 'Open', 'Task status ' + (task.done ? 'done' : 'open'), 'sl-check');
    }
    if (column === 'title') {
      return detailButton('task-1-title', task.title, 'Task title ' + task.title, 'sl-title-field');
    }
    if (column === 'due') {
      return detailButton('task-1-due', task.due, 'Due time ' + task.due, 'sl-clock');
    }
    if (column === 'priority') {
      return detailButton('task-1-priority', task.priority, 'Priority ' + task.priority, 'sl-priority-' + task.priority);
    }
    if (column === 'tag') {
      return detailButton('task-1-tag', task.tag, 'Tag ' + task.tag, 'sl-tag-' + task.tagColor);
    }
    return detailButton('task-1-end', task.end, 'End time ' + task.end, 'sl-clock');
  }

  function detailButton(id, text, label, extraClass) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sl-detail ' + (extraClass || '') + detailStateClass(id);
    button.dataset.detailId = id;
    button.disabled = state.phase !== 'finding';
    button.setAttribute('aria-label', label);
    button.textContent = text;
    var found = state.foundChangeIds[id];
    if (found) appendBadge(button, 'Found', '+' + found.points);
    else if (state.missedChangeIds[id]) appendBadge(button, 'Missed');
    else if (state.incorrectIds[id]) appendBadge(button, '-50');
    else if (state.selectedIds[id]) appendBadge(button, 'Selected');
    return button;
  }

  function appendBadge(button, label, floating) {
    var badge = document.createElement('span');
    badge.className = 'sl-badge';
    badge.textContent = label;
    button.appendChild(badge);
    if (floating) {
      var points = document.createElement('span');
      points.className = 'sl-float';
      points.textContent = floating;
      button.appendChild(points);
    }
  }

  function detailStateClass(id) {
    if (state.foundChangeIds[id]) return ' sl-found';
    if (state.missedChangeIds[id]) return ' sl-missed';
    if (state.incorrectIds[id]) return ' sl-wrong';
    if (state.hintFlashIds[id]) return ' sl-hint-flash';
    if (state.selectedIds[id]) return ' sl-selected';
    return '';
  }

  function buildRoundResults() {
    var missed = Object.keys(state.missedChangeIds).length;
    var perfect = missed === 0 && state.roundWrong === 0;
    var levelComplete = state.levelLives > 0 && state.roundIndex + 1 >= currentLevel().games;
    var outOfLives = state.levelLives <= 0;
    var panel = document.createElement('div');
    panel.className = 'sl-results';
    var text = document.createElement('div');
    var head = document.createElement('div');
    head.className = 'sl-results-head';
    var title = document.createElement('h3');
    title.textContent = perfect ? 'Perfect game' : 'Game ' + (state.roundIndex + 1) + ' complete';
    var body = document.createElement('p');
    body.textContent = 'Found: ' + state.roundFound + ' / ' + state.activeChanges.length +
      '   Missed: ' + missed +
      '   Wrong taps: ' + state.roundWrong +
      '   Lives lost: ' + state.roundLivesLost +
      '   Lives left: ' + state.levelLives +
      '   Score: ' + state.roundScore;
    text.appendChild(title);
    text.appendChild(body);
    if (perfect) {
      var bonus = document.createElement('p');
      bonus.className = 'sl-perfect';
      bonus.textContent = '+300 perfect bonus';
      text.appendChild(bonus);
    }
    var end = document.createElement('button');
    end.type = 'button';
    end.className = 'sl-secondary';
    end.textContent = 'End Game';
    end.addEventListener('click', endGame);
    head.appendChild(text);
    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'sl-primary';
    if (outOfLives || (levelComplete && state.levelIndex + 1 >= LEVELS.length)) next.textContent = 'Finish';
    else if (levelComplete) next.textContent = 'Next level';
    else next.textContent = 'Next game';
    next.addEventListener('click', nextRoundOrComplete);
    var actions = document.createElement('div');
    actions.className = 'sl-result-actions';
    actions.appendChild(end);
    actions.appendChild(next);
    panel.appendChild(head);
    panel.appendChild(actions);
    return panel;
  }

  function buildScoreboard() {
    var board = document.createElement('div');
    board.className = 'sl-scoreboard';
    var title = document.createElement('h3');
    title.textContent = 'Global scoreboard';
    board.appendChild(title);
    if (arcadeNickname()) {
      var nickname = document.createElement('p');
      nickname.className = 'sl-score-note';
      nickname.textContent = 'Posting as ' + arcadeNickname();
      board.appendChild(nickname);
    }
    if (!state.leaderboardRows.length) {
      var empty = document.createElement('p');
      empty.className = 'sl-sub';
      empty.textContent = state.leaderboardStatus || 'No scores yet.';
      board.appendChild(empty);
      return board;
    }
    state.leaderboardRows.forEach(function (row, index) {
      var line = document.createElement('div');
      line.className = 'sl-score-row';
      var rank = document.createElement('span');
      rank.className = 'sl-score-rank';
      rank.textContent = '#' + (row.rank || (index + 1));
      var name = document.createElement('span');
      name.className = 'sl-score-name';
      name.textContent = row.pseudonym || 'Player';
      if (row.isMine) name.textContent += ' (you)';
      var score = document.createElement('span');
      score.className = 'sl-score-points';
      score.textContent = String(row.score || 0);
      line.appendChild(rank);
      line.appendChild(name);
      line.appendChild(score);
      board.appendChild(line);
    });
    return board;
  }

  function buildComplete() {
    var rating = state.finalRating || getRating();
    var complete = document.createElement('div');
    complete.className = 'sl-complete';
    var title = document.createElement('h2');
    title.className = 'sl-title';
    title.textContent = rating.title;
    var text = document.createElement('p');
    text.className = 'sl-sub';
    text.textContent = rating.text;
    var stats = document.createElement('div');
    stats.className = 'sl-complete-stats';
    stats.appendChild(pill('Score ' + state.score));
    stats.appendChild(pill('Level ' + (state.levelIndex + 1) + '/' + LEVELS.length));
    stats.appendChild(pill('Found ' + state.totalFound + '/' + state.totalChanges));
    stats.appendChild(pill('Wrong ' + state.wrongClicks));
    var replay = document.createElement('button');
    replay.className = 'sl-primary';
    replay.type = 'button';
    replay.textContent = 'Play again';
    replay.addEventListener('click', startGame);
    complete.appendChild(title);
    complete.appendChild(text);
    complete.appendChild(stats);
    complete.appendChild(buildScoreboard());
    complete.appendChild(replay);
    return complete;
  }

  function liveText() {
    if (state.phase === 'preview') return 'Study the task. ' + state.countdownLabel + ' remaining.';
    if (state.phase === 'finding') return 'Find changes. ' + state.countdownLabel + ' remaining.';
    if (state.phase === 'round-results') return 'Round complete. ' + state.roundFound + ' changes found.';
    if (state.phase === 'complete') return 'Game complete. Score ' + state.score + '.';
    return '';
  }

  function mount(frame) {
    state.frame = frame || document.getElementById('arcadeGameFrame');
    state.active = true;
    resetSession();
    state.active = true;
    updateTokenButton();
    loadLeaderboard();
    renderGame();
    return this;
  }

  function unmount() {
    clearTimers();
    restoreTokenButton();
    if (state.frame) state.frame.replaceChildren();
    state.active = false;
    state.frame = null;
  }

  window.TaskItArcade.register({
    gameId: GAME_ID,
    mount: mount,
    unmount: unmount,
    spendToken: spendToken,
    getHighScore: function () {
      if (state.scoreSubmitted) return null;
      if (!state.lastScorePayload && state.score > 0 && state.completed) {
        state.lastScorePayload = { gameId: GAME_ID, score: Math.max(0, Math.floor(state.score)) };
      }
      return state.lastScorePayload;
    },
  });
}());
    // Only fields visible at this level can change, so every change is findable.
    // Mark each selected candidate unfound; the same records drive rendering and scoring.
        // A tag's color is part of its presentation and must follow the new tag name.
    // Clear callbacks from the previous round before resetting state or scheduling work.
    // Generate one baseline, the changes to discover, and the derived changed task.
    // The preview countdown updates the whole screen; expiry advances to the overlay.
    // Date.now-based deadline prevents interval drift from extending the time limit.
    // Tick immediately so the UI does not wait 250ms to show its first value.
    // Keep the time of selection so speed bonuses reflect when the answer was chosen.
    // Speed is measured from the start of the find phase; subsequent correct picks
    // in selection order receive increasing streak bonuses.
    // Revisit selections in their recorded insertion order for streak scoring.
    // Any required change that wasn't found costs one life, just like a wrong tap.
    // A flawless voluntary finish or timeout earns a bonus; missed/wrong answers do not.
    // Store an integer, non-negative score in the payload expected by the host API.
    // Flash state is temporary visual feedback; the hint remains recorded afterward.
    // Check that a useful hint exists before charging the player's token balance.
    // The host owns token accounting; update the shared UI balance from its response.
    // Mark submission before the async call to prevent duplicate submissions.
    // Ignore late results while actively playing; rendering then could disrupt the board.
