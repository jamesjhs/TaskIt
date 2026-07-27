/**
 * TaskIt! Arcade — Labyrinth
 * Loads the ported Jahosi single-page game in an iframe and bridges only the
 * TaskIt-owned operations: anonymous scores and arcade-token hint purchases.
 */
(function () {
  'use strict';

  const GAME_ID = 'maze';
  const FRAME_SRC = '/labyrinth/labyrinth.html';
  let iframe = null;
  let lastFinalScore = null;
  let submittedScoreKey = '';
  let frameState = 'menu';

  function scoreKey(payload) {
    if (!payload) return '';
    return GAME_ID + ':' +
      Math.max(0, Math.floor(Number(payload.score) || 0)) + ':' +
      (payload.level || '') + ':' +
      (payload.mode || '');
  }

  function frameSrcWithVersion() {
    const appVersion = window.APP_VERSION || window._serverVersion || 'dev';
    return FRAME_SRC + '?v=' + encodeURIComponent(appVersion);
  }

  function sendToFrame(id, ok, payload, error) {
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({
      source: 'taskit-labyrinth-parent',
      id,
      ok,
      payload: payload || null,
      error: error || '',
    }, window.location.origin);
  }

  async function spendTokenForHint() {
    if (typeof api !== 'function') throw new Error('TaskIt API is unavailable');
    const data = await api('POST', '/gamification/arcade/spend-token');
    if (data && typeof data.arcadeTokens === 'number') {
      arcadeTokens = data.arcadeTokens;
      updateArcadeTokenDisplays();
    }
    return { arcadeTokens };
  }

  async function handleFrameRequest(msg) {
    try {
      if (msg.type === 'getScores') {
        const scores = await window.TaskItArcade.getHighScores(GAME_ID);
        sendToFrame(msg.id, true, scores || []);
        return;
      }

      if (msg.type === 'submitScore') {
        const payload = msg.payload || {};
        const score = Math.max(0, Math.floor(Number(payload.score) || 0));
        const saved = await window.TaskItArcade.submitScore({ gameId: GAME_ID, score });
        if (saved) submittedScoreKey = scoreKey(payload);
        sendToFrame(msg.id, true, saved || {});
        return;
      }

      if (msg.type === 'spendHintToken') {
        const result = await spendTokenForHint();
        sendToFrame(msg.id, true, result);
        return;
      }

      sendToFrame(msg.id, false, null, 'Unknown TaskIt Labyrinth request');
    } catch (err) {
      sendToFrame(msg.id, false, null, err && err.message ? err.message : 'TaskIt request failed');
    }
  }

  function onMessage(event) {
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== window.location.origin) return;
    const msg = event.data || {};
    if (!msg || msg.source !== 'taskit-labyrinth') return;

    if (msg.type === 'scoreSubmitted') {
      submittedScoreKey = scoreKey(msg.payload || {});
      return;
    }

    if (msg.type === 'stateChanged') {
      frameState = (msg.payload && msg.payload.state) || 'menu';
      return;
    }

    if (msg.type === 'finalScore') {
      const payload = msg.payload || {};
      const score = Math.max(0, Math.floor(Number(payload.score) || 0));
      lastFinalScore = score > 0
        ? { gameId: GAME_ID, score, level: payload.level, mode: payload.mode }
        : null;
      return;
    }

    if (msg.id) void handleFrameRequest(msg);
  }

  function mount(frame) {
    lastFinalScore = null;
    submittedScoreKey = '';
    frameState = 'menu';
    frame.replaceChildren();

    iframe = document.createElement('iframe');
    iframe.title = 'TaskIt Labyrinth game';
    iframe.src = frameSrcWithVersion();
    iframe.setAttribute('allow', 'fullscreen; pointer-lock');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.style.display = 'block';
    iframe.style.background = '#070b1f';
    iframe.style.overscrollBehavior = 'none';
    iframe.style.touchAction = 'none';

    frame.appendChild(iframe);
    window.addEventListener('message', onMessage);
    return this;
  }

  function unmount() {
    window.removeEventListener('message', onMessage);
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    iframe = null;
  }

  function getHighScore() {
    if (!lastFinalScore || submittedScoreKey === scoreKey(lastFinalScore)) return null;
    return { gameId: GAME_ID, score: lastFinalScore.score };
  }

  async function spendToken() {
    if (!iframe || !iframe.contentWindow) return 'Arcade token spent.';
    await spendTokenForHint();
    iframe.contentWindow.postMessage({
      source: 'taskit-labyrinth-parent',
      type: 'tokenHintGranted',
    }, window.location.origin);
    return 'Extra Labyrinth hint unlocked!';
  }

  function handleBack() {
    if (!iframe || !iframe.contentWindow) return false;
    if (frameState === 'menu') return false;
    iframe.contentWindow.postMessage({
      source: 'taskit-labyrinth-parent',
      type: 'back',
    }, window.location.origin);
    return true;
  }

  window.TaskItArcade.register({
    gameId: GAME_ID,
    mount,
    unmount,
    getHighScore,
    spendToken,
    handleBack,
  });
}());
