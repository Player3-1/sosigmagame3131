import { SoundEvent } from './types';

class SoundFXManager {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainVal = 0.12
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  public playEvents(events: SoundEvent[], listenerX: number, listenerY: number) {
    if (this.muted || events.length === 0) return;

    for (const ev of events) {
      const dist = Math.hypot(ev.x - listenerX, ev.y - listenerY);
      if (dist > 1100) continue;
      const atten = Math.max(0.2, 1 - dist / 1100);

      switch (ev.type) {
        case 'slash':
          this.tone(360, 110, 0.14, 'sawtooth', 0.1 * atten);
          break;
        case 'hit':
          this.tone(180, 55, 0.2, 'square', 0.14 * atten);
          break;
        case 'dodge':
          this.tone(520, 920, 0.18, 'triangle', 0.12 * atten);
          break;
        case 'heal':
          this.tone(440, 660, 0.25, 'sine', 0.1 * atten);
          break;
        case 'revive':
          this.tone(440, 880, 0.35, 'triangle', 0.14 * atten);
          break;
        case 'trap':
          this.tone(240, 90, 0.22, 'sawtooth', 0.14 * atten);
          break;
        case 'vent':
          this.tone(300, 140, 0.28, 'sine', 0.12 * atten);
          break;
        case 'lock':
          this.tone(620, 420, 0.14, 'square', 0.08 * atten);
          break;
        case 'break':
          this.tone(150, 45, 0.28, 'sawtooth', 0.16 * atten);
          break;
        case 'teleport':
          this.tone(220, 760, 0.24, 'sine', 0.12 * atten);
          break;
        case 'jump':
          this.tone(200, 480, 0.2, 'triangle', 0.11 * atten);
          break;
        case 'knife':
          this.tone(720, 260, 0.14, 'triangle', 0.1 * atten);
          break;
        case 'downed':
          this.tone(280, 95, 0.4, 'sawtooth', 0.15 * atten);
          break;
        case 'turret':
          this.tone(680, 320, 0.09, 'square', 0.07 * atten);
          break;
      }
    }
  }
}

export const soundFX = new SoundFXManager();
