import { SoundEvent } from './types';

class SoundFXManager {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.noiseBuffer) {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 1.5);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainVal = 0.12,
    delay = 0
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(gainVal, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noiseBurst(
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number,
    q: number,
    duration: number,
    gainVal: number,
    delay = 0
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const start = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, start);
    filter.frequency.setValueAtTime(Math.max(40, startFreq), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), start + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(gainVal, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(start);
    src.stop(start + duration + 0.02);
  }

  // Visceral flesh impact + arterial blood squirt & splatter
  private playBloodHit(atten: number) {
    // Deep visceral meat thud
    this.tone(115, 34, 0.18, 'triangle', 0.22 * atten, 0);
    // Razor flesh tear
    this.tone(420, 82, 0.1, 'sawtooth', 0.12 * atten, 0);
    // Wet blood squirt (high-Q resonant noise sweep)
    this.noiseBurst('bandpass', 1100, 3400, 4.8, 0.09, 0.24 * atten, 0.01);
    this.noiseBurst('bandpass', 2800, 520, 5.2, 0.22, 0.22 * atten, 0.045);
    // Secondary wet blood droplets splatter
    this.noiseBurst('bandpass', 1900, 720, 6.0, 0.14, 0.13 * atten, 0.14);
  }

  // Terrifying horror execution sting: sub-bass drop + dissonant tritone shriek + crunch
  private playHorrorKill(atten: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    // 1. Massive chest-rattling sub-bass dread drop
    this.tone(92, 22, 1.15, 'sine', 0.34 * atten, 0);
    this.tone(135, 32, 0.85, 'sawtooth', 0.14 * atten, 0);

    // 2. Dissonant horror shriek (minor-second / tritone clash gliding down)
    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, now);
    filter.frequency.exponentialRampToValueAtTime(340, now + 1.05);
    filter.Q.setValueAtTime(3.2, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.18 * atten, now + 0.03);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    filter.connect(masterGain);
    masterGain.connect(ctx.destination);

    const shriekFreqs = [
      [277, 138],
      [392, 196], // tritone clash
      [587, 260],
    ];
    for (const [f0, f1] of shriekFreqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(f1, now + 1.05);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 1.12);
    }

    // 3. Visceral bone crunch & heavy blood spray
    this.noiseBurst('bandpass', 1400, 380, 3.2, 0.28, 0.26 * atten, 0);
    this.noiseBurst('bandpass', 2400, 620, 4.5, 0.35, 0.2 * atten, 0.09);
  }

  // Creepy downed sting: double heartbeat thump + agonizing descending groan
  private playHorrorDowned(atten: number) {
    this.tone(74, 30, 0.18, 'sine', 0.24 * atten, 0);
    this.tone(68, 28, 0.22, 'sine', 0.22 * atten, 0.22);
    this.tone(330, 105, 0.55, 'sawtooth', 0.13 * atten, 0.02);
    this.tone(349, 112, 0.55, 'sawtooth', 0.1 * atten, 0.02); // dissonant minor 2nd
    this.noiseBurst('bandpass', 1300, 450, 3.8, 0.22, 0.14 * atten, 0.02);
  }

  public playEvents(events: SoundEvent[], listenerX: number, listenerY: number) {
    if (this.muted || events.length === 0) return;

    for (const ev of events) {
      const dist = Math.hypot(ev.x - listenerX, ev.y - listenerY);
      if (dist > 1150) continue;
      const atten = Math.max(0.22, 1 - dist / 1150);

      switch (ev.type) {
        case 'slash':
          this.noiseBurst('bandpass', 2600, 520, 2.5, 0.14, 0.16 * atten);
          this.tone(640, 180, 0.11, 'sawtooth', 0.07 * atten);
          break;
        case 'hit':
          this.playBloodHit(atten);
          break;
        case 'kill':
          this.playHorrorKill(atten);
          break;
        case 'downed':
          this.playHorrorDowned(atten);
          break;
        case 'dodge':
          this.tone(420, 860, 0.18, 'triangle', 0.11 * atten);
          break;
        case 'heal':
          this.tone(392, 587, 0.26, 'sine', 0.09 * atten);
          break;
        case 'revive':
          this.tone(330, 660, 0.34, 'triangle', 0.12 * atten);
          break;
        case 'trap':
          this.noiseBurst('highpass', 900, 400, 1.5, 0.12, 0.18 * atten);
          this.tone(1100, 140, 0.18, 'square', 0.12 * atten);
          break;
        case 'vent':
          this.noiseBurst('bandpass', 520, 180, 2.0, 0.26, 0.16 * atten);
          this.tone(190, 75, 0.24, 'triangle', 0.12 * atten);
          break;
        case 'lock':
          this.tone(540, 320, 0.12, 'square', 0.08 * atten);
          this.tone(360, 240, 0.09, 'square', 0.06 * atten, 0.08);
          break;
        case 'break':
          this.noiseBurst('lowpass', 900, 160, 1.2, 0.32, 0.24 * atten);
          this.tone(130, 36, 0.28, 'sawtooth', 0.18 * atten);
          break;
        case 'teleport':
          this.noiseBurst('bandpass', 300, 1600, 3.5, 0.28, 0.15 * atten);
          this.tone(140, 520, 0.26, 'sawtooth', 0.09 * atten);
          break;
        case 'jump':
          this.noiseBurst('lowpass', 800, 250, 1.4, 0.18, 0.12 * atten);
          this.tone(180, 420, 0.18, 'triangle', 0.1 * atten);
          break;
        case 'knife':
          this.noiseBurst('highpass', 1800, 900, 2.2, 0.1, 0.12 * atten);
          this.tone(860, 290, 0.12, 'sawtooth', 0.08 * atten);
          break;
        case 'turret':
          this.tone(720, 280, 0.08, 'square', 0.07 * atten);
          break;
      }
    }
  }

  public setMuted(val: boolean) {
    this.muted = val;
    musicPlayer.setMuted(val);
  }
}

export type MusicTrackId = 'none' | 'menu' | 'lms';

const LOBBY_MUSIC_MUTED_KEY = 'zone51_lobby_music_muted';

class MusicPlayer {
  private desiredTrack: MusicTrackId = 'none';
  private muted = false;
  private lobbyMusicMuted = false;
  private tracks: Record<'menu' | 'lms', HTMLAudioElement | null> = {
    menu: null,
    lms: null,
  };
  private listeners = new Set<(muted: boolean) => void>();
  private lobbyListeners = new Set<(muted: boolean) => void>();
  private unlockRegistered = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.lobbyMusicMuted = window.localStorage.getItem(LOBBY_MUSIC_MUTED_KEY) === '1';
      } catch {
        this.lobbyMusicMuted = false;
      }
    }
  }

  private isTrackBlocked(key: 'menu' | 'lms'): boolean {
    if (this.muted) return true;
    if (key === 'menu' && this.lobbyMusicMuted) return true;
    return false;
  }

  private ensureElements() {
    if (typeof window === 'undefined') return;
    if (!this.tracks.menu) {
      const a = new Audio('/audio/menu_horror.mp3');
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0.28;
      this.tracks.menu = a;
    }
    if (!this.tracks.lms) {
      const a = new Audio('/audio/last_survivor.mp3');
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0.48;
      this.tracks.lms = a;
    }
    if (!this.unlockRegistered) {
      this.unlockRegistered = true;
      const unlock = () => {
        if (this.desiredTrack !== 'none' && !this.isTrackBlocked(this.desiredTrack)) {
          this.syncPlayback();
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  private syncPlayback() {
    this.ensureElements();
    for (const key of ['menu', 'lms'] as const) {
      const el = this.tracks[key];
      if (!el) continue;
      if (!this.isTrackBlocked(key) && this.desiredTrack === key) {
        if (el.paused) {
          el.play().catch(() => {
            // Browser autoplay blocked until user gesture; global unlock will retry
          });
        }
      } else if (!el.paused) {
        el.pause();
        if (this.desiredTrack !== key || (key === 'menu' && this.lobbyMusicMuted)) {
          el.currentTime = 0;
        }
      }
    }
  }

  public setTrack(track: MusicTrackId) {
    if (this.desiredTrack === track) {
      // Ensure playback resumes if previously blocked and now unlocked
      if (track !== 'none' && !this.isTrackBlocked(track)) {
        const el = this.tracks[track];
        if (el && el.paused) this.syncPlayback();
      }
      return;
    }
    this.desiredTrack = track;
    if (track === 'lms' && this.tracks.lms) {
      this.tracks.lms.currentTime = 0;
    }
    this.syncPlayback();
  }

  public setMuted(val: boolean) {
    this.muted = val;
    this.syncPlayback();
    for (const fn of this.listeners) {
      fn(val);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public subscribeMute(fn: (muted: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  public setLobbyMusicMuted(val: boolean) {
    this.lobbyMusicMuted = val;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOBBY_MUSIC_MUTED_KEY, val ? '1' : '0');
      } catch {
        // ignore storage errors
      }
    }
    this.syncPlayback();
    for (const fn of this.lobbyListeners) {
      fn(val);
    }
  }

  public isLobbyMusicMuted(): boolean {
    return this.lobbyMusicMuted;
  }

  public subscribeLobbyMusicMute(fn: (muted: boolean) => void): () => void {
    this.lobbyListeners.add(fn);
    return () => {
      this.lobbyListeners.delete(fn);
    };
  }
}

export const musicPlayer = new MusicPlayer();
export const soundFX = new SoundFXManager();

