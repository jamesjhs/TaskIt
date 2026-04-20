/**
 * TaskIt! Arcade — Stage 2 Mini-Game: Job Search (Word Search)
 * ============================================================
 * GameId : 'wordsearch'
 * Badge  : task_10 (🚀 Getting Started)
 *
 * Self-contained IIFE — no globals are exported.
 *
 * Boots when the arcade overlay dispatches 'arcade:open' with
 * gameId === 'wordsearch', and tears itself down cleanly on 'arcade:close'.
 *
 * Theme: General knowledge — 6 words are drawn at random from a 100-word
 *        pool spanning nature, animals, food, sports, science, arts, places,
 *        and TaskIt! app concepts. Every new game shows a different set.
 *
 * The grid is 12 × 12 (supports words up to 12 letters).
 * Words are placed in any of 8 compass directions (right, left, down,
 * up, and all four 45° diagonals) using a randomised backtracking
 * algorithm.  Empty cells are padded with random letters.
 *
 * Interaction:
 *   • Click-and-drag (pointer events — works with mouse AND touch).
 *   • touchstart / touchmove / touchend as a belt-and-braces fallback.
 *   • A selection is valid when the endpoints form a horizontal,
 *     vertical, or 45° diagonal straight line.
 *   • Words can be found in either direction along the selection axis
 *     (both the spelled word and its reverse are checked).
 *
 * Layout (CSS classes defined in app.css):
 *   .ws-root             — flex row: grid wrapper + word-list panel
 *   .ws-grid-wrap        — flex:1 centred wrapper around the grid
 *   .ws-grid             — 12-column CSS grid of letter cells
 *   .ws-cell             — individual letter cell
 *   .ws-cell--sel        — cell highlighted during an active drag
 *   .ws-cell--found      — cell permanently highlighted as part of a found word
 *   .ws-panel            — right-hand word-list panel
 *   .ws-panel-title      — "FIND:" heading
 *   .ws-word-item        — one target word in the list
 *   .ws-word-item--found — struck-through found word
 *   .ws-win-msg          — victory message
 *   .ws-replay           — "New Game" button
 */
(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────────────────

  /**
   * 100-word pool across a variety of topics (all upper-case, max 12 letters).
   * Six words are drawn at random at the start of every new game.
   */
  const WORD_POOL = [
    // TaskIt! app concepts
    'CHORES', 'COLLABORATE', 'RECUR', 'ALERTS', 'PROGRESS', 'GROUP',
    'TASKS', 'SCHEDULE', 'WORKFLOW', 'COMPLETE', 'PRIORITY', 'DEADLINE',
    // nature
    'AVALANCHE', 'CANOPY', 'GLACIER', 'HURRICANE', 'LIGHTNING',
    'RAINBOW', 'VOLCANO', 'WATERFALL', 'CANYON', 'FOREST',
    'MEADOW', 'DESERT', 'LAGOON', 'GEYSER',
    // animals
    'BUTTERFLY', 'CROCODILE', 'ELEPHANT', 'FLAMINGO', 'KANGAROO',
    'PORCUPINE', 'RACCOON', 'CHEETAH', 'DOLPHIN', 'PENGUIN',
    'JAGUAR', 'PANTHER', 'LEOPARD', 'GORILLA', 'CHAMELEON', 'PEACOCK',
    // food
    'CHOCOLATE', 'CINNAMON', 'MUSHROOM', 'AVOCADO', 'BLUEBERRY',
    'PINEAPPLE', 'CHEDDAR', 'RASPBERRY', 'BROCCOLI', 'ASPARAGUS',
    'WALNUT', 'PAPAYA', 'SAFFRON', 'MANGO',
    // sports
    'MARATHON', 'BADMINTON', 'BASKETBALL', 'VOLLEYBALL', 'SWIMMING',
    'CYCLING', 'ARCHERY', 'WRESTLING', 'FENCING', 'GYMNASTICS',
    // science & technology
    'ALGORITHM', 'CHEMISTRY', 'TELESCOPE', 'SATELLITE', 'MOLECULE',
    'EVOLUTION', 'INVENTION', 'GRAVITY', 'RADIATION', 'SPECTRUM',
    // arts & culture
    'SYMPHONY', 'ORCHESTRA', 'FESTIVAL', 'CARNIVAL', 'SCULPTURE',
    'MYTHOLOGY', 'FOLKLORE', 'DRAMA', 'BALLET', 'COMEDY',
    // places & geography
    'MOUNTAIN', 'CATHEDRAL', 'PENINSULA', 'STADIUM', 'LABYRINTH',
    'ISLAND', 'HARBOR', 'VALLEY', 'CONTINENT', 'GEOGRAPHY',
    'OBSERVATORY', 'JUNGLE', 'PLATEAU', 'TUNDRA',
  ];

  /** Number of words to pick from WORD_POOL each round. */
  const WORDS_PER_ROUND = 6;

  /**
   * Grid dimension — both rows and columns.
   * 12 × 12 comfortably accommodates COLLABORATE (11 letters).
   */
  const GRID_SIZE = 12;

  /**
   * Eight compass directions as [rowDelta, colDelta] pairs.
   * A word placed in direction [dr, dc] starting at (r0, c0) occupies
   * cells (r0 + i*dr, c0 + i*dc) for i = 0 … word.length-1.
   */
  const DIRECTIONS = [
    [ 0,  1], [ 0, -1],   // horizontal right / left
    [ 1,  0], [-1,  0],   // vertical   down  / up
    [ 1,  1], [ 1, -1],   // diagonal   ↘     / ↙
    [-1,  1], [-1, -1],   // diagonal   ↗     / ↖
  ];

  /** Alphabet for padding empty grid cells. */
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // ── Game state ─────────────────────────────────────────────────────────────

  /** 12 × 12 array of upper-case letter strings, built by buildGrid(). */
  let _grid        = [];

  /** Words chosen from WORD_POOL for the current round. */
  let _targetWords = [];

  /** Set of _targetWords that have been found this round. */
  let _found    = new Set();

  /** Start cell of the active drag selection: { r, c } or null. */
  let _selStart = null;

  /** End cell of the active drag selection: { r, c } or null. */
  let _selEnd   = null;

  /** True while the user is actively dragging (pointer/touch down). */
  let _dragging = false;

  /** Guards the arcade:close handler — true while this game is mounted. */
  let _active   = false;

  // ── Grid generation ────────────────────────────────────────────────────────

  /**
   * Build a fresh GRID_SIZE × GRID_SIZE grid with all _targetWords hidden.
   *
   * Algorithm
   * ---------
   * 1. Allocate a null-filled 2-D array.
   * 2. Sort words longest-first so the hardest-to-place words get priority.
   * 3. For each word attempt up to 200 random (direction, start-position)
   *    placements.  A position is valid when every cell along the path is
   *    either empty or already holds the same letter (allows crossings).
   * 4. Fill all remaining null cells with random letters.
   *
   * In practice, placement always succeeds for 6 words in a 12 × 12 grid.
   * A word that somehow fails all 200 attempts is simply omitted (the player
   * can still win by finding the others).
   *
   * @returns {string[][]}  2-D array of single upper-case characters.
   */
  function buildGrid() {
    // Step 1 — empty grid
    var g = [];
    for (var i = 0; i < GRID_SIZE; i++) {
      g.push(new Array(GRID_SIZE).fill(null));
    }

    // Step 2 — longest words first
    var sorted = _targetWords.slice().sort(function (a, b) { return b.length - a.length; });

    for (var wi = 0; wi < sorted.length; wi++) {
      var word   = sorted[wi];
      var placed = false;

      for (var attempt = 0; attempt < 200 && !placed; attempt++) {
        // Pick a random direction
        var dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        var dr  = dir[0];
        var dc  = dir[1];

        // Compute the valid range of starting positions for this direction
        // and word length so we never run off the grid edge.
        //   e.g. dr=1, word="COLLABORATE" (11): rMax = 12-11 = 1
        var rMin = dr < 0 ? word.length - 1 : 0;
        var rMax = dr > 0 ? GRID_SIZE - word.length : GRID_SIZE - 1;
        var cMin = dc < 0 ? word.length - 1 : 0;
        var cMax = dc > 0 ? GRID_SIZE - word.length : GRID_SIZE - 1;

        // Skip impossible direction / size combos
        if (rMin > rMax || cMin > cMax) continue;

        var r0 = rMin + Math.floor(Math.random() * (rMax - rMin + 1));
        var c0 = cMin + Math.floor(Math.random() * (cMax - cMin + 1));

        // Step 3a — validate: no conflicting letters along the path
        var ok = true;
        for (var k = 0; k < word.length; k++) {
          var cell = g[r0 + k * dr][c0 + k * dc];
          if (cell !== null && cell !== word[k]) { ok = false; break; }
        }

        if (ok) {
          // Step 3b — commit the placement
          for (var k2 = 0; k2 < word.length; k2++) {
            g[r0 + k2 * dr][c0 + k2 * dc] = word[k2];
          }
          placed = true;
        }
      }
      // If placement failed after 200 attempts the word is silently skipped.
    }

    // Step 4 — fill null cells with random letters
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        if (g[r][c] === null) {
          g[r][c] = ALPHA[Math.floor(Math.random() * ALPHA.length)];
        }
      }
    }

    return g;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  /**
   * Inject the complete word-search UI into #arcadeGameFrame, replacing
   * whatever is currently there (Stage-1 placeholder or a previous round).
   */
  function render() {
    var frame = document.getElementById('arcadeGameFrame');
    if (!frame) return;

    frame.innerHTML = '';   // wipe Stage-1 placeholder

    // ── Root ─────────────────────────────────────────────────────────────
    // .ws-root is a flex row: grid wrapper (flex:1) + word-list panel.
    // align-self:stretch (set in app.css) fills the full frame height.
    var root = document.createElement('div');
    root.className = 'ws-root';

    // ── Grid wrapper ─────────────────────────────────────────────────────
    var gridWrap = document.createElement('div');
    gridWrap.className = 'ws-grid-wrap';

    var gridEl = document.createElement('div');
    gridEl.id        = 'ws-grid';
    gridEl.className = 'ws-grid';

    // Build cells in row-major order so CSS Grid places them correctly
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var cell       = document.createElement('div');
        cell.className = 'ws-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.textContent = _grid[r][c];   // single upper-case letter
        gridEl.appendChild(cell);
      }
    }

    gridWrap.appendChild(gridEl);
    root.appendChild(gridWrap);

    // ── Word-list panel ───────────────────────────────────────────────────
    var panel = document.createElement('div');
    panel.className = 'ws-panel';

    var titleEl       = document.createElement('p');
    titleEl.className = 'ws-panel-title';
    titleEl.textContent = 'Find:';
    panel.appendChild(titleEl);

    // One item per target word — displayed in Title Case for readability
    _targetWords.forEach(function (word) {
      var item       = document.createElement('span');
      item.id        = 'ws-word-' + word;
      item.className = 'ws-word-item' + (_found.has(word) ? ' ws-word-item--found' : '');
      // e.g. COLLABORATE → Collaborate
      item.textContent = word.charAt(0) + word.slice(1).toLowerCase();
      panel.appendChild(item);
    });

    // Win message — hidden until all words are found
    var winEl       = document.createElement('p');
    winEl.id        = 'ws-win';
    winEl.className = 'ws-win-msg';
    winEl.textContent = '\uD83C\uDF89 All found!';   // 🎉
    if (_found.size === _targetWords.length) winEl.style.display = 'block';
    panel.appendChild(winEl);

    // New-game button — hidden until all words are found
    var replayBtn       = document.createElement('button');
    replayBtn.id        = 'ws-replay';
    replayBtn.className = 'ws-replay';
    replayBtn.textContent = '\uD83D\uDD04 New Game';  // 🔄
    if (_found.size === _targetWords.length) replayBtn.style.display = 'inline-block';
    replayBtn.addEventListener('click', startGame);
    panel.appendChild(replayBtn);

    root.appendChild(panel);
    frame.appendChild(root);

    // Wire interaction handlers to the grid element
    attachGridHandlers(gridEl);

    // Re-apply any already-found cell highlights (safety net on re-render)
    refreshCells();

    // After the browser has performed layout, scale the cell font to fit.
    // requestAnimationFrame ensures getBoundingClientRect() is accurate.
    requestAnimationFrame(fitCellFont);
  }

  // ── Font sizing ────────────────────────────────────────────────────────────

  /**
   * Measure the rendered width of the first grid cell and set a font-size
   * on every cell so each letter uses approximately 55% of the cell width.
   * This gives crisp, proportional text on any screen size — from a 360 px
   * phone to a large desktop monitor.
   *
   * Called once per render() via requestAnimationFrame.
   */
  function fitCellFont() {
    var firstCell = document.querySelector('#ws-grid .ws-cell');
    if (!firstCell) return;
    var cellWidth = firstCell.getBoundingClientRect().width;
    // Clamp between 7 px (tiny) and 16 px (very large grid cells)
    var fs = Math.max(7, Math.min(16, cellWidth * 0.54));
    document.querySelectorAll('#ws-grid .ws-cell').forEach(function (c) {
      c.style.fontSize = fs + 'px';
    });
  }

  // ── Interaction ────────────────────────────────────────────────────────────

  /**
   * Attach pointer (mouse + stylus) and touch event handlers to the grid.
   *
   * Using a single delegated listener on the grid container (not 144
   * individual cell listeners) keeps memory usage low and allows the
   * handler to be easily removed if needed.
   *
   * Selection model
   * ───────────────
   * pointerdown / touchstart  Record _selStart; enter drag mode.
   * pointermove / touchmove   Update _selEnd;   show preview highlight.
   * pointerup   / touchend    Commit: validate path; mark found if matched.
   *
   * setPointerCapture() is called on pointerdown so that pointermove and
   * pointerup keep firing even if the pointer leaves the grid element —
   * this prevents the selection from "sticking" on fast swipes.
   *
   * @param {HTMLElement} gridEl
   */
  function attachGridHandlers(gridEl) {
    // ── Pointer events (preferred — covers mouse, touch, stylus) ──────────

    gridEl.addEventListener('pointerdown', function (e) {
      var cell = e.target.closest('.ws-cell');
      if (!cell) return;
      e.preventDefault();                           // prevent text-selection drag
      gridEl.setPointerCapture(e.pointerId);        // keep events on this element
      _selStart = { r: +cell.dataset.r, c: +cell.dataset.c };
      _selEnd   = _selStart;
      _dragging = true;
      refreshCells();
    });

    gridEl.addEventListener('pointermove', function (e) {
      if (!_dragging) return;
      // elementFromPoint returns the visually topmost element at the pointer
      // coordinates regardless of capture, so we get the real cell under
      // the finger/cursor even during a fast swipe.
      var cell = cellAtPoint(e.clientX, e.clientY);
      if (!cell) return;
      _selEnd = { r: +cell.dataset.r, c: +cell.dataset.c };
      refreshCells();
    });

    gridEl.addEventListener('pointerup', function () {
      if (!_dragging) return;
      _dragging = false;
      commitSelection();
    });

    gridEl.addEventListener('pointercancel', function () {
      // Silently cancel (e.g. interrupted by a system gesture on mobile)
      _dragging = false;
      _selStart = null;
      _selEnd   = null;
      refreshCells();
    });

    // ── Touch fallback (belt-and-braces for browsers that suppress pointer) ─

    gridEl.addEventListener('touchstart', function (e) {
      var t    = e.touches[0];
      var cell = cellAtPoint(t.clientX, t.clientY);
      if (!cell) return;
      e.preventDefault();
      _selStart = { r: +cell.dataset.r, c: +cell.dataset.c };
      _selEnd   = _selStart;
      _dragging = true;
      refreshCells();
    }, { passive: false });

    gridEl.addEventListener('touchmove', function (e) {
      if (!_dragging) return;
      e.preventDefault();
      var t    = e.touches[0];
      var cell = cellAtPoint(t.clientX, t.clientY);
      if (!cell) return;
      _selEnd = { r: +cell.dataset.r, c: +cell.dataset.c };
      refreshCells();
    }, { passive: false });

    gridEl.addEventListener('touchend', function () {
      if (!_dragging) return;
      _dragging = false;
      commitSelection();
    });
  }

  /**
   * Return the .ws-cell element whose rendered bounding box contains the
   * given client-space coordinates, or null if the point is outside the grid.
   *
   * @param {number} x  Client X coordinate.
   * @param {number} y  Client Y coordinate.
   * @returns {Element|null}
   */
  function cellAtPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    return el ? el.closest('.ws-cell') : null;
  }

  // ── Selection maths ────────────────────────────────────────────────────────

  /**
   * Compute the ordered list of grid cells that form a straight-line path
   * from _selStart to _selEnd.
   *
   * A path is valid only when the endpoint delta satisfies ONE of:
   *   • dr === 0           (horizontal)
   *   • dc === 0           (vertical)
   *   • |dr| === |dc|      (45° diagonal)
   *
   * Any other angle returns an empty array — the selection is discarded.
   *
   * The step size in each axis is guaranteed to be exactly -1, 0, or +1
   * because all valid paths have |dr| = |dc| = steps (diagonal) or one
   * delta is 0 (horizontal/vertical), so there is no floating-point drift.
   *
   * @returns {{r:number,c:number}[]}
   */
  function selectionPath() {
    if (!_selStart || !_selEnd) return [];

    var dr    = _selEnd.r - _selStart.r;
    var dc    = _selEnd.c - _selStart.c;
    var absDr = Math.abs(dr);
    var absDc = Math.abs(dc);

    // Reject non-axis-aligned, non-diagonal angles
    if (dr !== 0 && dc !== 0 && absDr !== absDc) return [];

    var steps = Math.max(absDr, absDc);
    // Step direction: -1, 0, or +1 — guaranteed integer because of the check above
    var sr = steps === 0 ? 0 : dr / steps;
    var sc = steps === 0 ? 0 : dc / steps;

    var path = [];
    for (var i = 0; i <= steps; i++) {
      path.push({ r: _selStart.r + i * sr, c: _selStart.c + i * sc });
    }
    return path;
  }

  /**
   * Extract the string spelled by traversing `path` through _grid.
   *
   * @param {{r:number,c:number}[]} path
   * @returns {string}  Upper-case string.
   */
  function pathToWord(path) {
    return path.map(function (p) { return _grid[p.r][p.c]; }).join('');
  }

  /**
   * Finalise the current selection.
   *
   * 1. Extract the spelled word (and its reverse — words can be selected
   *    in either direction along the same axis).
   * 2. If it matches an as-yet-unfound TARGET_WORD, permanently mark those
   *    cells as found and cross the word off the right-hand panel.
   * 3. Always clear _selStart / _selEnd and refresh the cell display.
   */
  function commitSelection() {
    var path = selectionPath();

    // At least 2 cells are needed to form a meaningful word
    if (path.length > 1) {
      var spelled  = pathToWord(path);
      var reversed = spelled.split('').reverse().join('');

      for (var i = 0; i < _targetWords.length; i++) {
        var w = _targetWords[i];
        if (_found.has(w)) continue;

        if (spelled === w || reversed === w) {
          _found.add(w);

          // Mark each cell in this path as permanently found
          path.forEach(function (p) {
            var el = document.querySelector(
              '#ws-grid [data-r="' + p.r + '"][data-c="' + p.c + '"]'
            );
            if (el) el.dataset.found = '1';
          });

          crossOffWord(w);
          if (_found.size === _targetWords.length) showWin();
          break;  // only one word can match a given path
        }
      }
    }

    _selStart = null;
    _selEnd   = null;
    refreshCells();
  }

  // ── Visual helpers ─────────────────────────────────────────────────────────

  /**
   * Recolour every cell to reflect current state.  Called after every
   * interaction event and whenever the selection changes.
   *
   * Priority (highest first):
   *   data-found="1"  → .ws-cell--found  (permanent green)
   *   in selectionPath → .ws-cell--sel   (purple preview)
   *   otherwise        → base .ws-cell   (dim)
   */
  function refreshCells() {
    // Build a fast "row,col" lookup from the current selection path
    var path   = selectionPath();
    var selSet = {};
    path.forEach(function (p) { selSet[p.r + ',' + p.c] = true; });

    document.querySelectorAll('#ws-grid .ws-cell').forEach(function (cell) {
      var key   = cell.dataset.r + ',' + cell.dataset.c;
      var found = cell.dataset.found === '1';
      var inSel = selSet[key] === true;

      // Remove both state classes, then re-apply whichever is current
      cell.classList.remove('ws-cell--sel', 'ws-cell--found');
      if (found)      cell.classList.add('ws-cell--found');
      else if (inSel) cell.classList.add('ws-cell--sel');
    });
  }

  /**
   * Apply the found style to a word entry in the right-hand panel.
   *
   * @param {string} word  Upper-case target word.
   */
  function crossOffWord(word) {
    var el = document.getElementById('ws-word-' + word);
    if (el) el.classList.add('ws-word-item--found');
  }

  /** Display the win message and "New Game" button. */
  function showWin() {
    var winEl  = document.getElementById('ws-win');
    var replay = document.getElementById('ws-replay');
    if (winEl)  winEl.style.display  = 'block';
    if (replay) replay.style.display = 'inline-block';
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Return `n` unique words chosen at random from `pool`.
   *
   * @param {string[]} pool
   * @param {number}   n
   * @returns {string[]}
   */
  function pickWords(pool, n) {
    var copy    = pool.slice();
    var result  = [];
    var count   = Math.min(n, copy.length);
    for (var i = 0; i < count; i++) {
      var idx = Math.floor(Math.random() * copy.length);
      result.push(copy.splice(idx, 1)[0]);
    }
    return result;
  }

  /** Generate a fresh grid and render a new round. */
  function startGame() {
    _targetWords = pickWords(WORD_POOL, WORDS_PER_ROUND);
    _grid     = buildGrid();
    _found    = new Set();
    _selStart = null;
    _selEnd   = null;
    _dragging = false;
    render();
  }

  // ── Arcade event wiring ────────────────────────────────────────────────────

  /**
   * Attach 'arcade:open' and 'arcade:close' listeners to #arcadeOverlay
   * once the DOM is ready.  These are the only entry/exit points for this
   * module — all state lives in the closure above.
   */
  document.addEventListener('DOMContentLoaded', function () {
    var overlay = document.getElementById('arcadeOverlay');
    if (!overlay) return;

    // Boot the word-search when the overlay opens for gameId === 'wordsearch'
    overlay.addEventListener('arcade:open', function (e) {
      if (e.detail.gameId !== 'wordsearch') return;
      _active = true;
      startGame();
    });

    // Teardown — clear drag state in case the arcade is closed mid-drag
    overlay.addEventListener('arcade:close', function () {
      if (!_active) return;
      _active   = false;
      _dragging = false;
    });
  });

}());
