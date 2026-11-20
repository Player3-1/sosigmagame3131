import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, LogOut, RotateCcw, Coins, FlaskConical } from 'lucide-react';
import {
  KILLERS,
  PROTECTOR_SHIELD_AMOUNT,
  REVIVE_DURATION_SECONDS,
  SURVIVOR_CLASSES,
  TRAP_ESCAPE_DURATION_SECONDS,
} from '../game/constants';
import { musicPlayer, soundFX } from '../game/audio';
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
  const ventMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [muted, setMuted] = useState(soundFX.muted);
  useEffect(() => musicPlayer.subscribeMute(setMuted), []);
  const [ventPickerOpen, setVentPickerOpen] = useState(false);
  const [hoveredVentId, setHoveredVentId] = useState<string | null>(null);
  const ventPickerOpenRef = useRef(false);
  ventPickerOpenRef.current = ventPickerOpen;
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
    aimX: 0,
    aimY: 0,
  });

  const [survivorChatInput, setSurvivorChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState.survivorChat?.length, chatOpen]);

  // Keyboard & mouse listeners
  useEffect(() => {
    const push = () => {
      const snap: PlayerInput = { ...inputRef.current };
      inputRef.current.attack = false;
      inputRef.current.useQ = false;
      inputRef.current.useE = false;
      inputRef.current.useR = false;
      inputRef.current.useCtrl = false;
      inputRef.current.ventTargetId = undefined;
      inputRef.current.chatTextToSend = undefined;
      onInputChange(snap);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if (e.repeat) return;
      const key = e.key.toLowerCase();

      // Open survivor chat via 't' or '.'
      if (!isKiller && (key === 't' || key === '.' || e.key === '.')) {
        e.preventDefault();
        setChatOpen(true);
        window.setTimeout(() => {
          chatInputRef.current?.focus();
        }, 20);
        return;
      }

      if (ventPickerOpenRef.current) {
        if (e.key === 'Escape') {
          setVentPickerOpen(false);
          return;
        }
        if (/^[1-9]$/.test(key)) {
          const st = stateRef.current;
          const me = st.players.find((p) => p.id === localPlayerId);
          const nearVent = me
            ? st.vents.find((v) => !v.broken && Math.hypot(v.x - me.x, v.y - me.y) <= 84)
            : undefined;
          const dests = nearVent
            ? st.vents.filter((v) => !v.broken && v.id !== nearVent.id)
            : [];
          const chosen = dests[Number(key) - 1];
          if (chosen) {
            inputRef.current.ventTargetId = chosen.id;
            inputRef.current.useQ = true;
            push();
            setVentPickerOpen(false);
            return;
          }
        }
      }

      let changed = true;
      if (key === 'w' || key === 'arrowup') inputRef.current.up = true;
      else if (key === 's' || key === 'arrowdown') inputRef.current.down = true;
      else if (key === 'a' || key === 'arrowleft') inputRef.current.left = true;
      else if (key === 'd' || key === 'arrowright') inputRef.current.right = true;
      else if (e.key === 'Shift') inputRef.current.sprint = true;
      else if (key === 'q') {
        const st = stateRef.current;
        const me = st.players.find((p) => p.id === localPlayerId);
        if (
          me &&
          me.role === 'killer' &&
          me.killerId === 'darkness' &&
          !me.dead &&
          me.cdQ <= 0 &&
          st.phase === 'playing'
        ) {
          const nearVent = st.vents.find(
            (v) => !v.broken && Math.hypot(v.x - me.x, v.y - me.y) <= 84
          );
          const hasOthers = nearVent
            ? st.vents.some((v) => !v.broken && v.id !== nearVent.id)
            : false;
          if (nearVent && hasOthers) {
            setVentPickerOpen((v) => !v);
            return;
          }
        }
        inputRef.current.useQ = true;
      } else if (key === 'e') inputRef.current.useE = true;
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
      inputRef.current.aimX = worldX;
      inputRef.current.aimY = worldY;
      push();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        if (e.target !== canvasRef.current) return;
        setChatOpen(false);
        chatInputRef.current?.blur();
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const st = stateRef.current;
          const me = st.players.find((p) => p.id === localPlayerId);
          if (me) {
            const camX = Math.max(0, Math.min(st.mapWidth - rect.width, me.x - rect.width / 2));
            const camY = Math.max(0, Math.min(st.mapHeight - rect.height, me.y - rect.height / 2));
            const worldX = camX + mx;
            const worldY = camY + my;
            inputRef.current.angle = Math.atan2(worldY - me.y, worldX - me.x);
            inputRef.current.aimX = worldX;
            inputRef.current.aimY = worldY;
          }
        }
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

  // Render Main Canvas
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
  }, [gameState, localPlayerId]);

  const localPlayer =
    gameState.players.find((p) => p.id === localPlayerId) || gameState.players[0];
  const isKiller = localPlayer.role === 'killer';
  const killerSpec = isKiller ? KILLERS[localPlayer.killerId!] : null;
  const survSpec = !isKiller ? SURVIVOR_CLASSES[localPlayer.survivorClass!] : null;
  const fPrompt = getContextualFPrompt(gameState, localPlayer);

  const isDarkness = isKiller && localPlayer.killerId === 'darkness';
  const nearDarknessVent =
    isDarkness && !localPlayer.dead && localPlayer.cdQ <= 0 && gameState.phase === 'playing'
      ? gameState.vents.find(
          (v) => !v.broken && Math.hypot(v.x - localPlayer.x, v.y - localPlayer.y) <= 84
        ) ?? null
      : null;
  const darknessDestVents = nearDarknessVent
    ? gameState.vents.filter((v) => !v.broken && v.id !== nearDarknessVent.id)
    : [];

  useEffect(() => {
    if (ventPickerOpen && (!nearDarknessVent || darknessDestVents.length === 0)) {
      setVentPickerOpen(false);
      setHoveredVentId(null);
    } else if (!ventPickerOpen && hoveredVentId !== null) {
      setHoveredVentId(null);
    }
  }, [ventPickerOpen, nearDarknessVent, darknessDestVents.length, hoveredVentId]);

  // Interactive Tactical Minimap for Darkness Q Vent Teleport
  useEffect(() => {
    if (!ventPickerOpen || !nearDarknessVent || darknessDestVents.length === 0) return;
    const mc = ventMapCanvasRef.current;
    if (!mc) return;
    const mctx = mc.getContext('2d');
    if (!mctx) return;

    const mw = 460;
    const mh = 320;
    const dpr = window.devicePixelRatio || 1;
    if (mc.width !== Math.floor(mw * dpr) || mc.height !== Math.floor(mh * dpr)) {
      mc.width = Math.floor(mw * dpr);
      mc.height = Math.floor(mh * dpr);
    }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    mctx.fillStyle = '#070b14';
    mctx.fillRect(0, 0, mw, mh);

    const sx = mw / gameState.mapWidth;
    const sy = mh / gameState.mapHeight;

    // Walls & Cages
    for (let r = 0; r < gameState.rows; r++) {
      for (let c = 0; c < gameState.cols; c++) {
        const tile = gameState.tiles[r * gameState.cols + c];
        if (tile === 1) {
          mctx.fillStyle = '#293548';
          mctx.fillRect(
            c * gameState.tileSize * sx,
            r * gameState.tileSize * sy,
            Math.ceil(gameState.tileSize * sx),
            Math.ceil(gameState.tileSize * sy)
          );
        } else if (tile === 2) {
          mctx.fillStyle = '#d97706';
          mctx.fillRect(
            c * gameState.tileSize * sx,
            r * gameState.tileSize * sy,
            Math.ceil(gameState.tileSize * sx),
            Math.ceil(gameState.tileSize * sy)
          );
        }
      }
    }

    // Locked doors & barricades
    for (const d of gameState.doors) {
      if (d.broken) continue;
      mctx.fillStyle = d.locked ? '#fbbf24' : 'rgba(148, 163, 184, 0.45)';
      mctx.fillRect(d.x * sx, d.y * sy, Math.max(2, d.w * sx), Math.max(2, d.h * sy));
    }
    for (const b of gameState.barricades) {
      mctx.fillStyle = b.kind === 'wood' ? '#92400e' : '#64748b';
      mctx.fillRect(b.x * sx, b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    }

    // Trajectory line to hovered destination vent
    const hoveredVent = hoveredVentId
      ? darknessDestVents.find((v) => v.id === hoveredVentId) ?? null
      : null;
    if (hoveredVent) {
      mctx.save();
      mctx.strokeStyle = 'rgba(192, 132, 252, 0.8)';
      mctx.lineWidth = 2;
      mctx.setLineDash([6, 4]);
      mctx.beginPath();
      mctx.moveTo(nearDarknessVent.x * sx, nearDarknessVent.y * sy);
      mctx.lineTo(hoveredVent.x * sx, hoveredVent.y * sy);
      mctx.stroke();
      mctx.restore();
    }

    // Alive Survivors & Darkness positions (drawn underneath vent badges so vent targets stay clickable/readable)
    for (const p of gameState.players) {
      if (p.dead) continue;
      const px = p.x * sx;
      const py = p.y * sy;
      if (p.id === localPlayerId) {
        mctx.fillStyle = 'rgba(168, 85, 247, 0.28)';
        mctx.beginPath();
        mctx.arc(px, py, 9, 0, Math.PI * 2);
        mctx.fill();
        mctx.fillStyle = '#c084fc';
        mctx.strokeStyle = '#ffffff';
        mctx.lineWidth = 1.5;
        mctx.beginPath();
        mctx.arc(px, py, 5, 0, Math.PI * 2);
        mctx.fill();
        mctx.stroke();

        mctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
        mctx.textAlign = 'center';
        mctx.fillStyle = '#e9d5ff';
        mctx.fillText('SEN', px, Math.max(11, py - 9));
      } else if (p.role === 'survivor') {
        const dotColor = p.downed ? '#f59e0b' : '#10b981';
        mctx.fillStyle = p.downed ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.24)';
        mctx.beginPath();
        mctx.arc(px, py, 8, 0, Math.PI * 2);
        mctx.fill();

        mctx.fillStyle = dotColor;
        mctx.strokeStyle = p.blessed ? '#fde047' : '#0f172a';
        mctx.lineWidth = p.blessed ? 2 : 1.2;
        mctx.beginPath();
        mctx.arc(px, py, 4.5, 0, Math.PI * 2);
        mctx.fill();
        mctx.stroke();

        mctx.font = '600 9.5px "Plus Jakarta Sans", sans-serif';
        mctx.textAlign = 'center';
        const tag = `${p.name}${p.downed ? ' (Yerde)' : ''}`;
        const tw = mctx.measureText(tag).width;
        const labelY = py + 14 > mh - 4 ? py - 9 : py + 13;
        mctx.fillStyle = 'rgba(7, 11, 20, 0.78)';
        mctx.fillRect(px - tw / 2 - 3, labelY - 8.5, tw + 6, 11);
        mctx.fillStyle = p.downed ? '#fcd34d' : '#a7f3d0';
        mctx.fillText(tag, px, labelY);
      }
    }

    // Broken vents
    for (const v of gameState.vents) {
      if (!v.broken) continue;
      const vx = v.x * sx;
      const vy = v.y * sy;
      mctx.strokeStyle = '#ef4444';
      mctx.lineWidth = 2;
      mctx.beginPath();
      mctx.moveTo(vx - 4, vy - 4);
      mctx.lineTo(vx + 4, vy + 4);
      mctx.moveTo(vx + 4, vy - 4);
      mctx.lineTo(vx - 4, vy + 4);
      mctx.stroke();
    }

    // Current vent node
    {
      const vx = nearDarknessVent.x * sx;
      const vy = nearDarknessVent.y * sy;
      mctx.strokeStyle = '#38bdf8';
      mctx.lineWidth = 2;
      mctx.beginPath();
      mctx.arc(vx, vy, 10, 0, Math.PI * 2);
      mctx.stroke();
    }

    // Selectable destination vents (numbered 1..N)
    darknessDestVents.forEach((v, idx) => {
      const vx = v.x * sx;
      const vy = v.y * sy;
      const isHov = v.id === hoveredVentId;
      const r = isHov ? 11.5 : 9.5;

      if (isHov) {
        mctx.fillStyle = 'rgba(167, 139, 250, 0.28)';
        mctx.beginPath();
        mctx.arc(vx, vy, 16, 0, Math.PI * 2);
        mctx.fill();
      }

      mctx.fillStyle = isHov ? '#7c3aed' : '#1e1b4b';
      mctx.strokeStyle = isHov ? '#e9d5ff' : '#a78bfa';
      mctx.lineWidth = isHov ? 2.4 : 1.8;
      mctx.beginPath();
      mctx.arc(vx, vy, r, 0, Math.PI * 2);
      mctx.fill();
      mctx.stroke();

      mctx.font = '700 10px "JetBrains Mono", monospace';
      mctx.textAlign = 'center';
      mctx.textBaseline = 'middle';
      mctx.fillStyle = '#ffffff';
      mctx.fillText(String(idx + 1), vx, vy + 0.5);

      mctx.textBaseline = 'alphabetic';
      mctx.font = isHov
        ? '700 10px "Plus Jakarta Sans", sans-serif'
        : '600 9px "Plus Jakarta Sans", sans-serif';
      const labelY = vy - 13 < 10 ? vy + 19 : vy - 13;
      const lw = mctx.measureText(v.label).width;
      mctx.fillStyle = isHov ? 'rgba(76, 29, 149, 0.92)' : 'rgba(13, 19, 29, 0.85)';
      mctx.fillRect(vx - lw / 2 - 3, labelY - 8.5, lw + 6, 11);
      mctx.fillStyle = isHov ? '#f5f3ff' : '#cbd5e1';
      mctx.fillText(v.label, vx, labelY);
    });
  }, [ventPickerOpen, gameState, localPlayerId, nearDarknessVent, darknessDestVents, hoveredVentId]);

  const toggleMute = () => {
    soundFX.setMuted(!muted);
  };

  const selectDarknessVent = (ventId: string) => {
    const snap: PlayerInput = {
      ...inputRef.current,
      useQ: true,
      ventTargetId: ventId,
    };
    inputRef.current.useQ = false;
    inputRef.current.ventTargetId = undefined;
    setVentPickerOpen(false);
    onInputChange(snap);
  };

  const triggerAbility = (key: 'Q' | 'E' | 'R' | 'CTRL') => {
    if (key === 'Q' && nearDarknessVent && darknessDestVents.length > 0) {
      setVentPickerOpen((v) => !v);
      return;
    }
    const snap: PlayerInput = {
      ...inputRef.current,
      useQ: key === 'Q',
      useE: key === 'E',
      useR: key === 'R',
      useCtrl: key === 'CTRL',
    };
    onInputChange(snap);
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
                gameState.timeRemaining <= 30 || gameState.lastSurvivorTriggered
                  ? 'text-rose-400'
                  : 'text-white'
              }`}
            >
              {formatClock(gameState.timeRemaining)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {gameState.lastSurvivorTriggered ? (
                <span className="text-rose-400 font-bold tracking-wide animate-pulse">
                  SON HAYATTA KALAN
                </span>
              ) : (
                'Kalan Süre'
              )}
            </div>
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
                        : (s.shieldHp ?? 0) > 0
                        ? `${Math.ceil(s.hp)} +${Math.ceil(s.shieldHp!)}`
                        : `${Math.ceil(s.hp)} Can`}
                      {!s.dead && (s.protectedTimer ?? 0) > 0 ? ' 🛡️' : ''}
                      {!s.dead && s.blessed ? ' ✝️' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {gameState.isTestMode && (
          <div className="pointer-events-auto flex items-center gap-3 bg-amber-950/90 border border-amber-500/70 text-amber-200 text-xs font-semibold px-3.5 py-1.5 rounded-lg backdrop-blur-sm shadow-lg">
            <FlaskConical className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>TEST ALANI · Para Kazanılmaz</span>
            <button
              type="button"
              onClick={onExitToLobby}
              className="px-2.5 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded transition-colors cursor-pointer"
            >
              Testi Bitir
            </button>
          </div>
        )}
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
        {gameState.phase === 'playing' &&
          gameState.lastKillInfo &&
          !gameState.activeExecution &&
          gameState.elapsed - gameState.lastKillInfo.atElapsed < 2.4 && (
            <div
              className="border text-xs font-semibold px-4 py-1.5 rounded-lg backdrop-blur-sm shadow-lg"
              style={{
                backgroundColor: 'rgba(13, 19, 29, 0.9)',
                borderColor: KILLERS[gameState.lastKillInfo.killerId].accentColor,
                color: '#f8fafc',
              }}
            >
              <span style={{ color: KILLERS[gameState.lastKillInfo.killerId].accentColor }}>
                {KILLERS[gameState.lastKillInfo.killerId].name}
              </span>{' '}
              <span className="text-slate-400">·</span>{' '}
              <span>
                {SURVIVOR_CLASSES[gameState.lastKillInfo.victimClass].emoji}{' '}
                {gameState.lastKillInfo.victimName}
              </span>{' '}
              <span className="text-rose-400">katledildi!</span>
            </div>
          )}
      </div>

      {/* 3-Second Downed Execution Letterbox Framing (Clean & Text-Free) */}
      {gameState.phase === 'playing' &&
        gameState.activeExecution &&
        (localPlayerId === gameState.activeExecution.killerPlayerId ||
          localPlayerId === gameState.activeExecution.victimId ||
          gameState.activeExecution.isFinalKill) && (() => {
          const exec = gameState.activeExecution;
          const kSpec = KILLERS[exec.killerId];
          const pct = Math.max(0, Math.min(100, (1 - exec.timer / exec.duration) * 100));
          return (
            <div className="pointer-events-none fixed inset-0 z-40 flex flex-col justify-between">
              <div
                className="w-full h-12 bg-black/85 border-b"
                style={{ borderColor: `${kSpec.accentColor}55` }}
              />
              <div
                className="w-full h-14 bg-black/85 border-t flex items-center justify-center px-6"
                style={{ borderColor: `${kSpec.accentColor}55` }}
              >
                <div className="w-64 max-w-full h-1 bg-slate-800/90 rounded-full overflow-hidden">
                  <div
                    className="h-full"
                    style={{ width: `${pct}%`, backgroundColor: kSpec.accentColor }}
                  />
                </div>
              </div>
            </div>
          );
        })()}

      {/* Top-Right Controls */}
      <div className="fixed top-3 right-3 z-20 flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
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
      </div>

      {/* Contextual F Hold Prompt */}
      {fPrompt && (
        <div className="pointer-events-none fixed bottom-36 inset-x-0 flex justify-center z-20">
          <div className="bg-amber-500/95 text-slate-950 font-display font-bold text-sm px-4 py-2 rounded-lg shadow-lg">
            {fPrompt}
          </div>
        </div>
      )}

      {/* In-Game Survivor Chat (Only Survivors, Killer Cannot See) */}
      {!isKiller && (
        <div className="fixed bottom-3 left-3 z-30 w-72 max-w-[calc(100vw-24px)] pointer-events-auto select-none bg-transparent">
          {/* Transparent floating message log */}
          <div className="max-h-36 overflow-y-auto space-y-1 pr-1 bg-transparent text-xs scrollbar-none">
            {gameState.survivorChat && gameState.survivorChat.length > 0 ? (
              gameState.survivorChat.slice(-25).map((msg) => (
                <div
                  key={msg.id}
                  className="leading-snug bg-transparent text-stone-100"
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.9)' }}
                >
                  <span className="font-bold text-emerald-300 mr-1.5">{msg.senderName}:</span>
                  <span className="break-words text-white">{msg.text}</span>
                </div>
              ))
            ) : null}
            <div ref={chatMessagesEndRef} />
          </div>

          {/* Toggle button / Input form */}
          {chatOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const txt = survivorChatInput.trim();
                if (txt) {
                  onInputChange({ ...inputRef.current, chatTextToSend: txt });
                  setSurvivorChatInput('');
                }
                setChatOpen(false);
                chatInputRef.current?.blur();
              }}
              className="flex items-center gap-1.5 mt-1.5 bg-transparent"
            >
              <input
                ref={chatInputRef}
                type="text"
                maxLength={140}
                value={survivorChatInput}
                onChange={(e) => setSurvivorChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setChatOpen(false);
                    chatInputRef.current?.blur();
                  }
                }}
                placeholder="Telsize yaz... (Enter gönderir, Esc kapatır)"
                className="flex-1 px-2.5 py-1 text-xs bg-black/40 border border-emerald-400/60 rounded text-white placeholder-emerald-300/50 focus:outline-none focus:border-emerald-300 shadow-sm"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
              />
              <button
                type="submit"
                className="px-2.5 py-1 text-[11px] font-bold text-emerald-300 border border-emerald-400/50 rounded bg-black/40 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
              >
                Gönder
              </button>
              <button
                type="button"
                onClick={() => {
                  setChatOpen(false);
                  chatInputRef.current?.blur();
                }}
                className="px-1.5 py-1 text-[11px] text-stone-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setChatOpen(true);
                window.setTimeout(() => chatInputRef.current?.focus(), 20);
              }}
              className="mt-1 text-[11px] font-mono text-emerald-400/70 hover:text-emerald-300 flex items-center gap-1.5 bg-transparent cursor-pointer transition-colors"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.9)' }}
            >
              <span>💬</span>
              <span>[T veya .] Telsiz</span>
            </button>
          )}
        </div>
      )}

      {/* Darkness Q Destination Vent Selector (Interactive Tactical Minimap) */}
      {ventPickerOpen && nearDarknessVent && darknessDestVents.length > 0 && (
        <div className="fixed inset-0 flex items-center justify-center z-30 px-4 pointer-events-none">
          <div className="pointer-events-auto bg-[#0d131d]/95 border border-violet-500/60 rounded-xl p-3.5 shadow-2xl backdrop-blur-md max-w-[500px] w-full space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-sm font-bold text-violet-300">
                  Gölge Venti · Haritadan Hedef Vent Seç
                </div>
                <div className="text-[11px] text-slate-400">
                  Bulunduğun konum: <span className="text-sky-300 font-medium">{nearDarknessVent.label}</span> ·{' '}
                  Haritadan vente tıkla veya 1-{Math.min(9, darknessDestVents.length)} tuşuna bas
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVentPickerOpen(false)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-mono text-slate-300 cursor-pointer"
              >
                ESC
              </button>
            </div>

            {/* Interactive Tactical Minimap */}
            <div className="relative rounded-lg overflow-hidden border border-slate-700/90 bg-[#070b14]">
              <canvas
                ref={ventMapCanvasRef}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mx = ((e.clientX - rect.left) / rect.width) * 460;
                  const my = ((e.clientY - rect.top) / rect.height) * 320;
                  const sx = 460 / gameState.mapWidth;
                  const sy = 320 / gameState.mapHeight;
                  let bestId: string | null = null;
                  let bestD = 22;
                  for (const v of darknessDestVents) {
                    const d = Math.hypot(v.x * sx - mx, v.y * sy - my);
                    if (d < bestD) {
                      bestD = d;
                      bestId = v.id;
                    }
                  }
                  setHoveredVentId(bestId);
                }}
                onMouseLeave={() => setHoveredVentId(null)}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mx = ((e.clientX - rect.left) / rect.width) * 460;
                  const my = ((e.clientY - rect.top) / rect.height) * 320;
                  const sx = 460 / gameState.mapWidth;
                  const sy = 320 / gameState.mapHeight;
                  let bestId: string | null = null;
                  let bestD = 24;
                  for (const v of darknessDestVents) {
                    const d = Math.hypot(v.x * sx - mx, v.y * sy - my);
                    if (d < bestD) {
                      bestD = d;
                      bestId = v.id;
                    }
                  }
                  if (bestId) {
                    selectDarknessVent(bestId);
                  }
                }}
                className={`block w-full h-auto ${hoveredVentId ? 'cursor-pointer' : 'cursor-crosshair'}`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-[#090e17] border-t border-slate-800/90 text-[10px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Hayatta Kalan
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Yerde
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> Sen
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-600 border border-violet-300 inline-block" />{' '}
                  Hedef Vent
                </span>
                <span className="inline-flex items-center gap-1 text-rose-400">
                  ✕ Kırık Vent
                </span>
              </div>
            </div>

            {/* Quick Vent Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {darknessDestVents.map((v, idx) => {
                const distM = Math.round(Math.hypot(v.x - localPlayer.x, v.y - localPlayer.y) / 40);
                const isHov = hoveredVentId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onMouseEnter={() => setHoveredVentId(v.id)}
                    onMouseLeave={() => setHoveredVentId((cur) => (cur === v.id ? null : cur))}
                    onClick={() => selectDarknessVent(v.id)}
                    className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      isHov
                        ? 'bg-violet-950/80 border-violet-400'
                        : 'bg-[#151c2c] hover:bg-violet-950/70 border-slate-700 hover:border-violet-400'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-1.5">
                      {idx < 9 && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-violet-500/20 border border-violet-400/50 font-mono text-[10px] font-bold text-violet-300 shrink-0">
                          {idx + 1}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-white truncate">
                        {v.label}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{distM}m</span>
                  </button>
                );
              })}
            </div>
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
                : ch.type === 'repair_door'
                ? 'Kapı Yeniden İnşa Ediliyor...'
                : ch.type === 'reinforce_door'
                ? 'Kapı Güçlendiriliyor...'
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
                  <span>
                    {localPlayer.downed
                      ? 'Yerde Can (-5/sn)'
                      : (localPlayer.protectedTimer ?? 0) > 0
                      ? `Koruma (${localPlayer.protectedTimer!.toFixed(1)}s)`
                      : 'Can'}
                  </span>
                  <span>
                    {Math.ceil(localPlayer.hp)}
                    {(localPlayer.shieldHp ?? 0) > 0 && (
                      <span className="text-sky-400"> +{Math.ceil(localPlayer.shieldHp!)} Kalkan</span>
                    )}{' '}
                    / {localPlayer.downed ? 100 : localPlayer.maxHp}
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded overflow-hidden flex">
                  <div
                    className={`h-full ${
                      localPlayer.downed
                        ? localPlayer.downVulnerable
                          ? 'bg-rose-500'
                          : 'bg-yellow-400'
                        : (localPlayer.protectedTimer ?? 0) > 0
                        ? 'bg-amber-400'
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
                {(localPlayer.shieldHp ?? 0) > 0 && (
                  <div className="h-1 bg-slate-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-sky-400"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, ((localPlayer.shieldHp ?? 0) / PROTECTOR_SHIELD_AMOUNT) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                )}
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
              const isChaplainQ = !isKiller && localPlayer.survivorClass === 'chaplain' && ab.key === 'Q';
              const isChaplainE = !isKiller && localPlayer.survivorClass === 'chaplain' && ab.key === 'E';
              const chaplainCharges = localPlayer.chaplainQCharges ?? 0;
              const chaplainBlessCount = localPlayer.chaplainBlessCount ?? 0;
              const hasCharge =
                (!isFighterQ || fighterCharges > 0) && (!isChaplainQ || chaplainCharges > 0);
              const ready = cd <= 0 && hasCharge && !localPlayer.downed && !localPlayer.dead;
              const statusText = isFighterQ
                ? cd > 0
                  ? `${Math.ceil(cd)}s (x${fighterCharges})`
                  : fighterCharges > 0
                  ? `Hazır (x${fighterCharges})`
                  : 'E Dodge Gerekli'
                : isChaplainQ
                ? cd > 0
                  ? `${Math.ceil(cd)}s (x${chaplainCharges})`
                  : chaplainCharges > 0
                  ? `Hazır (x${chaplainCharges})`
                  : `Kutsama ${chaplainBlessCount}/3`
                : isChaplainE
                ? cd > 0
                  ? `${Math.ceil(cd)}s (${chaplainBlessCount}/3)`
                  : `Hazır (${chaplainBlessCount}/3)`
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
                        (isFighterQ && fighterCharges === 0 && cd <= 0) ||
                        (isChaplainQ && chaplainCharges === 0 && cd <= 0)
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
            lastVictimName={gameState.lastKillInfo?.victimName}
            lastVictimClass={gameState.lastKillInfo?.victimClass}
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

              {gameState.isTestMode ? (
                <div className="bg-amber-950/35 border border-amber-800/60 rounded-xl px-4 py-3 text-center text-xs text-amber-300">
                  Test Alanı — Bu modda para kazanılmaz.
                </div>
              ) : (
                <div className="bg-[#0b0f17] border border-amber-700/50 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
                      <Coins className="w-4 h-4 text-amber-400" />
                      <span>Kazanılan Para</span>
                    </div>
                    <div className="font-mono text-lg font-extrabold text-amber-400">
                      +{localPlayer.coinsEarned ?? 0} Para
                    </div>
                  </div>
                  {localPlayer.coinBreakdown && localPlayer.coinBreakdown.length > 0 ? (
                    <div className="space-y-1 pt-2 border-t border-slate-800/90 max-h-36 overflow-y-auto pr-1">
                      {localPlayer.coinBreakdown.map((item, idx) => (
                        <div
                          key={`${item.label}_${idx}`}
                          className="flex items-center justify-between text-xs text-slate-300"
                        >
                          <span>
                            {item.label}
                            {item.count > 1 ? ` (x${item.count})` : ''}
                          </span>
                          <span
                            className={`font-mono font-semibold ${
                              item.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {item.amount >= 0 ? `+${item.amount}` : item.amount} Para
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">
                      Bu maçta para kazandıran bir aksiyon gerçekleşmedi.
                    </div>
                  )}
                </div>
              )}

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
