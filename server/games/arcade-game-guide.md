# TaskIt! Arcade Game Creation and Integration Manual

Agent-readable Markdown companion to [the HTML guide](public/arcade-game-guide.html). This duplicates the guide content, including examples and integration requirements; keep both versions in sync when updating the contract. All repository paths below are relative to the repository root unless stated otherwise.

v1.24.1 · a complete guide for contributors and coding agents

**Contents**

1. [Mental Model](#mental-model)
2. [Get TaskIt running](#get-taskit-running)
3. [Know where everything goes](#know-where-everything-goes)
4. [Copy a working starter game](#copy-a-working-starter-game)
5. [Select the game in Admin](#select-the-game-in-admin)
6. [Include dependencies in the game code](#include-dependencies-in-the-game-code)
7. [Admin fields at a glance](#admin-fields-at-a-glance)
8. [The wrapper communication contract](#the-wrapper-communication-contract)
9. [Lifecycle and integration hooks](#lifecycle-and-integration-hooks)
10. [Context supplied by TaskIt](#context-supplied-by-taskit)
11. [Timers: two different clocks](#timers-two-different-clocks)
12. [Tokens: only grant a benefit after payment succeeds](#tokens-only-grant-a-benefit-after-payment-succeeds)
13. [High scores and anonymous names](#high-scores-and-anonymous-names)
14. [Screen dimensions and controls](#screen-dimensions-and-controls)
15. [If you use an iframe](#if-you-use-an-iframe)
16. [API reference for adapter authors](#api-reference-for-adapter-authors)
17. [Design and UX Constraints](#design-and-ux-constraints)
18. [Check your game before sharing](#check-your-game-before-sharing)
19. [Brief for an AI Agent](#brief-for-an-ai-agent)
20. [Pull Request Review Checklist](#pull-request-review-checklist)
21. [Troubleshooting](#troubleshooting)
22. [Deployment and maintenance](#deployment-and-maintenance)

Add a game and its runtime dependencies under `server/games/public/`, then select its entry script in Admin. No manifest, companion registration file, database seed edit, application-code change, or server restart is needed. Admin stores the title, selected script, unlock order, and enabled state. TaskIt manages score identity internally.

Start here if you have never written a TaskIt game before. A game is a browser JavaScript file that draws inside TaskIt's game frame. TaskIt supplies the surrounding screen, account session, unlock rules, token balance, and score storage. You supply the rules, controls, and fun.

## Mental Model

The TaskIt! app owns the Arcade overlay, achievement unlock rules, daily play budget, token spending, and close/back controls. A game module owns only the content inside `#arcadeGameFrame`.

When a user opens a game, TaskIt! fetches the enabled arcade catalogue from the server, dynamically loads the configured JavaScript file, looks up the module registered by that script path, and calls its `mount(frame, context)` function. When the overlay closes, TaskIt! calls `unmount()`.

| Owned by TaskIt! | Owned by the game module |
| --- | --- |
| Overlay shell, title, subtitle, back button, token balance, daily limit, achievement access | Game UI inside `#arcadeGameFrame`, game state, scoring, input handling, timers within the game |
| Script loading from the selected `.js` file with cache busting using the admin catalogue's `updatedAt` | Registering itself with `window.TaskItArcade.register(...)` |

> The game should not navigate away, replace the whole page, edit account data, or assume it is the only JavaScript running on the page.

## Get TaskIt running

You need:

- Node.js 20 or newer and npm (included with Node).
- A checkout of this repository, a terminal, and a code editor.
- A modern browser. Labyrinth also needs WebGL; a simple button or canvas game does not.
- A TaskIt account with gamification enabled. An administrator selects the entry script, sets its details, and can preview every game.

From the repository root (`TaskIt`, not `server/games`):

```powershell
npm ci
$env:ADMIN_EMAIL = 'your-local-test-account@example.com'
npm run dev
```

Open `http://localhost:3000`, create/sign in to the account matching `ADMIN_EMAIL`, and enable gamification. The development server normally uses port 3000; `PORT` can override it. Set environment variables before starting the server. See the root README for account, mail, database, and deployment configuration. Keep local test data separate from production (set `DB_PATH` before startup if needed). No game-specific API key, separate game server, or external CDN is required.

If you change Tailwind utility classes, run `npm run dev:css` in a second terminal, or `npm run build:css` once. Plain CSS in `public/css/arcade.css` is served directly and needs no compilation.

## Know where everything goes

```text
server/games/
  public/                           Available at /games/ on the TaskIt server
    arcade-game-guide.html          Complete game development and integration guide
    css/arcade.css                  Arcade shell and shared game styles
    js/arcade-wrapper.js            TaskIt's browser integration and lifecycle
    js/game-*.js                    Registerable game modules
    my-game/                       Your new game and its runtime files
      main.js                      Game code
      style.css                    Optional stylesheet
      vendor/                      Optional browser libraries
    labyrinth/labyrinth.html        Standalone iframe game
    labyrinth/assets/vendor/        Self-hosted Three.js renderer
```

Create a folder such as `server/games/public/my-game/` containing `main.js`. Keep its CSS, libraries, images, audio, and data beside them. The browser URL of `main.js` is `/games/my-game/main.js`. Register your module synchronously while its script loads; the wrapper associates it with `document.currentScript`. The entry filename does not need a `game-` prefix. Admin finds JavaScript files containing the `TaskItArcade.register(...)` call anywhere in this public directory.

Keep images, sounds, and other dependencies below `server/games/public/`, using URLs beginning `/games/`. Only put browser-safe files there. The server serves this public subdirectory, not the whole `games` directory.

Shared account/XP services, database tables, API routes, and the main app's achievement/Admin screens remain in `server/src` and `public/index.html`: games call those existing integrations. They are shared TaskIt features. The wrapper remains a classic browser script loaded by the main page; it uses the main application's `api`, user, navigation, and gamification state. Do not load it as an ES module or expect it to run by itself.

## Copy a working starter game

Save this as `server/games/public/my-game/main.js`. Click the button to score for 20 seconds. TaskIt offers the completed score for posting when you leave the game. This example uses only local DOM state, cleans up its timer, and supports the wrapper's extra-time button.

```javascript
(function () {
  'use strict';
  let root = null;
  let clock = null;
  let score = 0;
  let secondsLeft = 20;
  let finished = false;
  let scoreLabel;
  let timeLabel;
  let button;

  function paint() {
    scoreLabel.textContent = 'Score: ' + score;
    timeLabel.textContent = finished
      ? 'Finished! Use Back to leave and post your score.'
      : secondsLeft + ' seconds left';
    button.disabled = finished;
  }

  window.TaskItArcade.register({
    mount(frame, context) {
      // A new visit starts a fresh run. context.gameId is the runtime ID.
      clearInterval(clock);
      score = 0;
      secondsLeft = 20;
      finished = false;
      root = document.createElement('div');
      root.style.cssText = 'box-sizing:border-box;width:100%;height:100%;' +
        'min-height:0;overflow:auto;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;gap:12px;padding:16px;color:white;';
      const heading = document.createElement('h2');
      heading.textContent = context.title;
      scoreLabel = document.createElement('p');
      timeLabel = document.createElement('p');
      timeLabel.setAttribute('role', 'status');
      button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Score a point';
      button.style.cssText = 'min-height:44px;padding:12px 20px;color:#111;background:#fff;border-radius:8px;';
      button.addEventListener('click', () => {
        if (!finished) { score += 1; paint(); }
      });
      root.append(heading, scoreLabel, timeLabel, button);
      frame.replaceChildren(root);
      paint();
      clock = setInterval(() => {
        if (finished) return;
        secondsLeft = Math.max(0, secondsLeft - 1);
        finished = secondsLeft === 0;
        paint();
      }, 1000);
    },
    addTime(seconds) {
      // TaskIt has already paid for this extension. Do not charge again.
      if (root && !finished) { secondsLeft += seconds; paint(); }
    },
    getHighScore() {
      // Called synchronously BEFORE unmount. null skips unfinished runs.
      return finished ? { score } : null;
    },
    unmount() {
      clearInterval(clock);
      clock = null;
      root?.remove();
      root = null;
    },
  });
}());
```

For your next version, replace the scoring button with your own game rules. Use the existing Hangman module for a puzzle, Whac-A-Bug for timed play, or Labyrinth for a self-contained iframe game. Keep mutable state inside the module rather than adding globals to the main app.

## Select the game in Admin

Use **+ Add** at the bottom of the list to create a placeholder with “New game name”, “New game description”, and a 🎮 icon. It starts disabled with no script assigned. Click its pencil to edit directly inside the row. Click the pencil again to exit, or click another game’s pencil to switch editors; unsaved changes in the previous row are discarded. Only one row can be edited at a time. The row gets a pink border, with borderless title and description fields and a Script File selector containing None and the available modules. Upload a PNG icon under 40 × 40 px (maximum 32 KB), following the same dimensions as reward icons. A preview appears immediately; Save persists the row and uploads the icon, while Cancel discards the draft. Use Test beside the Script File selector to open the current draft in a new window, even before saving or enabling the game. Select a script first; None disables Test. Testing leaves the saved row unchanged. There is no separate New Arcade Game form; creation and editing happen in the list.

1. Open **Admin > Gamify > Arcade Games** and refresh the script file list.
2. Select `/games/my-game/main.js` as the Script File.
3. Enter the Title you want players to see. There is no Game ID field to fill in.
4. Edit the description, optionally upload a PNG icon, and use the triangle buttons to choose the game order. No achievement slot is needed.
5. Enable it, save, and click its linked title to play. The game is now available through Progress/Gamify.

Use the ▴ and ▾ buttons beside a game to change its position. Games without a selected script can be saved and moved too. The list shows the position before each title; the buttons save the new order immediately. Use the pencil to edit a game or the red X to delete it; deletion still asks for confirmation.

Ordinary users unlock the first N enabled games after earning N achievements. Sort order controls that sequence (ties sort by title); Admins can preview every game. Any earned achievement unlocks the next enabled game, regardless of its type. Unlocked games appear in their own section, independently of achievement badges.

### Include dependencies in the game code

For JavaScript libraries or CSS, add an optional `dependencies` property to the existing registration object inside `main.js`:

```javascript
window.TaskItArcade.register({
  dependencies: {
    scripts: ['vendor/helper.js', 'levels.js'],
    styles: ['style.css']
  },
  mount(frame, context) {
    // The declared libraries and styles are ready now.
    // Build your game using their APIs here.
  },
  unmount() {
    // Stop timers, audio, observers, and global listeners.
  }
});
```

Only declare files that exist. Paths resolve relative to the entry script; absolute paths starting `/games/` also work. All dependencies must stay on this server inside `/games/`. CSS loads first; classic JavaScript libraries execute in array order. The entry script registers synchronously before dependency loading, so reference library APIs inside `mount` and later callbacks. Do not call those libraries at the entry script's top level.

Images, audio, data, and iframe HTML are ordinary runtime files. Load them from your game using `context.assetUrl('images/player.png')`, `fetch`, or ordinary iframe-relative URLs. They need no registration list. For example:

```text
server/games/public/my-game/
  main.js
  style.css
  levels.js
  vendor/helper.js
  images/player.png
```

Bundle npm/ES-module source into browser scripts first, or use modules within your own iframe page. Give entry files and browser libraries their own function scope so reopening a game does not redeclare global constants. TaskIt caches successful dependency loads for a game-tree revision and removes declared styles on close. Changes to game files or shared dependencies change the revision on the next catalogue refresh.

Admin settings remain authoritative when you edit game files. Adding files does not publish a game automatically, and deleting its Admin entry persists while its files remain. Missing dependencies produce a load error before `mount` runs. Check the browser console for syntax errors and dependency failures if loading fails.

### Admin fields at a glance

| Admin field | How to fill it |
| --- | --- |
| Order | Unlock order. A user with N achievements can play the first N enabled games by this order. |
| Title | Display title shown on the game card and Arcade overlay. |
| Icon | The 🎮 placeholder unless an uploaded PNG under 40 × 40 px is set. Uploaded icons appear in the game row, game card, and Arcade header. |
| Subtitle | One-line game description shown below the title. |
| Script File | The runtime path to the game file, such as `/games/js/game-my-game.js`. |
| Enabled for users | Only enabled games appear in the user arcade catalogue. |

## The wrapper communication contract

These are the actual hooks in `public/js/arcade-wrapper.js` (relative to this directory):

### Lifecycle and integration hooks

| Hook | What to implement |
| --- | --- |
| `gameId` | Optional legacy alias used by older modules. TaskIt assigns the selected entry's internal identity automatically; no matching configuration is needed. |
| `mount(frame, context)` | Required. Clear/populate the supplied element and start a fresh session. It is called each launch. |
| `unmount()` | Always implement. Stop intervals, timeouts, animation loops, audio, global listeners, observers, and pending work. |
| `addTime(seconds)` | Optional. Extend your game's own countdown after the default token purchase succeeds. |
| `spendToken()` | Optional async override for a custom purchase such as a hint or life; see below. |
| `getHighScore()` | Optional synchronous exit score: return `{ score }`, a numeric score, or `null`. `getScore()` is the fallback name. |
| `handleBack()` | Optional. Return `true` when your game handled an internal Back action, `false` to let TaskIt leave. Labyrinth demonstrates this. |

### Context supplied by TaskIt

`mount` receives this context. Timers and dimensions remain game-owned; the host also supplies bound API helpers:

```javascript
{
  badgeKey,             // Internal catalogue row key
  gameId,               // Internal identity assigned by TaskIt
  configuredGameId,     // ID stored in the Admin catalogue
  title,
  game,                 // Catalogue metadata and game-tree revision
  assetUrl,             // (relativePath) => URL relative to your entry script
  submitScore,          // (score) => Promise<saved score or null>
  getHighScores,        // () => Promise<rows> for this game
  spendToken            // () => Promise<{ arcadeTokens }>; pays and refreshes balance
}
```

No module ID needs to match an Admin setting. The wrapper identifies the loaded definition by its selected Script File and binds score operations to that catalogue entry. Existing internal IDs stay stable when a Title changes. `mount` can return a runtime object exposing the hooks, otherwise the registered definition is used. Keep mounting synchronous; returning a Promise does not create an awaited game instance.

### Timers: two different clocks

**TaskIt's daily play allowance** is wrapper-owned. It reads `arcadeDailyPlayMinutes` from the user's profile (default 5; Admin setting accepts 1–180). Usage is tracked once per second while the overlay is open in this browser's `localStorage` as `arcadePlaySeconds` and `arcadePlayDate`. The date uses UTC (`toISOString()`), not the user's local midnight. Admins bypass the opening lock.

**Your round timer** is game-owned. Use an interval or a monotonic deadline for your own rounds; stop it on unmount. If you implement `addTime`, the wrapper passes 30 seconds after a successful default token purchase. Do not alter the wrapper's localStorage values from your game.

Current limits to understand: the daily counter is browser-local, is not a server-authoritative anti-cheat mechanism, and does not force an already-running game to stop when its display reaches zero. The default token path subtracts up to 30 seconds from stored usage, but an already-running wrapper interval retains its original starting count and can overwrite that adjustment on its next tick. Do not assume the daily HUD reliably extends an ongoing session or that it controls your round clock. Changing that behaviour is a separate wrapper change.

### Tokens: only grant a benefit after payment succeeds

Players earn three Arcade Tokens per XP level-up. The database owns the balance. Games must never decrement a local number as proof of payment.

For a timed game, use `addTime(seconds)` and let TaskIt handle the purchase. The default top-bar button calls the authenticated spend endpoint, refreshes the balance, calls your hook, and emits `arcade:addTime` on `#arcadeOverlay` with `{ seconds: 30 }`. Implement the hook **or** listen for this legacy event; using both grants the benefit twice.

For a custom purchase, implement `async spendToken()`. This overrides the entire default purchase flow: your hook must make the payment, update TaskIt's balance, grant the benefit, and return optional toast text. It receives no arguments and must throw on failure. It does not automatically add daily time or call `addTime`.

```javascript
// Inside a registered game definition; use this instead of addTime for hints.
async spendToken() {
  const result = await api('POST', '/gamification/arcade/spend-token');
  if (!result || typeof result.arcadeTokens !== 'number') {
    throw new Error('Could not confirm token purchase');
  }
  arcadeTokens = result.arcadeTokens;
  updateArcadeTokenDisplays();
  // Grant the hint HERE, after the server confirms payment.
  revealHint(); // Your own game function
  return 'Extra hint unlocked!';
}
```

The legacy example above uses host globals. New games can save the supplied context in `mount` and use `await context.spendToken()` instead: it confirms payment and refreshes the host balance, then your game grants its hint/life. Likewise, `context.submitScore(score)` and `context.getHighScores()` bind requests to your game ID. The snippet runs in the parent page, not inside an iframe. See `game-labyrinth.js` for the existing bridge. Guard custom in-game purchase buttons against overlapping requests and late responses after unmount. A failed/offline purchase must grant nothing.

### High scores and anonymous names

Choose **one submission route per completed run**:

- Simplest: implement synchronous `getHighScore()`; TaskIt reads it on exit before unmounting.
- To post immediately: `await context.submitScore(123)` using the context saved during `mount`.
- Legacy event: dispatch `new CustomEvent('arcade:score', { detail: { score: 123 } })` on `#arcadeOverlay`.

If you post immediately, have the exit reader return `null` for that submitted run to avoid duplicates. Successful submissions create rows; the server does not deduplicate runs. `submitScore` returns saved data on success or `null` if posting fails or the player still needs to choose a name. TaskIt prompts for an arcade pseudonym and holds a pending score when necessary. Do not treat `null` as a saved score or retry automatically while that name prompt is open.

Scores must be integers from 0 to 1,000,000,000; larger values rank higher. Submission requires a signed-in user with gamification enabled, an arcade pseudonym, and an enabled selected game. The context helpers supply its internal identity. Arcade names are 2–10 characters with server validation; use the host's name prompt instead of requesting account names or emails.

```javascript
const rows = await context.getHighScores();
// Up to 20 entries, highest score first (earliest submission wins ties):
// { rank, id, score, pseudonym, createdAt, isMine }
```

Render names with `textContent`. Score requests can fail offline; avoid breaking gameplay when a leaderboard cannot load. Scores are reported by the client; this is not server-validated competitive game simulation.

### Screen dimensions and controls

Never assume the game gets the entire screen. The overlay contains its own header and time/token controls. `#arcadeGameFrame` is a flex container with width/height 100%, maximum width **640px**, minimum height **180px**, and hidden overflow; the parent determines available height. These are layout rules, not a guaranteed fixed resolution.

- Size your root to `width:100%; height:100%; box-sizing:border-box; min-height:0`. Use an internal scrolling area if needed.
- Measure `frame.getBoundingClientRect()` after mounting. Observe it with `ResizeObserver`; resize after rotation and browser/WebView size changes. Disconnect on unmount.
- For canvas, use CSS dimensions for layout and `devicePixelRatio` for the backing buffer. Translate pointer coordinates using the canvas bounding rectangle and your logical game dimensions.
- Test narrow phones (for example 320px wide), landscape, touch, mouse, keyboard, and large desktop screens. Aim for touch targets of at least 44px.
- Keep styles scoped to your game's root. Put shared styles in `public/css/arcade.css`; load any separate game stylesheet explicitly and clean it up as appropriate.
- Avoid global keyboard traps; keep TaskIt's Back/Escape controls usable. Remove any window/document listeners you add.

### If you use an iframe

Use `game-labyrinth.js` plus `labyrinth/labyrinth.html` as the complete reference. The iframe fills the supplied frame, stays on the same origin, and talks to the parent via `postMessage`. It does not directly receive `window.TaskItArcade` or the parent's `api` helper.

The existing Labyrinth protocol is game-specific, not a generic service automatically provided to every iframe:

| Direction | Message |
| --- | --- |
| Child → parent request | `{ source: 'taskit-labyrinth', id, type, payload }`; types: `getScores`, `submitScore` (`{ score, level, mode }`), `spendHintToken` |
| Parent → child response | `{ source: 'taskit-labyrinth-parent', id, ok, payload, error }` using the same request ID |
| Child → parent notification | `stateChanged` (`{ state }`), `finalScore` (`{ score, level, mode }`), or `scoreSubmitted` |
| Parent → child command | `{ source: 'taskit-labyrinth-parent', type: 'back' }` or `type: 'tokenHintGranted'` |

For a new iframe game, implement your own adapter or deliberately adapt this protocol. Validate **both** `event.origin` and `event.source` in parent and child, send to the explicit same origin, match response IDs, time out requests, and remove listeners/pending work on teardown. Do not send TaskIt credentials into a game or let the child choose an arbitrary payment/score API endpoint. There is currently no standard timer or resize message: the iframe measures its own viewport, and its adapter must explicitly forward extra time if needed.

### API reference for adapter authors

Prefer the wrapper helpers for ordinary modules. The host `api(method, path, body)` helper supplies authentication and prefixes `/api`; use `/gamification/...` with it. Raw HTTP requests use the full paths below and require the user's Bearer session token.

| Method and full URL | Purpose |
| --- | --- |
| `GET /api/gamification/arcade/games` | Enabled catalogue in unlock order |
| `POST /api/gamification/arcade/spend-token` | Atomically spend one token; returns `{ arcadeTokens }`; insufficient balance returns 400 |
| `PUT /api/gamification/arcade/pseudonym` | Save `{ pseudonym }`; returns `{ arcadePseudonym }` |
| `POST /api/gamification/arcade/high-scores` | Save `{ gameId, score }`; returns `{ id, gameId, score, pseudonym, createdAt, rank }` |
| `GET /api/gamification/arcade/high-scores/:gameId` | Read up to 20 anonymous score rows |

Use same-origin assets. TaskIt's security policy permits self-hosted game scripts/frames and blocks arbitrary third-party script/CDN connections and `eval`. Treat API responses and player text as data. Prefer DOM creation and `textContent` over HTML string interpolation.

## Design and UX Constraints

- Render only inside the provided `frame`. Do not append game UI directly to `document.body` except for temporary browser-native APIs that are cleaned up.
- Keep the game responsive from narrow mobile screens to desktop. Use `width:100%`, `height:100%`, flex/grid, and stable dimensions.
- Do not cover the Arcade top bar, token display, back button, or daily limit row.
- Use existing Arcade CSS classes where sensible. Current games use prefixes such as `hm-`, `ws-`, `wab-`, and `cb-`. New games should use their own unique prefix.
- Use buttons for actions and make keyboard/touch interaction work. Escape is reserved by TaskIt! to close the overlay.
- Do not use network calls unless the game explicitly needs them and the endpoint already exists.
- Do not store sensitive data in localStorage. Small local preferences or high scores are acceptable only if they are non-sensitive.
- Avoid large assets. If assets are needed, place them under a dedicated public folder and keep load failures graceful.
- If using timers, pause/stop them in `unmount()`. If using `requestAnimationFrame`, cancel it in `unmount()`.
- If the game uses audio, default to muted or user-initiated playback and stop it in `unmount()`.

> Never depend on `DOMContentLoaded` to start the game. Game scripts are loaded lazily after the page is already running.

## Check your game before sharing

Run from the repository root:

```powershell
npm run build
npm run test:games
```

The build runs the reviewed XSS sink scan, CSS generation, and TypeScript compilation. The integration test registers all seven bundled games through the Admin API without metadata files, then adds a test game with dependencies to a running server and checks loading, mounting, revision changes, and Admin edit/delete behaviour. New HTML/script sinks require deliberate review; do not blindly refresh the baseline to pass the check.

Then check the actual game:

- Its entry appears in the Admin script picker without a companion metadata file, opens without console errors, and uses the intended Title and Script File.
- Open, play, Back, and reopen several times: no duplicate input, ticking timers, audio, or lingering iframe work.
- Resize and rotate; ensure the game fits without covering TaskIt's header or controls.
- Complete a run and leave; it posts once, with the chosen arcade name. Cancel a run; it does not accidentally post an unfinished score.
- Test token purchases with a positive balance, zero balance, and a failed request. Grant no unpaid benefit.
- Check both an Admin account and an ordinary account, including locked/unlocked games and exhausted daily time.
- Test an offline/failed leaderboard request and refresh/reopen after editing the game.

If the entry is missing from Admin, check that it lives under `server/games/public/`, ends in `.js`, and contains `TaskItArcade.register(...)`. Use normal filenames with letters, digits, dots, underscores, or hyphens. Refresh the file list. If loading fails, check dependency paths and the browser console. If scores fail, check that the game is enabled, a pseudonym is set, the score is an integer, and the player is signed in.

## Brief for an AI Agent

Use this prompt when asking an AI coding agent to create a game:

```
You are adding a TaskIt! Arcade game module.

Read server/games/public/arcade-game-guide.html and inspect existing game modules.
Create an entry script and runtime dependencies under server/games/public. Declare optional scripts/styles in the entry registration object. Do not create metadata or registration files.
Use window.TaskItArcade.register({ mount, unmount, dependencies?, addTime? }); gameId is optional.
Render only inside the frame passed to mount().
Do not depend on DOMContentLoaded.
Clean up all timers, requestAnimationFrame loops, audio, and document/window listeners in unmount().
Use a unique CSS class prefix and either inline scoped styles inside the game root or existing Arcade styles.
Make it responsive for mobile and desktop.
Preserve Escape behavior for closing the Arcade.
Explain which Title and Script File to select in Admin. No separate registration or metadata file is needed.
```

## Pull Request Review Checklist

- The entry is below `server/games/public/` and contains `TaskItArcade.register(...)`.
- The module calls `window.TaskItArcade.register` exactly once.
- The Title and selected Script File identify the intended game; no ID matching is needed.
- `mount()` clears and rebuilds the frame cleanly.
- `unmount()` removes global listeners and stops all timers/animation loops.
- The game remains usable at mobile width and does not overlap the Arcade shell.
- No broad global CSS selectors are introduced.
- No unrelated app files are changed unless required.
- The game has been tested through its linked title in Admin.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| File does not appear in Script File dropdown | Filename/path does not match scanner rules | Use a `.js` entry below `server/games/public/` containing `TaskItArcade.register(...)`, then click Refresh. |
| Overlay shows placeholder instead of game | Selected script did not register a module for that file path, or the file failed to load | Check browser console, confirm the selected Script File exists, and confirm the module calls `window.TaskItArcade.register(...)`. |
| Game works once but breaks after reopening | State or listeners are not reset | Reset state in `mount()` and clean up in `unmount()`. |
| Keyboard controls fire multiple times | Document listener added repeatedly and not removed | Use a named listener function and remove it in `unmount()`. |
| Timer continues after closing Arcade | Interval or animation loop not cleared | Store interval/frame IDs and clear/cancel them in `unmount()`. |
| Updated game file does not appear to change | Browser/CDN cache | Save the admin game entry again so `updatedAt` changes. The wrapper also appends a launch timestamp so normal opens fetch the selected file fresh. |

> Reference implementations: `/server/games/public/js/game-hangman.js`, `/server/games/public/js/game-wordsearch.js`, `/server/games/public/js/game-whac-a-bug.js`, and `/server/games/public/js/game-code-breaker.js`.

## Deployment and maintenance

Deploy `server/games` alongside `server/dist` and the repository's top-level `public` directory. The TypeScript build does not copy game assets into `dist`; the server resolves them from `server/games/public` in both development and production. Keep the directory structure intact.

All seven bundled games are ordinary selectable entry scripts. The database has no fixed seeded game list. Existing catalogue records and scores remain intact. Old `/js/game-*.js`, `/labyrinth/...`, and `/arcade-game-guide.html` URLs remain compatibility routes; new Admin selections use `/games/`. The service worker handles game HTML and assets generically. Offline play requires the relevant files to have been fetched and cached; account, score, and token APIs need a connection.
