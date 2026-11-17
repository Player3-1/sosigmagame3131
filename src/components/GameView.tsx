import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, LogOut, RotateCcw, Map as MapIcon } from 'lucide-react';
import { KILLERS, REVIVE_DURATION_SECONDS, SURVIVOR_CLASSES, TRAP_ESCAPE_DURATION_SECONDS } from '../game/constants';
import { soundFX } from '../game/audio';
import { renderGameCanvas } from '../game/renderer';
import { GameState, PlayerInput, PlayerState } from '../game/types';
import { KillerWinCinematic } from './KillerWinCinematic';

interface GameViewProps {
  gameState: GameState;
  localPlayerId: string;
  onInputChange: (input: PlayerInput) => void;
  onRestartSolo?: () => void;
  onRematchOnline?: () => void;
  onExitToLobby: () => void;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function getContextualFPrompt(state: GameState, p: PlayerState): string | null {
  if (p.dead) return null;
  if (p.role === 'killer') {
    if (p.killerId === 'sawblooder' && p.sawMalfunction) {
      return 'F Tuşuna Basılı Tut (Testereyi Tamir Et · 1sn)';
    }
    if (p.trappedById) return `F Tuşuna Basılı Tut (Tuzaktan Kurtul · ${TRAP_ESCAPE_DURATION_SECONDS}sn)`;
    const nearWood = state.barricades.find(
      (b) => b.kind === 'wood' && Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h / 2 - p.y) < 86
    );
    if (nearWood) return 'F Tuşuna Basılı Tut (Barikatı Kır · 4sn)';
  } else if (!p.downed) {
    const downedAlly = state.players.find(
      (s) =>
        s.role === 'survivor' &&
        s.id !== p.id &&
        !s.dead &&
        s.downed &&
        Math.hypot(s.x - p.x, s.y - p.y) < 72
    );
    if (downedAlly) {
      return `F Tuşuna Basılı Tut (${downedAlly.name} Kurtar · ${REVIVE_DURATION_SECONDS}sn)`;
    }
  }
  return null;
}

export function GameView({
  gameState,
  localPlayerId,
  onInputChange,
  onRestartSolo,
  onRematchOnline,
  onExitToLobby,
}: GameViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const [muted, setMuted] = useState(soundFX.muted);
  const [showMinimap, setShowMinimap] = useState(true);
  const [killerEndStage, setKillerEndStage] = useState<'none' | 'blackout' | 'cinematic' | 'summary'>('none');
  const [blackoutOpaque, setBlackoutOpaque] = useState(false);

  useEffect(() => {
    if (gameState.phase !== 'ended' || gameState.winner !== 'killer') {
      setKillerEndStage('none');
      setBlackoutOpaque(false);
      return;
    }
    setKillerEndStage('blackout');
    setBlackoutOpaque(false);
    const raf = window.requestAnimationFrame(() => {
      setBlackoutOpaque(true);
    });
    const timer = window.setTimeout(() => {
      setKillerEndStage('cinematic');
    }, 850);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [gameState.phase, gameState.winner]);

  const inputRef = useRef<PlayerInput>({
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    angle: 0,
    attack: false,
    attackHeld: false,
    useQ: false,
    useE: false,
    useR: false,
    useCtrl: false,
    holdF: false,
  });

  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  // Keyboard & mouse listeners
  useEffect(() => {
    const push = () => onInputChange({ ...inputRef.current });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      let changed = true;
      if (key === 'w' || key === 'arrowup') inputRef.current.up = true;
      else if (key === 's' || key === 'arrowdown') inputRef.current.down = true;
      else if (key === 'a' || key === 'arrowleft') inputRef.current.left = true;
      else if (key === 'd' || key === 'arrowright') inputRef.current.right = true;
      else if (e.key === 'Shift') inputRef.current.sprint = true;
      else if (key === 'q') inputRef.current.useQ = true;
      else if (key === 'e') inputRef.current.useE = true;
      else if (key === 'r') inputRef.current.useR = true;
      else if (e.key === 'Control') inputRef.current.useCtrl = true;
      else if (key === 'f') inputRef.current.holdF = true;
      else if (e.code === 'Space') {
        e.preventDefault();
        inputRef.current.attack = true;
        inputRef.current.attackHeld = true;
      } else {
        changed = false;
      }
      if (changed) push();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      let changed = true;
      if (key === 'w' || key === 'arrowup') inputRef.current.up = false;
      else if (key === 's' || key === 'arrowdown') inputRef.current.down = false;
      else if (key === 'a' || key === 'arrowleft') inputRef.current.left = false;
      else if (key === 'd' || key === 'arrowright') inputRef.current.right = false;
      else if (e.key === 'Shift') inputRef.current.sprint = false;
      else if (key === 'f') inputRef.current.holdF = false;
      else if (key === 'q') inputRef.current.useQ = false;
      else if (key === 'e') inputRef.current.useE = false;
      else if (key === 'r') inputRef.current.useR = false;
      else if (e.key === 'Control') inputRef.current.useCtrl = false;
      else if (e.code === 'Space') {
        inputRef.current.attack = false;
        inputRef.current.attackHeld = false;
      }
      else changed = false;
      if (changed) push();
    };

    const onMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const st = stateRef.current;
      const me = st.players.find((p) => p.id === localPlayerId);
      if (!me) return;
      const camX = Math.max(0, Math.min(st.mapWidth - rect.width, me.x - rect.width / 2));
      const camY = Math.max(0, Math.min(st.mapHeight - rect.height, me.y - rect.height / 2));
      const worldX = camX + mx;
      const worldY = camY + my;
      inputRef.current.angle = Math.atan2(worldY - me.y, worldX - me.x);
      push();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        inputRef.current.attack = true;
        inputRef.current.attackHeld = true;
        push();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        inputRef.current.attack = false;
        inputRef.current.attackHeld = false;
        push();
      }
    };

    const onBlur = () => {
      inputRef.current.up = false;
      inputRef.current.down = false;
      inputRef.current.left = false;
      inputRef.current.right = false;
      inputRef.current.sprint = false;
      inputRef.current.holdF = false;
      inputRef.current.attack = false;
      inputRef.current.attackHeld = false;
      inputRef.current.useQ = false;
      inputRef.current.useE = false;
      inputRef.current.useR = false;
      inputRef.current.useCtrl = false;
      push();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [localPlayerId, onInputChange]);

  // Render Canvas + Minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderGameCanvas(ctx, gameState, localPlayerId, w, h);

    // Minimap render
    const mm = minimapRef.current;
    if (mm && showMinimap) {
      const mctx = mm.getContext('2d');
      if (mctx) {
        const mw = 196;
        const mh = 138;
        mm.width = mw;
        mm.height = mh;
        mctx.fillStyle = 'rgba(10, 15, 24, 0.92)';
        mctx.fillRect(0, 0, mw, mh);

        const sx = mw / gameState.mapWidth;
        const sy = mh / gameState.mapHeight;

        // Walls & Cages
        for (let r = 0; r < gameState.rows; r++) {
          for (let c = 0; c < gameState.cols; c++) {
            const tile = gameState.tiles[r * gameState.cols + c];
            if (tile === 1) {
              mctx.fillStyle = '#334155';
              mctx.fillRect(
                c * gameState.tileSize * sx,
                r * gameState.tileSize * sy,
                Math.ceil(gameState.tileSize * sx),
                Math.ceil(gameState.tileSize * sy)
              );
            } else if (tile === 2) {
              mctx.fillStyle = '#f59e0b';
              mctx.fillRect(
                c * gameState.tileSize * sx,
                r * gameState.tileSize * sy,
                Math.ceil(gameState.tileSize * sx),
                Math.ceil(gameState.tileSize * sy)
              );
            }
          }
        }

        // Locked doors on minimap
        for (const d of gameState.doors) {
          if (d.broken || !d.locked) continue;
          mctx.fillStyle = '#fbbf24';
          mctx.fillRect(d.x * sx, d.y * sy, Math.max(2, d.w * sx), Math.max(2, d.h * sy));
        }

        // Vents
        for (const v of gameState.vents) {
          mctx.fillStyle = v.broken ? '#ef4444' : '#38bdf8';
          mctx.fillRect(v.x * sx - 2, v.y * sy - 2, 4, 4);
        }

        // Players on minimap
        const me = gameState.players.find((p) => p.id === localPlayerId);
        for (const p of gameState.players) {
          if (p.dead) continue;
          // Hide invisible Juggernaut from survivors on minimap
          if (p.role === 'killer' && p.invisibleTimer > 0 && me?.role !== 'killer') continue;
          mctx.fillStyle =
            p.id === localPlayerId
              ? '#38bdf8'
              : p.role === 'killer'
              ? '#ef4444'
              : p.downed
              ? '#f59e0b'
              : '#10b981';
          mctx.beginPath();
          mctx.arc(p.x * sx, p.y * sy, p.role === 'killer' ? 3.5 : 2.8, 0, Math.PI * 2);
          mctx.fill();
        }
      }
    }
  }, [gameState, localPlayerId, showMinimap]);

  const localPlayer =
    gameState.players.find((p) => p.id === localPlayerId) || gameState.players[0];
  const isKiller = localPlayer.role === 'killer';
  const killerSpec = isKiller ? KILLERS[localPlayer.killerId!] : null;
  const survSpec = !isKiller ? SURVIVOR_CLASSES[localPlayer.survivorClass!] : null;
  const fPrompt = getContextualFPrompt(gameState, localPlayer);

  const toggleMute = () => {
    soundFX.muted = !muted;
    setMuted(!muted);
  };

  const triggerAbility = (key: 'Q' | 'E' | 'R' | 'CTRL') => {
    if (key === 'Q') inputRef.current.useQ = true;
    if (key === 'E') inputRef.current.useE = true;
    if (key === 'R') inputRef.current.useR = true;
    if (key === 'CTRL') inputRef.current.useCtrl = true;
    onInputChange({ ...inputRef.current });
    setTimeout(() => {
      if (key === 'Q') inputRef.current.useQ = false;
      if (key === 'E') inputRef.current.useE = false;
      if (key === 'R') inputRef.current.useR = false;
      if (key === 'CTRL') inputRef.current.useCtrl = false;
      onInputChange({ ...inputRef.current });
    }, 60);
  };

  const abilities = isKiller
    ? killerSpec!.abilities
    : survSpec!.abilities;

  const getCooldown = (key: string) => {
    if (key === 'Q') return localPlayer.cdQ;
    if (key === 'E') return localPlayer.cdE;
    if (key === 'R') return localPlayer.cdR;
    return 0;
  };

  const toggleSurvivors = gameState.players.filter((p) => p.role === 'survivor');
  const aliveSurvivors = toggleSurvivors.filter((p) => !p.dead);
  const allAliveDowned = aliveSurvivors.length > 0 && aliveSurvivors.every((p) => p.downed);
  const killerPlayer = gameState.players.find((p) => p.role === 'killer');
  const blindedTarget = toggleSurvivors.find((p) => !p.dead && p.blindTimer > 0);
  const activeReviver = toggleSurvivors.find(
    (p) => !p.dead && p.channel?.type === 'revive' && p.channel.targetId === localPlayer.id
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070a10] select-none">
      {/* Main 2D Game Canvas */}
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />

      {/* Top-Left Live Match Event Feed */}
      {gameState.eventFeed && gameState.eventFeed.length > 0 && (
        <div className="pointer-events-none fixed top-3 left-3 z-20 space-y-1 max-w-xs">
          {gameState.eventFeed.map((ev) => (
            <div
              key={ev.id}
              className="text-xs font-medium px-2.5 py-1 rounded bg-[#0d131d]/80 backdrop-blur-sm"
              style={{ color: ev.color, opacity: Math.min(1, ev.ttl / 1.2) }}
            >
              {ev.text}
            </div>
          ))}
        </div>
      )}

      {/* Top HUD Bar: Timer + 5-Player Status */}
      <div className="pointer-events-none fixed top-3 inset-x-0 flex flex-col items-center gap-2 z-20 px-4">
        <div className="pointer-events-auto flex items-center gap-5 bg-[#0d131d]/90 border border-slate-700/80 rounded-xl px-5 py-2 backdrop-blur-sm">
          <div className="text-center">
            <div
              className={`font-mono text-2xl font-bold leading-none ${
                gameState.timeRemaining <= 30 ? 'text-rose-400' : 'text-white'
              }`}
            >
              {formatClock(gameState.timeRemaining)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Kalan Süre</div>
          </div>

          <div className="h-7 w-px bg-slate-800" />

          {/* Survivors Roster */}
          <div className="flex items-center gap-3">
            {toggleSurvivors.map((s) => {
              const sp = SURVIVOR_CLASSES[s.survivorClass!];
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-1.5 text-xs ${
                    s.dead ? 'opacity-40 line-through' : ''
                  }`}
                >
                  <span className="text-base">{sp.emoji}</span>
                  <div>
                    <div className="font-medium text-slate-200 max-w-[72px] truncate">
                      {s.name}
                    </div>
                    <div
                      className={`font-mono text-[10px] ${
                        s.downed
                          ? s.downVulnerable
                            ? 'text-rose-400 font-bold'
                            : 'text-yellow-400 font-bold'
                          : 'text-slate-400'
                      }`}
                    >
                      {s.dead
                        ? 'Ölü'
                        : s.downed
                        ? s.downVulnerable
                          ? 'Kritik 1 Can!'
                          : `Yerde ${Math.ceil(s.hp)}`
                        : `${Math.ceil(s.hp)} Can`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {localPlayer.blindTimer > 0 && (
          <div className="bg-black/95 border border-rose-500/70 text-rose-300 font-mono text-xs font-semibold px-3 py-1 rounded-lg backdrop-blur-sm">
            Kör Edildin (%95 Karartı) · {localPlayer.blindTimer.toFixed(1)}s
          </div>
        )}
        {isKiller && blindedTarget && (
          <div className="bg-black/85 border border-rose-500/60 text-rose-300 font-mono text-xs font-semibold px-3 py-1 rounded-lg backdrop-blur-sm">
            {blindedTarget.name} Kör Edildi · {blindedTarget.blindTimer.toFixed(1)}s
          </div>
        )}
      </div>

      {/* Top-Right Controls & Minimap */}
      <div className="fixed top-3 right-3 z-20 flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMinimap((v) => !v)}
            title="Harita"
            className="p-2 bg-[#0d131d]/90 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 cursor-pointer"
          >
            <MapIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toggleMute}
            title={muted ? 'Sesi Aç' : 'Sesi Kapat'}
            className="p-2 bg-[#0d131d]/90 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onExitToLobby}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0d131d]/90 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Çık</span>
          </button>
        </div>

        {showMinimap && (
          <div className="bg-[#0d131d]/90 border border-slate-700/80 rounded-lg p-1.5">
            <canvas ref={minimapRef} className="block rounded" />
          </div>
        )}
      </div>

      {/* Contextual F Hold Prompt */}
      {fPrompt && (
        <div className="pointer-events-none fixed bottom-36 inset-x-0 flex justify-center z-20">
          <div className="bg-amber-500/95 text-slate-950 font-display font-bold text-sm px-4 py-2 rounded-lg shadow-lg">
            {fPrompt}
          </div>
        </div>
      )}

      {/* Channeling Progress Bar (own action OR being revived by teammate) */}
      {(localPlayer.channel || activeReviver?.channel) && (
        <div className="pointer-events-none fixed bottom-48 inset-x-0 flex justify-center z-20">
          {(() => {
            const ch = localPlayer.channel || activeReviver!.channel!;
            const title = localPlayer.channel
              ? ch.type === 'revive'
                ? 'Kurtarılıyor...'
                : ch.type === 'lock_door'
                ? 'Kapı Kilitleniyor...'
                : ch.type === 'bandage'
                ? 'Sargı Sarılıyor...'
                : ch.type === 'escape_trap'
                ? 'Tuzaktan Çıkılıyor...'
                : ch.type === 'repair_saw'
                ? 'Testere Tamir Ediliyor...'
                : 'Barikat Kırılıyor...'
              : `Kurtarılıyorsun (${activeReviver!.name})...`;
            return (
              <div className="w-64 bg-[#0d131d]/95 border border-slate-700 rounded-lg p-2.5 space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-slate-200">
                  <span>{title}</span>
                  <span className="font-mono">
                    {ch.progress.toFixed(1)} / {ch.duration}s
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded overflow-hidden">
                  <div
                    className={`h-full ${localPlayer.channel ? 'bg-sky-400' : 'bg-emerald-400'}`}
                    style={{
                      width: `${Math.max(0, Math.min(100, (ch.progress / ch.duration) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Bottom HUD: Player Stats & Abilities */}
      <div className="fixed bottom-3 inset-x-0 flex justify-center z-20 px-4 pointer-events-none">
        <div className="pointer-events-auto bg-[#0d131d]/92 border border-slate-700/80 rounded-xl px-5 py-3 backdrop-blur-sm flex flex-wrap items-center gap-6 max-w-4xl">
          {/* Identity + HP + Stamina */}
          <div className="min-w-[220px] space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{isKiller ? '👹' : survSpec?.emoji}</span>
                <div>
                  <div className="font-display text-sm font-bold text-white leading-tight">
                    {isKiller ? killerSpec?.name : survSpec?.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isKiller
                      ? localPlayer.hitRecoveryTimer > 0
                        ? `Eşya Yenileniyor · ${localPlayer.hitRecoveryTimer.toFixed(1)}s`
                        : `Katil · Hasar ${killerSpec?.damage}`
                      : localPlayer.downCount > 0
                      ? `Hayatta Kalan · Düşüş ${localPlayer.downCount}/2`
                      : 'Hayatta Kalan'}
                  </div>
                </div>
              </div>
              {localPlayer.downed && (
                <span
                  className={`font-mono text-[11px] font-bold ${
                    localPlayer.downVulnerable || allAliveDowned ? 'text-rose-400' : 'text-yellow-400'
                  }`}
                >
                  {localPlayer.downVulnerable
                    ? 'KRİTİK (-%80 Hız)'
                    : allAliveDowned
                    ? 'YERDE (SAVUNMASIZ!)'
                    : 'YERDE (KORUMALI)'}
                </span>
              )}
              {localPlayer.dead && (
                <span className="font-mono text-xs font-bold text-rose-500">ELENDİN</span>
              )}
            </div>

            {!isKiller && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-300">
                  <span>{localPlayer.downed ? 'Yerde Can (-4/sn)' : 'Can'}</span>
                  <span>
                    {Math.ceil(localPlayer.hp)} / {localPlayer.downed ? 100 : localPlayer.maxHp}
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded overflow-hidden">
                  <div
                    className={`h-full ${
                      localPlayer.downed
                        ? localPlayer.downVulnerable
                          ? 'bg-rose-500'
                          : 'bg-yellow-400'
                        : 'bg-emerald-500'
                    }`}
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          (localPlayer.hp / (localPlayer.downed ? 100 : localPlayer.maxHp)) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-slate-300">
                <span>
                  {localPlayer.staminaExhausted ? 'Stamina (Doluyor...)' : 'Stamina (Shift)'}
                </span>
                <span>
                  {Math.round(localPlayer.stamina)} / {localPlayer.maxStamina}
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                <div
                  className={`h-full ${
                    localPlayer.staminaExhausted ? 'bg-amber-400' : 'bg-sky-400'
                  }`}
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(100, (localPlayer.stamina / localPlayer.maxStamina) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="h-14 w-px bg-slate-800 hidden sm:block" />

          {/* Ability Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {isKiller && (
              <div className="px-3 py-2 bg-[#0b0f17] border border-slate-700 rounded-lg text-center min-w-[84px]">
                <div className="font-mono text-xs font-bold text-rose-400">
                  {localPlayer.killerId === 'sawblooder' ? 'BASILI TUT' : 'SOL TIK'}
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  {localPlayer.killerId === 'sawblooder' && localPlayer.sawMalfunction
                    ? 'Arızalı! (F 1sn)'
                    : localPlayer.killerId === 'sawblooder' && (localPlayer.chainsawStuckTimer ?? 0) > 0
                    ? `Saplandı (${localPlayer.chainsawStuckTimer!.toFixed(1)}s)`
                    : localPlayer.hitRecoveryTimer > 0
                    ? `Hazır (${localPlayer.hitRecoveryTimer.toFixed(1)}s)`
                    : localPlayer.cdAttack > 0
                    ? `${localPlayer.cdAttack.toFixed(1)}s`
                    : localPlayer.killerId === 'sawblooder'
                    ? `Testere (${killerSpec?.damage})`
                    : `Vuruş (${killerSpec?.damage})`}
                </div>
              </div>
            )}

            {abilities.map((ab) => {
              const cd = getCooldown(ab.key);
              const isFighterQ = !isKiller && localPlayer.survivorClass === 'fighter' && ab.key === 'Q';
              const fighterCharges = localPlayer.fighterQCharges ?? 0;
              const hasCharge = !isFighterQ || fighterCharges > 0;
              const ready = cd <= 0 && hasCharge && !localPlayer.downed && !localPlayer.dead;
              const statusText = isFighterQ
                ? cd > 0
                  ? `${Math.ceil(cd)}s (x${fighterCharges})`
                  : fighterCharges > 0
                  ? `Hazır (x${fighterCharges})`
                  : 'E Dodge Gerekli'
                : cd > 0
                ? `${Math.ceil(cd)}s`
                : 'Hazır';
              return (
                <button
                  key={ab.key}
                  type="button"
                  onClick={() => triggerAbility(ab.key)}
                  title={ab.description}
                  className={`px-3 py-2 rounded-lg border text-left min-w-[110px] transition-colors cursor-pointer ${
                    ready
                      ? 'bg-[#151e2e] border-slate-600 hover:border-slate-400'
                      : 'bg-[#0b0f17] border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-amber-400">{ab.key}</span>
                    <span
                      className={`font-mono text-xs ${
                        isFighterQ && fighterCharges === 0 && cd <= 0
                          ? 'text-amber-400/90'
                          : 'text-slate-300'
                      }`}
                    >
                      {statusText}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-200 truncate max-w-[130px] mt-0.5">
                    {ab.name}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 1. Killer Win Sequence: Fade to Black -> Full-Screen Killer Cinematic */}
      {gameState.phase === 'ended' &&
        gameState.winner === 'killer' &&
        killerEndStage === 'blackout' && (
          <div
            className={`fixed inset-0 z-50 bg-black transition-opacity duration-700 pointer-events-none ${
              blackoutOpaque ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

      {gameState.phase === 'ended' &&
        gameState.winner === 'killer' &&
        killerEndStage === 'cinematic' &&
        killerPlayer?.killerId && (
          <KillerWinCinematic
            killerId={killerPlayer.killerId}
            onComplete={() => setKillerEndStage('summary')}
          />
        )}

      {/* 2. Match End Summary Modal ("Lobiye Dön / Tekrar Oyna" shown AFTER killer cinematic finishes) */}
      {gameState.phase === 'ended' &&
        (gameState.winner !== 'killer' || killerEndStage === 'summary') && (
          <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#121926] border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5">
              <div className="space-y-1 text-center">
                <div className="text-xs font-medium text-slate-400">Maç Sonucu</div>
                <h2
                  className={`font-display text-3xl font-extrabold ${
                    gameState.winner === 'survivors' ? 'text-emerald-400' : 'text-rose-500'
                  }`}
                >
                  {gameState.winner === 'survivors'
                    ? 'Hayatta Kalanlar Kazandı!'
                    : 'Katil Kazandı!'}
                </h2>
                <p className="text-sm text-slate-300">{gameState.winReason}</p>
              </div>

              <div className="border-t border-b border-slate-800 py-3 space-y-2">
                {gameState.players.map((p) => {
                  const label =
                    p.role === 'killer'
                      ? KILLERS[p.killerId!].name
                      : `${SURVIVOR_CLASSES[p.survivorClass!].emoji} ${
                          SURVIVOR_CLASSES[p.survivorClass!].name
                        }`;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-xs py-1 text-slate-300"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{p.name}</span>
                        <span className="text-slate-500">·</span>
                        <span>{label}</span>
                      </div>
                      <div className="font-mono text-slate-400">
                        {p.role === 'killer'
                          ? `${Math.round(p.damageDealt)} Hasar`
                          : p.dead
                          ? 'Elendi'
                          : `${Math.ceil(p.hp)} Can · ${p.rescues} Kurtarma`}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-3 flex-wrap">
                {onRestartSolo && (
                  <button
                    type="button"
                    onClick={onRestartSolo}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Tekrar Oyna</span>
                  </button>
                )}
                {onRematchOnline && (
                  <button
                    type="button"
                    onClick={onRematchOnline}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Oda Lobisine Dön</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onExitToLobby}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
                >
                  {onRematchOnline ? 'Odadan Ayrıl' : 'Lobiye Dön'}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
