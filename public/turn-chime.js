(() => {
  'use strict';
  // No uploaded audio files: the browser synthesizes a short two-note turn bell.
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let previousKey = null;
  let initialized = false;
  let lastBellTime = 0;
  function getContext() {
    if (!AudioCtor) return null;
    if (!context) context = new AudioCtor();
    return context;
  }
  async function unlock() {
    try {
      const ctx = getContext();
      if (ctx?.state === 'suspended') await ctx.resume();
    } catch (error) { console.debug('Turn sound unavailable', error); }
  }
  // Audio playback is gated by browser user activation. Room creation, clicking
  // game actions, or any other interaction unlocks it for the current tab.
  document.addEventListener('pointerdown', unlock, { passive:true });
  document.addEventListener('keydown', unlock);
  function bell() {
    const ctx = getContext();
    if (!ctx || ctx.state !== 'running') return false;
    const at = ctx.currentTime + 0.015;
    for (const [i, freq] of [880, 659.25].entries()) {
      const begin = at + i * 0.19;
      const oscillator = ctx.createOscillator();
      const amp = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, begin);
      amp.gain.setValueAtTime(0.0001, begin);
      amp.gain.exponentialRampToValueAtTime(0.075, begin + 0.015);
      amp.gain.exponentialRampToValueAtTime(0.0001, begin + 0.34);
      oscillator.connect(amp);
      amp.connect(ctx.destination);
      oscillator.start(begin);
      oscillator.stop(begin + 0.36);
    }
    return true;
  }
  function render(state) {
    if (!state?.me) return;
    const key = state.stage === 'play'
      ? [state.code, state.roundNo, state.turnId].join(':')
      : [state.code, state.roundNo, 'setup'].join(':');
    const now = Date.now();
    const ownTurn = state.stage === 'play'
      && state.me.role === 'player'
      && state.turnId === state.me.id
      && !state.people?.find(p => p.id === state.me.id)?.finished;
    // Never ring repeatedly on vote/chat updates or reconnects that preserve the turn.
    if (initialized && key !== previousKey && ownTurn && now - lastBellTime > 800) {
      if (bell()) lastBellTime = now;
    }
    // The first state might arrive after reconnect. Avoid a surprise bell on entry.
    initialized = true;
    previousKey = key;
  }
  window.YSTurnChime = { render };
})();