/**
 * Zero-Dependency WebAudio Micro-Acoustics
 *
 * Provides subtle, Linear/macOS-style micro-sounds for the IBPS AI Interview Room.
 * Uses a lazy, shared AudioContext with very soft gain levels (<= 0.05) and gentle ramps.
 * All calls are fully wrapped in try/catch to be SSR-safe and non-throwing under any browser audio policy.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtxClass) return null;

  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtxClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Warm ascending two-note sine chime (440Hz -> 587.33Hz, ~90ms each)
 * Played when candidate connects and enters the boardroom.
 */
export function playJoinChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, now); // A4

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(587.33, now + 0.08); // D5

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.045, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.09);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.22);
  } catch {
    // Fail silently
  }
}

/**
 * Subtle woody/sine double-tick (520Hz -> 660Hz, 60ms)
 * Played when the microphone passes from one panelist seat to the next.
 */
export function playHandoffTick(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.06);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.035, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  } catch {
    // Fail silently
  }
}

/**
 * Crisp upward confirmation pop (480Hz -> 720Hz, 50ms)
 * Played when the candidate presses [Space] or clicks "Done speaking".
 */
export function playDoneSpeakingPop(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.05);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.04, now + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch {
    // Fail silently
  }
}

/**
 * Soft 25ms tick (400Hz when active/unmuted, 300Hz when inactive/muted)
 * Played on toggling mic or camera.
 */
export function playToggleClick(active: boolean): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    const freq = active ? 400 : 300;
    osc.frequency.setValueAtTime(freq, now);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.03, now + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.025);
  } catch {
    // Fail silently
  }
}
