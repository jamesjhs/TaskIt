/**
 * Jobber Arcade — Stage 2 Mini-Game: Productivity Hangman
 * ========================================================
 * GameId : 'hangman'
 * Badge  : first_task (🥇 First Steps)
 *
 * Self-contained IIFE — no globals are exported.
 *
 * Boots when the arcade overlay dispatches 'arcade:open' with
 * gameId === 'hangman', and tears itself down cleanly on 'arcade:close'.
 *
 * Theme: General knowledge — players guess words from a wide range of topics.
 * Up to 6 incorrect guesses progressively draw a stick-figure using
 * an inline SVG; a 7th wrong guess never occurs.
 *
 * Interaction:
 *   • Click the on-screen A–Z keyboard buttons to guess letters.
 *   • Physical keyboard A–Z keys are also accepted while the game
 *     is visible (listener is removed when the arcade closes).
 *
 * Layout (CSS classes defined in app.css):
 *   .hm-root        — two-column flex row that fills arcade-game-frame
 *   .hm-svg-col     — left column holding the SVG gallows
 *   .hm-panel       — right column with counter, word, keyboard, message
 *   .hm-wrong-count — wrong-guess counter paragraph
 *   .hm-word        — flex row of letter slots
 *   .hm-letter-slot — one slot per character (with underline)
 *   .hm-msg         — win / lose message paragraph
 *   .hm-keyboard    — flex-wrap row of A–Z buttons
 *   .hm-key         — individual key button
 *   .hm-key--correct / .hm-key--wrong — feedback colouring
 *   .hm-replay      — "Play Again" button
 */
(function () {
  'use strict';

  // ── Word bank ──────────────────────────────────────────────────────────────
  /**
   * 100 words across a variety of topics. All stored upper-case; comparison
   * throughout is case-insensitive by design. Add or remove entries freely.
   */
  const WORDS = [
    // productivity
    'DEADLINE', 'SCHEDULE', 'ORGANIZE', 'MOMENTUM', 'MILESTONE',
    'EFFICIENCY', 'PRIORITY', 'WORKFLOW', 'COMPLETE', 'ACHIEVE',
    'DELEGATE', 'PRODUCTIVE', 'FOCUS', 'PROGRESS', 'PLANNING',
    'REVIEW', 'BACKLOG', 'SPRINT', 'ITERATE', 'LAUNCH',
    // nature
    'VOLCANO', 'RAINBOW', 'WATERFALL', 'AVALANCHE', 'GLACIER',
    'HURRICANE', 'LIGHTNING', 'QUICKSAND', 'ECOSYSTEM', 'CANOPY',
    // animals
    'ELEPHANT', 'BUTTERFLY', 'CROCODILE', 'FLAMINGO', 'KANGAROO',
    'PORCUPINE', 'RACCOON', 'JELLYFISH', 'DINOSAUR', 'CHEETAH',
    // food
    'CHOCOLATE', 'CINNAMON', 'STRAWBERRY', 'MUSHROOM', 'PINEAPPLE',
    'AVOCADO', 'BLUEBERRY', 'CORIANDER', 'LASAGNA', 'RASPBERRY',
    // sports
    'MARATHON', 'BADMINTON', 'BASKETBALL', 'VOLLEYBALL', 'SWIMMING',
    'CYCLING', 'ARCHERY', 'WRESTLING', 'GYMNASTICS', 'FENCING',
    // science & technology
    'ALGORITHM', 'CHEMISTRY', 'TELESCOPE', 'SATELLITE', 'MOLECULE',
    'EVOLUTION', 'INVENTION', 'GRAVITY', 'RADIATION', 'SPECTRUM',
    // places & geography
    'MOUNTAIN', 'PARADISE', 'LABYRINTH', 'CATHEDRAL', 'PENINSULA',
    'RESTAURANT', 'GEOGRAPHY', 'OBSERVATORY', 'STADIUM', 'CONTINENT',
    // arts & culture
    'SYMPHONY', 'PAINTING', 'ORCHESTRA', 'FESTIVAL', 'CARNIVAL',
    'SCULPTURE', 'MYTHOLOGY', 'FOLKLORE', 'LITERATURE', 'DRAMA',
    // general
    'ADVENTURE', 'TREASURE', 'CHAMPION', 'UNIVERSE', 'MYSTERY',
    'KNOWLEDGE', 'LANGUAGE', 'EDUCATION', 'IMAGINATION', 'DISCOVERY',
  ];

  /**
   * Maximum number of incorrect guesses allowed before the game is lost.
   * Must equal SVG_PARTS.length (currently 6 body parts).
   */
  const MAX_WRONG = 6;

  // ── SVG definition ─────────────────────────────────────────────────────────
  /**
   * Gallows structure — three lines plus the hanging rope.
   * This group is ALWAYS visible from the moment the game starts.
   * The elements use CSS class .hm-gallows (styled in app.css via
   * .hm-svg-col .hm-gallows so the rule is safely scoped).
   *
   * Coordinate system: viewBox="0 0 200 160"
   *   base line  y=152
   *   pole       x=50, y 8–152
   *   beam       y=8,  x 50–130
   *   rope       x=130, y 8–27
   */
  const SVG_GALLOWS =
    '<line x1="16" y1="152" x2="184" y2="152"/>' +  // base
    '<line x1="50" y1="152" x2="50"  y2="8"/>'   +  // pole
    '<line x1="50" y1="8"   x2="130" y2="8"/>'   +  // beam
    '<line x1="130" y1="8"  x2="130" y2="27"/>';    // rope

  /**
   * Six body parts revealed one-by-one as the wrong-guess count grows.
   * SVG elements use CSS class .hm-body (styled in app.css).
   * Array index 0 is the first part shown (at wrongCount === 1).
   */
  const SVG_PARTS = [
    /* 1 — head   */ '<circle class="hm-body" cx="130" cy="44" r="17"/>',
    /* 2 — torso  */ '<line   class="hm-body" x1="130" y1="61"  x2="130" y2="108"/>',
    /* 3 — L arm  */ '<line   class="hm-body" x1="130" y1="74"  x2="107" y2="98"/>',
    /* 4 — R arm  */ '<line   class="hm-body" x1="130" y1="74"  x2="153" y2="98"/>',
    /* 5 — L leg  */ '<line   class="hm-body" x1="130" y1="108" x2="107" y2="138"/>',
    /* 6 — R leg  */ '<line   class="hm-body" x1="130" y1="108" x2="153" y2="138"/>',
  ];

  // ── Game state ─────────────────────────────────────────────────────────────
  /** The word the player must guess (upper-case). Set fresh each round. */
  let _word    = '';
  /** Upper-case letters guessed so far this round. */
  let _guessed = new Set();
  /** Number of incorrect guesses in the current round (0–MAX_WRONG). */
  let _wrong   = 0;
  /** True once the round has ended (win or lose). */
  let _over    = false;
  /** True while a hangman game is mounted — guards the keyboard listener. */
  let _active  = false;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Pick a random word from WORDS and reset state for a new round. */
  function startGame() {
    _word    = WORDS[Math.floor(Math.random() * WORDS.length)];
    _guessed = new Set();
    _wrong   = 0;
    _over    = false;
    render();
  }

  // ── Full render ────────────────────────────────────────────────────────────

  /**
   * Build the entire hangman UI and inject it into #arcadeGameFrame,
   * replacing whatever was there (Stage-1 placeholder or a previous round).
   */
  function render() {
    const frame = document.getElementById('arcadeGameFrame');
    if (!frame) return;

    // Clear Stage-1 coming-soon placeholder (or previous round)
    frame.innerHTML = '';

    // ── Root container ─────────────────────────────────────────────────────
    // .hm-root is two-column flex; align-self:stretch (set in app.css)
    // makes it fill the full height of the arcade-game-frame.
    const root = document.createElement('div');
    root.className = 'hm-root';

    // ── Left column: SVG gallows ───────────────────────────────────────────
    const svgCol = document.createElement('div');
    svgCol.className = 'hm-svg-col';
    svgCol.innerHTML = buildSvg();   // safe — only our own SVG markup
    root.appendChild(svgCol);

    // ── Right panel ────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.className = 'hm-panel';

    // Wrong-guess counter
    const wrongEl = document.createElement('p');
    wrongEl.id        = 'hm-wrong';
    wrongEl.className = 'hm-wrong-count';
    wrongEl.textContent = wrongText();
    panel.appendChild(wrongEl);

    // Word display (letter slots)
    const wordEl = document.createElement('div');
    wordEl.id        = 'hm-word';
    wordEl.className = 'hm-word';
    buildWordSlots(wordEl);
    panel.appendChild(wordEl);

    // Win / lose message — empty until the round ends
    const msgEl = document.createElement('p');
    msgEl.id        = 'hm-msg';
    msgEl.className = 'hm-msg';
    panel.appendChild(msgEl);

    // A–Z keyboard
    const kbEl = document.createElement('div');
    kbEl.id        = 'hm-keyboard';
    kbEl.className = 'hm-keyboard';
    buildKeyboard(kbEl);
    panel.appendChild(kbEl);

    // Play-again button — hidden until the round ends
    const replayBtn = document.createElement('button');
    replayBtn.id        = 'hm-replay';
    replayBtn.className = 'hm-replay';
    replayBtn.textContent = '🔄 Play Again';
    replayBtn.addEventListener('click', startGame);
    panel.appendChild(replayBtn);

    root.appendChild(panel);
    frame.appendChild(root);

    // Restore end-state visuals when re-rendering an already-finished round
    syncEndState();
  }

  // ── SVG builder ────────────────────────────────────────────────────────────

  /**
   * Return the complete SVG markup string for the gallows and the number
   * of body parts that correspond to the current _wrong count.
   *
   * @returns {string} Safe HTML/SVG string (no user data, only coords).
   */
  function buildSvg() {
    // Reveal body parts 0.._wrong-1
    const parts = SVG_PARTS.slice(0, _wrong).join('');
    return (
      '<svg viewBox="0 0 200 160" width="100%"' +
      ' aria-label="Hangman figure: ' + _wrong + ' of ' + MAX_WRONG + ' wrong guesses">' +
      '<g class="hm-gallows">' + SVG_GALLOWS + '</g>' +
      parts +
      '</svg>'
    );
  }

  // ── Word display ───────────────────────────────────────────────────────────

  /**
   * Populate `container` with one `.hm-letter-slot` element per character
   * in _word.
   *  • Guessed correctly  → letter shown in green (base slot colour).
   *  • Unguessed          → invisible character (slot height preserved).
   *  • Unguessed on loss  → revealed in red (.hm-letter-slot--revealed).
   *
   * @param {HTMLElement} container
   */
  function buildWordSlots(container) {
    container.innerHTML = '';
    const lostAll = _over && _wrong >= MAX_WRONG;

    for (const letter of _word) {
      const slot = document.createElement('span');
      slot.className = 'hm-letter-slot';

      if (_guessed.has(letter)) {
        // Correctly guessed — display the letter (green via CSS default)
        slot.textContent = letter;
      } else if (lostAll) {
        // Loss: reveal unguessed letters in red
        slot.textContent = letter;
        slot.classList.add('hm-letter-slot--revealed');
      } else {
        // Not yet guessed — keep slot visible but letter hidden
        slot.textContent  = '\u00a0';  // non-breaking space preserves height
        slot.classList.add('hm-letter-slot--hidden');
      }
      container.appendChild(slot);
    }
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  /**
   * Populate `container` with 26 letter buttons (A–Z) that wrap to
   * multiple rows on narrow screens.  Buttons that have already been
   * used are styled and disabled; unused buttons register a click handler.
   *
   * @param {HTMLElement} container
   */
  function buildKeyboard(container) {
    container.innerHTML = '';

    for (let code = 65; code <= 90; code++) {
      const letter = String.fromCharCode(code);
      const btn    = document.createElement('button');
      btn.textContent   = letter;
      btn.className     = 'hm-key';
      btn.dataset.hmKey = letter;

      const used    = _guessed.has(letter);
      const correct = used && _word.includes(letter);
      const wrong   = used && !_word.includes(letter);

      if (correct) btn.classList.add('hm-key--correct');
      if (wrong)   btn.classList.add('hm-key--wrong');

      // Disable used keys and all keys once the game is over
      btn.disabled = used || _over;

      // Only attach the click handler to playable (not yet used) keys
      if (!used && !_over) {
        btn.addEventListener('click', function () { guess(letter); });
      }

      container.appendChild(btn);
    }
  }

  // ── Guess logic ────────────────────────────────────────────────────────────

  /**
   * Process a single letter guess:
   *  1. Record the guess in _guessed.
   *  2. Increment _wrong if the letter is not in _word.
   *  3. Determine if the round has ended (win or lose).
   *  4. Perform fast partial DOM updates (SVG, counter, slots, keyboard).
   *  5. Show or hide end-state elements as appropriate.
   *
   * @param {string} letter  Upper-case single character.
   */
  function guess(letter) {
    if (_over || _guessed.has(letter)) return;
    _guessed.add(letter);
    if (!_word.includes(letter)) _wrong++;

    const won  = Array.from(_word).every(function (l) { return _guessed.has(l); });
    const lost = _wrong >= MAX_WRONG;
    if (won || lost) _over = true;

    // ── Partial DOM updates (avoids a full re-render on every keypress) ──

    // SVG — only the left column innerHTML changes
    const svgCol = document.querySelector('#arcadeGameFrame .hm-svg-col');
    if (svgCol) svgCol.innerHTML = buildSvg();

    // Wrong-guess counter
    const wrongEl = document.getElementById('hm-wrong');
    if (wrongEl) wrongEl.textContent = wrongText();

    // Letter slots
    const wordEl = document.getElementById('hm-word');
    if (wordEl) buildWordSlots(wordEl);

    // Keyboard — rebuild to apply correct/wrong colouring and disable used key
    const kbEl = document.getElementById('hm-keyboard');
    if (kbEl) buildKeyboard(kbEl);

    // Win / lose message + replay button
    syncEndState();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** @returns {string} Formatted wrong-guess counter, e.g. "Wrong: 2 / 6". */
  function wrongText() {
    return 'Wrong: ' + _wrong + ' / ' + MAX_WRONG;
  }

  /**
   * Show the win or lose message and the "Play Again" button when the round
   * has ended; hide both while play is still in progress.
   */
  function syncEndState() {
    const msgEl    = document.getElementById('hm-msg');
    const replayEl = document.getElementById('hm-replay');
    if (!msgEl || !replayEl) return;

    if (!_over) {
      msgEl.textContent  = '';
      msgEl.className    = 'hm-msg';
      replayEl.style.display = 'none';
      return;
    }

    const won = Array.from(_word).every(function (l) { return _guessed.has(l); });
    if (won) {
      msgEl.textContent = '\uD83C\uDF89 You got it!';   // 🎉
      msgEl.className   = 'hm-msg hm-msg--win';
    } else {
      msgEl.textContent = '\uD83D\uDC80 The word was \u201C' + _word + '\u201D';  // 💀 "WORD"
      msgEl.className   = 'hm-msg hm-msg--lose';
    }
    replayEl.style.display = 'inline-block';
  }

  // ── Physical keyboard support ──────────────────────────────────────────────

  /**
   * Handle physical keyboard input.  Only single A–Z characters are acted
   * on; all other keys (including Escape, which closes the arcade) pass
   * through untouched.
   *
   * @param {KeyboardEvent} e
   */
  function onKeyDown(e) {
    const letter = e.key.toUpperCase();
    if (letter.length === 1 && letter >= 'A' && letter <= 'Z') {
      guess(letter);
    }
  }

  // ── Arcade event wiring ────────────────────────────────────────────────────

  /**
   * Attach 'arcade:open' and 'arcade:close' listeners to #arcadeOverlay
   * after the DOM is ready.  These handlers are the sole entry/exit points
   * for the hangman module.
   */
  document.addEventListener('DOMContentLoaded', function () {
    const overlay = document.getElementById('arcadeOverlay');
    if (!overlay) return;

    // Boot the game when the overlay opens for gameId === 'hangman'
    overlay.addEventListener('arcade:open', function (e) {
      if (e.detail.gameId !== 'hangman') return;
      _active = true;
      startGame();
      // Register physical keyboard support for the duration of this session
      document.addEventListener('keydown', onKeyDown);
    });

    // Teardown — remove the keyboard listener so it cannot ghost-fire after
    // the arcade is closed.  This handler fires for ALL game closes, but
    // removeEventListener is a no-op if onKeyDown was never added.
    overlay.addEventListener('arcade:close', function () {
      if (!_active) return;
      _active = false;
      document.removeEventListener('keydown', onKeyDown);
    });
  });

}());
