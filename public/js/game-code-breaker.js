/**
 * TaskIt! Arcade — Stage 2 Mini-Game: Code Breaker
 * ==================================================
 * GameId : 'code_breaker'
 * Badge  : streak_7 (🔐 Code Breaker)
 *
 * Self-contained IIFE — no globals are exported.
 *
 * Boots when #arcadeOverlay dispatches 'arcade:open' with
 * gameId === 'code_breaker'.  Tears down cleanly on 'arcade:close'.
 *
 * Mechanics (Mastermind-style):
 *   • The system generates a secret 4-colour code drawn from 6 colours.
 *   • The player has 10 attempts to guess the exact sequence.
 *   • After each guess two types of feedback peg are shown:
 *       ■ Black peg  — correct colour AND correct position.
 *       □ White peg  — correct colour but WRONG position.
 *   • The player selects a colour from the palette, then clicks a peg slot
 *     in the active row to assign it (clicking cycles through colours).
 *   • Pressing "Check" (or submitting via the row button) evaluates the guess.
 *   • The game ends when the code is cracked or all 10 attempts are used.
 *
 * CSS classes are defined in app.css under the .cb-* namespace.
 */
(function () {
  'use strict';

  // ── Colour palette ────────────────────────────────────────────────────────

  /**
   * Six possible colours.  Each entry carries:
   *   id       — unique string key used as a CSS class suffix.
   *   label    — human-readable accessible name.
   *   emoji    — shown in the secret-reveal row.
   */
  var COLOURS = [
    { id: 'red',    label: 'Red',    emoji: '\uD83D\uDD34' },
    { id: 'blue',   label: 'Blue',   emoji: '\uD83D\uDD35' },
    { id: 'green',  label: 'Green',  emoji: '\uD83D\uDFE2' },
    { id: 'yellow', label: 'Yellow', emoji: '\uD83D\uDFE1' },
    { id: 'orange', label: 'Orange', emoji: '\uD83D\uDFE0' },
    { id: 'purple', label: 'Purple', emoji: '\uD83D\uDFE3' },
  ];

  var CODE_LENGTH  = 4;
  var MAX_ATTEMPTS = 10;

  // ── Game state ─────────────────────────────────────────────────────────────

  /** Secret code: array of 4 colour IDs. */
  var _secret = [];
  /** Array of submitted guesses.  Each entry: { guess: string[], feedback: { black: number, white: number } } */
  var _history = [];
  /** Current in-progress guess: array of CODE_LENGTH colour-ID strings (null = empty). */
  var _current = [null, null, null, null];
  /** Currently highlighted palette colour (selected for placing). */
  var _selectedColour = COLOURS[0].id;
  /** Whether the game session is active. */
  var _active = false;
  /** Whether the round has ended. */
  var _over = false;

  // ── Core logic ─────────────────────────────────────────────────────────────

  /** Generate a random 4-colour secret code (repetition allowed). */
  function generateSecret() {
    var code = [];
    for (var i = 0; i < CODE_LENGTH; i++) {
      code.push(COLOURS[Math.floor(Math.random() * COLOURS.length)].id);
    }
    return code;
  }

  /**
   * Evaluate a guess against the secret and return feedback.
   * Uses the classic Mastermind counting algorithm:
   *   1. Count exact (black) matches first.
   *   2. Count remaining colour overlaps (white) from unmatched positions.
   *
   * @param {string[]} guess   — array of CODE_LENGTH colour IDs.
   * @param {string[]} secret  — the hidden code.
   * @returns {{ black: number, white: number }}
   */
  function evaluate(guess, secret) {
    var black = 0;
    var guessRem  = [];
    var secretRem = [];

    for (var i = 0; i < CODE_LENGTH; i++) {
      if (guess[i] === secret[i]) {
        black++;
      } else {
        guessRem.push(guess[i]);
        secretRem.push(secret[i]);
      }
    }

    // Count colour matches in unmatched positions
    var white = 0;
    for (var j = 0; j < guessRem.length; j++) {
      var idx = secretRem.indexOf(guessRem[j]);
      if (idx !== -1) {
        white++;
        secretRem.splice(idx, 1);
      }
    }

    return { black: black, white: white };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function startGame() {
    _secret          = generateSecret();
    _history         = [];
    _current         = [null, null, null, null];
    _selectedColour  = COLOURS[0].id;
    _active          = true;
    _over            = false;
    render();
  }

  // ── Interaction handlers ───────────────────────────────────────────────────

  /** Set the palette selection to the given colour ID. */
  function selectColour(colourId) {
    if (_over) return;
    _selectedColour = colourId;
    syncPalette();
  }

  /**
   * Place the currently selected colour into peg slot `slotIdx` of the
   * active row, then refresh that row.
   */
  function placeColour(slotIdx) {
    if (_over || _history.length >= MAX_ATTEMPTS) return;
    _current[slotIdx] = _selectedColour;
    syncActiveRow();
  }

  /** Submit the current guess if all four slots are filled. */
  function submitGuess() {
    if (_over) return;
    // Ensure all slots are filled
    for (var i = 0; i < CODE_LENGTH; i++) {
      if (!_current[i]) return;
    }

    var guess    = _current.slice();
    var feedback = evaluate(guess, _secret);
    _history.push({ guess: guess, feedback: feedback });
    _current = [null, null, null, null];

    var won  = feedback.black === CODE_LENGTH;
    var lost = !won && _history.length >= MAX_ATTEMPTS;
    if (won || lost) _over = true;

    // Re-render history and update active row / end state
    renderHistory();
    if (_over) {
      renderEndState(won);
    } else {
      renderActiveRow();
    }
    syncSubmitBtn();
  }

  // ── DOM builders ──────────────────────────────────────────────────────────

  /** Full render — builds entire UI into #arcadeGameFrame. */
  function render() {
    var frame = document.getElementById('arcadeGameFrame');
    if (!frame) return;
    frame.innerHTML = '';

    var root = document.createElement('div');
    root.className = 'cb-root';
    root.id        = 'cb-root';

    // Board (history + active row)
    var board = document.createElement('div');
    board.className = 'cb-board';
    board.id        = 'cb-board';
    root.appendChild(board);

    // Colour palette
    var palette = buildPalette();
    root.appendChild(palette);

    // End message
    var msgEl = document.createElement('p');
    msgEl.id        = 'cb-msg';
    msgEl.className = 'cb-msg';
    root.appendChild(msgEl);

    // Replay button
    var replayBtn = document.createElement('button');
    replayBtn.id        = 'cb-replay';
    replayBtn.className = 'cb-replay';
    replayBtn.textContent = '\uD83D\uDD04 New Game';
    replayBtn.addEventListener('click', function () { startGame(); });
    root.appendChild(replayBtn);

    frame.appendChild(root);

    // Populate board
    renderHistory();
    renderActiveRow();
    syncPalette();
  }

  /** Build a single guess row element (historical or active).
   *
   * @param {number}   attempt  1-based attempt number.
   * @param {string[]} pegs     Array of CODE_LENGTH colour IDs (null = empty).
   * @param {{ black:number, white:number } | null} feedback  null = active row.
   * @param {boolean}  isActive Whether this is the current editable row.
   * @returns {HTMLElement}
   */
  function buildRow(attempt, pegs, feedback, isActive) {
    var row = document.createElement('div');
    row.className = 'cb-row' + (isActive ? ' cb-row--active' : '');
    if (isActive) row.id = 'cb-active-row';

    // Attempt number
    var numEl = document.createElement('span');
    numEl.className   = 'cb-row-num';
    numEl.textContent = attempt;
    row.appendChild(numEl);

    // Four colour peg slots
    var pegsEl = document.createElement('div');
    pegsEl.className = 'cb-pegs';

    for (var i = 0; i < CODE_LENGTH; i++) {
      var peg = document.createElement('div');
      peg.className = 'cb-peg' + (pegs[i] ? ' cb-peg--' + pegs[i] : '') + (isActive ? ' cb-peg--active' : '');
      peg.setAttribute('aria-label', pegs[i] ? pegs[i] : 'empty');
      if (isActive) {
        // Closure captures the slot index
        (function (slotIdx) {
          peg.addEventListener('click', function () { placeColour(slotIdx); });
        }(i));
      }
      pegsEl.appendChild(peg);
    }
    row.appendChild(pegsEl);

    // Feedback pegs (2×2 grid) — shown for submitted rows only
    var fbEl = document.createElement('div');
    fbEl.className = 'cb-feedback';

    if (feedback !== null) {
      // Fill: black pegs first, then white, then empty
      var fbPegs = [];
      for (var b = 0; b < feedback.black; b++) fbPegs.push('black');
      for (var w = 0; w < feedback.white; w++) fbPegs.push('white');
      while (fbPegs.length < CODE_LENGTH) fbPegs.push('empty');

      for (var k = 0; k < CODE_LENGTH; k++) {
        var fp = document.createElement('div');
        fp.className = 'cb-fb-peg cb-fb-peg--' + fbPegs[k];
        fp.setAttribute('aria-label', fbPegs[k] + ' feedback');
        fbEl.appendChild(fp);
      }
    } else {
      // Active row — blank feedback placeholder
      for (var e = 0; e < CODE_LENGTH; e++) {
        var ep = document.createElement('div');
        ep.className = 'cb-fb-peg';
        fbEl.appendChild(ep);
      }
    }
    row.appendChild(fbEl);

    // Submit button — only on the active row
    if (isActive) {
      var submitBtn = document.createElement('button');
      submitBtn.id        = 'cb-submit';
      submitBtn.className = 'cb-submit';
      submitBtn.textContent = 'Check';
      submitBtn.setAttribute('aria-label', 'Submit guess');
      submitBtn.addEventListener('click', submitGuess);
      row.appendChild(submitBtn);
      syncSubmitBtn();
    }

    return row;
  }

  /** Re-render all submitted rows into #cb-board. */
  function renderHistory() {
    var board = document.getElementById('cb-board');
    if (!board) return;
    board.innerHTML = '';

    for (var i = 0; i < _history.length; i++) {
      var entry = _history[i];
      var rowEl = buildRow(i + 1, entry.guess, entry.feedback, false);
      board.appendChild(rowEl);
    }
  }

  /** Render (or refresh) the active input row at the bottom of the board. */
  function renderActiveRow() {
    if (_over) return;
    var board = document.getElementById('cb-board');
    if (!board) return;

    // Remove any existing active row first
    var existing = document.getElementById('cb-active-row');
    if (existing) existing.remove();

    var attempt = _history.length + 1;
    if (attempt > MAX_ATTEMPTS) return;

    var rowEl = buildRow(attempt, _current, null, true);
    board.appendChild(rowEl);

    // Scroll the board to reveal the active row
    board.scrollTop = board.scrollHeight;
  }

  /**
   * Lightweight refresh of the active row's peg colours without rebuilding
   * the whole row — keeps DOM churn low.
   */
  function syncActiveRow() {
    var pegsEl = document.querySelectorAll('#cb-active-row .cb-peg');
    if (!pegsEl.length) { renderActiveRow(); return; }

    for (var i = 0; i < CODE_LENGTH; i++) {
      var peg = pegsEl[i];
      // Strip any existing colour class
      peg.className = 'cb-peg cb-peg--active' + (_current[i] ? ' cb-peg--' + _current[i] : '');
      peg.setAttribute('aria-label', _current[i] || 'empty');
    }
    syncSubmitBtn();
  }

  /** Update the submit button disabled state based on whether all slots are filled. */
  function syncSubmitBtn() {
    var btn = document.getElementById('cb-submit');
    if (!btn) return;
    var allFilled = _current.every(function (c) { return c !== null; });
    btn.disabled = !allFilled;
  }

  /** Highlight the selected colour swatch in the palette. */
  function syncPalette() {
    var swatches = document.querySelectorAll('.cb-swatch');
    for (var i = 0; i < swatches.length; i++) {
      var sw = swatches[i];
      if (sw.dataset.colourId === _selectedColour) {
        sw.classList.add('cb-swatch--selected');
      } else {
        sw.classList.remove('cb-swatch--selected');
      }
    }
  }

  /** Build the colour-selection palette row. */
  function buildPalette() {
    var palette = document.createElement('div');
    palette.className = 'cb-palette';

    var label = document.createElement('span');
    label.className   = 'cb-palette-label';
    label.textContent = 'Colour:';
    palette.appendChild(label);

    for (var i = 0; i < COLOURS.length; i++) {
      var col = COLOURS[i];
      var sw  = document.createElement('button');
      sw.className          = 'cb-swatch cb-peg--' + col.id;
      sw.dataset.colourId   = col.id;
      sw.setAttribute('aria-label', 'Select ' + col.label);
      sw.title              = col.label;
      // Closure captures col.id
      (function (id) {
        sw.addEventListener('click', function () { selectColour(id); });
      }(col.id));
      palette.appendChild(sw);
    }

    return palette;
  }

  /** Render the end-of-game message, secret reveal, and replay button. */
  function renderEndState(won) {
    var msgEl    = document.getElementById('cb-msg');
    var replayEl = document.getElementById('cb-replay');

    if (msgEl) {
      if (won) {
        msgEl.textContent = '\uD83C\uDF89 You cracked it in ' + _history.length + ' attempt' + (_history.length !== 1 ? 's' : '') + '!';
        msgEl.className   = 'cb-msg';
      } else {
        msgEl.textContent = '\uD83D\uDD12 Out of attempts! The code was:';
        msgEl.className   = 'cb-msg cb-msg--lose';
      }
    }

    // Reveal the secret code below the message
    var existingReveal = document.getElementById('cb-secret');
    if (existingReveal) existingReveal.remove();

    var revealEl   = document.createElement('div');
    revealEl.id        = 'cb-secret';
    revealEl.className = 'cb-secret';

    var revLabel   = document.createElement('span');
    revLabel.className   = 'cb-secret-label';
    revLabel.textContent = won ? 'Code:' : 'Answer:';
    revealEl.appendChild(revLabel);

    var secretPegs = document.createElement('div');
    secretPegs.className = 'cb-secret-pegs';
    for (var i = 0; i < CODE_LENGTH; i++) {
      var sp = document.createElement('div');
      sp.className = 'cb-peg cb-peg--' + _secret[i];
      sp.setAttribute('aria-label', _secret[i]);
      secretPegs.appendChild(sp);
    }
    revealEl.appendChild(secretPegs);

    // Insert before the replay button
    var root = document.getElementById('cb-root');
    if (root && replayEl) {
      root.insertBefore(revealEl, replayEl);
    }

    if (replayEl) replayEl.style.display = 'inline-block';
  }

  // ── Arcade module registration ───────────────────────────────────────────

  window.TaskItArcade.register({
    gameId: 'code_breaker',
    mount: function () {
      _active = true;
      startGame();
    },
    unmount: function () {
      if (!_active && !_over) return;
      _active = false;
      _over   = true; // prevent any pending interaction from firing
    },
  });

}());
