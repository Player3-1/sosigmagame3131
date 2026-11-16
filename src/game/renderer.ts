import {
  DOOR_MAX_LOCK_HITS,
  KILLERS,
  KILLER_HIT_RECOVERY_SECONDS,
  SMILE_DARK_ZONE_RADIUS,
  SMILE_HIT_RECOVERY_SECONDS,
  SURVIVOR_CLASSES,
} from './constants';
import { GameState, PlayerState } from './types';

// Smooth angular phase accumulator for Smile's orbiting spheres so they decelerate cleanly on hit recovery
const smileOrbitState = new Map<string, { lastElapsed: number; phase: number }>();

function getSmileOrbitPhase(id: string, elapsed: number, recovering: boolean): number {
  const prev = smileOrbitState.get(id);
  if (!prev || elapsed < prev.lastElapsed) {
    const init = elapsed * 2.2;
    smileOrbitState.set(id, { lastElapsed: elapsed, phase: init });
    return init;
  }
  const dt = Math.min(0.1, elapsed - prev.lastElapsed);
  const angularSpeed = recovering ? 0.38 : 2.2; // Visibly slows down during 0.9s recovery
  const nextPhase = prev.phase + dt * angularSpeed;
  prev.lastElapsed = elapsed;
  prev.phase = nextPhase;
  return nextPhase;
}

function drawMonsterKiller(
  ctx: CanvasRenderingContext2D,
  k: PlayerState,
  viewerIsKiller: boolean,
  elapsed: number
) {
  const killerId = k.killerId!;
  const spec = KILLERS[killerId];
  const isRecovering = k.hitRecoveryTimer > 0;
  const totalRec =
    killerId === 'smile' ? SMILE_HIT_RECOVERY_SECONDS : KILLER_HIT_RECOVERY_SECONDS;
  const recP = isRecovering ? 1 - Math.min(1, k.hitRecoveryTimer / totalRec) : 0;

  // Juggernaut R invisibility (3s)
  if (k.invisibleTimer > 0 && !viewerIsKiller) {
    return;
  }

  ctx.save();

  // Transparency rules:
  // - Juggernaut R invisible to self = 0.35
  if (k.invisibleTimer > 0 && viewerIsKiller) {
    ctx.globalAlpha = 0.35;
  }

  // Airborne jump scale for Jumper R or multi-hop arc for Jumper E
  const scale =
    k.airborneTimer > 0
      ? 1 + Math.sin((k.airborneTimer / 0.65) * Math.PI) * 0.65
      : k.dashKind === 'jumper_e'
      ? 1 + Math.sin(Math.max(0, Math.min(1, 1 - k.dashTimer / 0.22)) * Math.PI) * 0.28
      : 1;
  ctx.translate(k.x, k.y);
  ctx.scale(scale, scale);

  // Ground shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.beginPath();
  ctx.ellipse(0, 10, k.radius * 1.4, k.radius * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Status auras (Stun / Slow / Frenzy)
  if (k.stunTimer > 0) {
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, k.radius + 14, 0, Math.PI * 2);
    ctx.stroke();
  } else if (k.frenzyTimer > 0) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.24)';
    ctx.beginPath();
    ctx.arc(0, 0, k.radius + 18 + Math.sin(elapsed * 14) * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const speedMag = Math.hypot(k.vx, k.vy);
  const walkCycle = speedMag > 10 ? Math.sin(elapsed * 14) : Math.sin(elapsed * 3) * 0.25;

  ctx.rotate(k.angle);

  if (killerId === 'jumper') {
    // JUMPER: Large biomechanical arachnid-mantis leaper
    // 6 articulated spider/mantis legs
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -1; i <= 1; i++) {
        const legBaseAngle = side * (Math.PI * 0.48 + i * 0.42);
        const swing = walkCycle * 0.28 * (i % 2 === 0 ? 1 : -1) * side;
        const jx = Math.cos(legBaseAngle + swing) * 26;
        const jy = Math.sin(legBaseAngle + swing) * 26;
        const tipX = Math.cos(legBaseAngle + swing * 1.3) * 39;
        const tipY = Math.sin(legBaseAngle + swing * 1.3) * 39;
        ctx.beginPath();
        ctx.moveTo(Math.cos(legBaseAngle) * 12, Math.sin(legBaseAngle) * 12);
        ctx.lineTo(jx, jy);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // Sharp claw tip
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Coiled tail/abdomen
    ctx.fillStyle = '#292524';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-16, 0, 18, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Muscular thorax carapace
    const grad = ctx.createRadialGradient(4, 0, 4, 0, 0, 26);
    grad.addColorStop(0, '#92400e');
    grad.addColorStop(1, '#1c1917');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(6, 0, 22, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Dorsal spines
    ctx.fillStyle = '#f59e0b';
    for (let s = -10; s <= 8; s += 9) {
      ctx.beginPath();
      ctx.moveTo(s, -6);
      ctx.lineTo(s + 5, 0);
      ctx.lineTo(s, 6);
      ctx.closePath();
      ctx.fill();
    }

    // Serrated mandibles
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(22, -9);
    ctx.quadraticCurveTo(34, -12, 33, -3);
    ctx.moveTo(22, 9);
    ctx.quadraticCurveTo(34, 12, 33, 3);
    ctx.stroke();

    // Compound glowing amber eyes (4 eyes)
    ctx.fillStyle = '#fde047';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 10;
    for (const ey of [-7, 7]) {
      ctx.beginPath();
      ctx.arc(20, ey, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(14, ey * 1.45, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Hit recovery: Jumper raises & crosses/wipes front mantis scythe-arms
    if (isRecovering) {
      const wipe = Math.sin(recP * Math.PI * 3);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(16, side * 14);
        ctx.rotate(side * (-0.55 + wipe * 0.45));
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(18, side * 5);
        ctx.lineTo(28, -side * 4);
        ctx.stroke();
        ctx.restore();
      }
      if (Math.abs(wipe) > 0.75) {
        ctx.fillStyle = 'rgba(253, 224, 71, 0.85)';
        ctx.beginPath();
        ctx.arc(34, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (killerId === 'juggernaut') {
    // JUGGERNAUT: Massive horned obsidian/crimson armored colossus
    // Heavy swinging fists (clap together during 0.9s hit recovery!)
    const clapWave = isRecovering ? Math.abs(Math.sin(recP * Math.PI * 2)) : 0;
    for (const side of [-1, 1]) {
      const punchOffset = isRecovering ? 10 + clapWave * 8 : side * walkCycle * 7;
      const lateralOffset = isRecovering ? side * (22 - clapWave * 14) : side * 22;
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(12 + punchOffset, lateralOffset - 8, 22, 16, 5);
      ctx.fill();
      ctx.stroke();

      // Spiked knuckles
      ctx.fillStyle = '#e2e8f0';
      for (let sp = -4; sp <= 4; sp += 4) {
        ctx.beginPath();
        ctx.moveTo(34 + punchOffset, lateralOffset + sp - 2);
        ctx.lineTo(40 + punchOffset, lateralOffset + sp);
        ctx.lineTo(34 + punchOffset, lateralOffset + sp + 2);
        ctx.fill();
      }
    }
    if (isRecovering && clapWave > 0.82) {
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(34, 0, 12 + (clapWave - 0.82) * 35, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Broad jagged shoulder pauldrons
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-14, -30);
    ctx.lineTo(14, -28);
    ctx.lineTo(18, -12);
    ctx.lineTo(-18, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-14, 30);
    ctx.lineTo(14, 28);
    ctx.lineTo(18, 12);
    ctx.lineTo(-18, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Central armored torso
    const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, 26);
    grad.addColorStop(0, '#7f1d1d');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Glowing molten chest core
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(4, 0, 7 + Math.sin(elapsed * 6) * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Horned helm & crimson visor slit
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(10, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Curved bull horns
    ctx.fillStyle = '#e2e8f0';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(8, side * 11);
      ctx.quadraticCurveTo(20, side * 22, 27, side * 14);
      ctx.quadraticCurveTo(17, side * 14, 12, side * 8);
      ctx.fill();
    }

    // Glowing visor slit
    ctx.fillStyle = '#f87171';
    ctx.fillRect(17, -7, 4, 14);
  } else if (killerId === 'smile') {
    // SMILE: Eldritch void shadow-stalker with giant razor grin
    // Orbiting dark tendrils (slow down smoothly during 0.9s hit recovery!)
    const orbitBase = getSmileOrbitPhase(k.id, elapsed, isRecovering);
    for (let t = 0; t < 6; t++) {
      const a = (t / 6) * Math.PI * 2 + orbitBase;
      const dist = (isRecovering ? 22 : 26) + Math.sin(elapsed * (isRecovering ? 1.8 : 5) + t) * 3;
      ctx.fillStyle = isRecovering ? 'rgba(30, 41, 59, 0.78)' : 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = isRecovering ? 'rgba(251, 113, 133, 0.45)' : 'rgba(225, 29, 72, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * dist, Math.sin(a) * dist, isRecovering ? 6 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Shadow cloak core
    const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
    grad.addColorStop(0, '#020617');
    grad.addColorStop(0.75, '#0f172a');
    grad.addColorStop(1, '#881337');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Giant eerie crescent grin facing forward (+X)
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(6, 0, 17, -Math.PI * 0.42, Math.PI * 0.42);
    ctx.stroke();

    // Jagged white teeth along grin
    ctx.fillStyle = '#ffffff';
    for (let ta = -0.35; ta <= 0.35; ta += 0.14) {
      const tx = 6 + Math.cos(ta) * 17;
      const ty = Math.sin(ta) * 17;
      ctx.beginPath();
      ctx.arc(tx, ty, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Piercing hypnotic eyes
    ctx.fillStyle = '#fb7185';
    ctx.shadowColor = '#e11d48';
    ctx.shadowBlur = 12;
    for (const ey of [-8, 8]) {
      ctx.beginPath();
      ctx.ellipse(9, ey, 4.5, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  } else if (killerId === 'hungry') {
    // HUNGRY: Grotesque ravenous butcher beast with giant snapping maw & cleaver
    const isRed = k.frenzyTimer > 0;
    // Giant meat cleaver in right hand (DBD-style blade wipe/reload during 0.9s hit recovery!)
    ctx.save();
    if (isRecovering) {
      const wipeArc = Math.sin(recP * Math.PI);
      ctx.translate(14 + wipeArc * 6, 20 - wipeArc * 16);
      ctx.rotate(-wipeArc * 1.45);
    } else {
      ctx.translate(14, 20);
      ctx.rotate(walkCycle * 0.25);
    }
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-4, -3, 12, 6);
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.lineTo(34, -9);
    ctx.lineTo(34, 8);
    ctx.lineTo(8, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Blood edge on cleaver (wipes clean as recP progresses!)
    ctx.fillStyle = '#dc2626';
    const bloodLen = isRecovering ? Math.max(0, 19 * (1 - recP * 1.15)) : 19;
    if (bloodLen > 0.5) {
      ctx.fillRect(14, 4, bloodLen, 3.5);
    }
    if (isRecovering && recP > 0.25 && recP < 0.85) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10 + recP * 22, -7);
      ctx.lineTo(14 + recP * 22, 7);
      ctx.stroke();
    }
    ctx.restore();

    // Bulky muscular body
    const grad = ctx.createRadialGradient(-2, 0, 6, 0, 0, 27);
    grad.addColorStop(0, isRed ? '#ef4444' : '#991b1b');
    grad.addColorStop(1, isRed ? '#7f1d1d' : '#291515');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isRed ? '#fca5a5' : '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Giant vertical/forward gaping jaws across face/torso
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.ellipse(10, 0, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Razor fangs inside maw
    ctx.fillStyle = '#fef2f2';
    for (let fy = -12; fy <= 12; fy += 6) {
      ctx.beginPath();
      ctx.moveTo(4, fy - 2);
      ctx.lineTo(11, fy);
      ctx.lineTo(4, fy + 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(19, fy - 2);
      ctx.lineTo(13, fy);
      ctx.lineTo(19, fy + 2);
      ctx.fill();
    }

    // Angry glowing eyes
    ctx.fillStyle = isRed ? '#ffffff' : '#fde047';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(6, -12, 3.5, 0, Math.PI * 2);
    ctx.arc(6, 12, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.restore();

  // Killer Nameplate & Stamina bar above monster
  if (k.invisibleTimer <= 0 || viewerIsKiller) {
    ctx.save();
    ctx.font = '700 12px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const label = `${spec.name.toUpperCase()}`;
    const w = ctx.measureText(label).width + 12;
    ctx.fillRect(k.x - w / 2, k.y - k.radius - 30, w, 17);
    ctx.fillStyle = spec.accentColor;
    ctx.fillText(label, k.x, k.y - k.radius - 17);

    // Slim Killer Stamina bar
    const stamW = 42;
    const stamH = 3.5;
    const stamRatio = Math.max(0, Math.min(1, k.stamina / Math.max(1, k.maxStamina)));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(k.x - stamW / 2, k.y - k.radius - 11, stamW, stamH);
    ctx.fillStyle = k.staminaExhausted ? '#f59e0b' : '#38bdf8';
    ctx.fillRect(k.x - stamW / 2, k.y - k.radius - 11, stamW * stamRatio, stamH);
    ctx.restore();
  }
}

function drawSurvivorEmoji(
  ctx: CanvasRenderingContext2D,
  s: PlayerState,
  isLocal: boolean,
  elapsed: number
) {
  if (s.dead) return;
  const spec = SURVIVOR_CLASSES[s.survivorClass!];

  ctx.save();
  ctx.translate(s.x, s.y);

  // Doctor Q healing aura ring
  if (s.healAuraTimer > 0) {
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 210, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Fighter E dodge aura
  if (s.dodgeTimer > 0) {
    ctx.strokeStyle = '#38bdf8';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius + 9 + Math.sin(elapsed * 20) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 6, s.radius, s.radius * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();

  // Base disc & team ring
  ctx.fillStyle = s.downed ? '#451a03' : '#1e293b';
  ctx.strokeStyle = s.downed ? '#f59e0b' : isLocal ? '#38bdf8' : spec.accentColor;
  ctx.lineWidth = isLocal ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, s.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Facing pointer dot
  ctx.fillStyle = isLocal ? '#38bdf8' : '#e2e8f0';
  ctx.beginPath();
  ctx.arc(Math.cos(s.angle) * (s.radius + 3), Math.sin(s.angle) * (s.radius + 3), 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Emoji character! ("Hayatta kalanlar emoji şeklinde")
  ctx.font = s.downed ? '18px "Apple Color Emoji", "Segoe UI Emoji", sans-serif' : '22px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (s.downed) {
    ctx.globalAlpha = 0.75 + Math.sin(elapsed * 8) * 0.2;
  }
  ctx.fillText(spec.emoji, 0, 1);
  ctx.globalAlpha = 1;

  // Smile Q blind cue on blinded survivor
  if (s.blindTimer > 0) {
    ctx.strokeStyle = '#e11d48';
    ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Downed yellow 100-HP circular indicator (red if critical 1 HP)
  if (s.downed) {
    const ratio = Math.max(0, Math.min(1, s.hp / 100));
    ctx.strokeStyle = s.downVulnerable ? '#ef4444' : '#eab308';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius + 6, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
    ctx.stroke();
  }

  // Name & HP bar above survivor
  const barW = 36;
  const barH = 4;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(-barW / 2, -s.radius - 12, barW, barH);
  const maxVal = s.downed ? 100 : s.maxHp;
  const hpRatio = Math.max(0, Math.min(1, s.hp / maxVal));
  ctx.fillStyle = s.downed
    ? s.downVulnerable
      ? '#ef4444'
      : '#eab308'
    : hpRatio > 0.45
    ? '#10b981'
    : '#ef4444';
  ctx.fillRect(-barW / 2, -s.radius - 12, barW * hpRatio, barH);

  ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = isLocal ? '#7dd3fc' : '#cbd5e1';
  ctx.fillText(s.name, 0, -s.radius - 17);

  ctx.restore();
}

export function renderGameCanvas(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  localPlayerId: string,
  width: number,
  height: number
) {
  const localPlayer =
    state.players.find((p) => p.id === localPlayerId) || state.players[0];
  const viewerIsKiller = localPlayer.role === 'killer';

  // Camera centered on local player (or alive teammate if dead)
  let camTarget = localPlayer;
  if (localPlayer.dead) {
    const alive = state.players.find((p) => !p.dead);
    if (alive) camTarget = alive;
  }

  let camX = Math.max(0, Math.min(state.mapWidth - width, camTarget.x - width / 2));
  const camYBase = Math.max(0, Math.min(state.mapHeight - height, camTarget.y - height / 2));
  let camY = camYBase;

  if (state.shakeTimer > 0 && state.shakeIntensity > 0) {
    const mag = state.shakeIntensity * (state.shakeTimer / 0.24);
    camX += (Math.random() - 0.5) * mag * 2;
    camY += (Math.random() - 0.5) * mag * 2;
  }

  // Clear background
  ctx.fillStyle = '#070a10';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(-camX, -camY);

  // 1. Floor grid & zone tinting
  ctx.fillStyle = '#111824';
  ctx.fillRect(0, 0, state.mapWidth, state.mapHeight);

  // Subtle floor grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
  ctx.lineWidth = 1;
  const ts = state.tileSize;
  const startCol = Math.max(0, Math.floor(camX / ts));
  const endCol = Math.min(state.cols, Math.ceil((camX + width) / ts));
  const startRow = Math.max(0, Math.floor(camY / ts));
  const endRow = Math.min(state.rows, Math.ceil((camY + height) / ts));

  for (let c = startCol; c <= endCol; c++) {
    ctx.beginPath();
    ctx.moveTo(c * ts, startRow * ts);
    ctx.lineTo(c * ts, endRow * ts);
    ctx.stroke();
  }
  for (let r = startRow; r <= endRow; r++) {
    ctx.beginPath();
    ctx.moveTo(startCol * ts, r * ts);
    ctx.lineTo(endCol * ts, r * ts);
    ctx.stroke();
  }

  // 2. Room Zone & Cage Floor Labels
  for (const room of state.rooms || []) {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.22)';
    ctx.fillRect(room.x, room.y, room.w, room.h);
    ctx.font = '700 13px "Outfit", sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.textAlign = 'center';
    ctx.fillText(room.name, room.x + room.w / 2, room.y + room.h / 2);
  }

  // Cage Zones (Kafesler) floor hazard marking
  for (const cage of state.cages) {
    ctx.fillStyle = 'rgba(245, 158, 11, 0.05)';
    ctx.fillRect(cage.x, cage.y, cage.w, cage.h);
    ctx.font = '600 11px "Outfit", sans-serif';
    ctx.fillStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.textAlign = 'center';
    ctx.fillText(cage.name.toUpperCase(), cage.x + cage.w / 2, cage.y + cage.h / 2);
  }

  // 2b. Persistent Floor Blood Stains ("yere kan bulaşsın")
  for (const stain of state.bloodStains || []) {
    if (
      stain.x + stain.radius * 2 < camX ||
      stain.x - stain.radius * 2 > camX + width ||
      stain.y + stain.radius * 2 < camY ||
      stain.y - stain.radius * 2 > camY + height
    ) {
      continue;
    }
    ctx.save();
    ctx.translate(stain.x, stain.y);
    ctx.rotate(stain.angle);
    ctx.globalAlpha = stain.alpha;

    // Outer dark dried crimson pool
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.ellipse(0, 0, stain.radius * 1.18, stain.radius * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright fresh blood core
    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.ellipse(stain.radius * 0.12, 0, stain.radius * 0.72, stain.radius * 0.56, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Organic satellite droplets using deterministic seed
    ctx.fillStyle = '#b91c1c';
    for (let d = 0; d < 4; d++) {
      const a = stain.seed + d * 1.55;
      const dist = stain.radius * (0.85 + ((d * 37) % 10) * 0.06);
      const dr = Math.max(2, stain.radius * (0.28 - d * 0.04));
      ctx.beginPath();
      ctx.arc(Math.cos(a) * dist, Math.sin(a) * dist * 0.8, dr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 3. Tiles (Concrete Walls = 1, Iron Cage Bars = 2, Breached Rubble = 3)
  for (let r = startRow; r < endRow; r++) {
    for (let c = startCol; c < endCol; c++) {
      const tile = state.tiles[r * state.cols + c];
      const tx = c * ts;
      const ty = r * ts;

      if (tile === 1) {
        // Concrete bunker wall
        ctx.fillStyle = '#242f42';
        ctx.fillRect(tx, ty, ts, ts);
        ctx.fillStyle = '#334155';
        ctx.fillRect(tx, ty, ts, 6);
        ctx.strokeStyle = '#18202e';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx + 0.5, ty + 0.5, ts - 1, ts - 1);
      } else if (tile === 2) {
        // Iron Cage Bars ("kafesler")
        ctx.fillStyle = '#0f1722';
        ctx.fillRect(tx, ty, ts, ts);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 3;
        for (let b = 6; b < ts; b += 11) {
          ctx.beginPath();
          ctx.moveTo(tx + b, ty + 2);
          ctx.lineTo(tx + b, ty + ts - 2);
          ctx.stroke();
        }
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.strokeRect(tx + 2, ty + 2, ts - 4, ts - 4);
      } else if (tile === 3) {
        // Hungry E breached wall rubble
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(tx + 4, ty + 4, ts - 8, ts - 8);
        ctx.fillStyle = '#44403c';
        ctx.beginPath();
        ctx.arc(tx + 14, ty + 15, 5, 0, Math.PI * 2);
        ctx.arc(tx + 30, ty + 28, 6, 0, Math.PI * 2);
        ctx.arc(tx + 22, ty + 32, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 4. Vents (Ventler)
  for (const vent of state.vents) {
    ctx.save();
    ctx.translate(vent.x, vent.y);
    ctx.fillStyle = vent.broken ? '#291515' : '#1e293b';
    ctx.strokeStyle = vent.broken ? '#ef4444' : '#f59e0b';
    ctx.lineWidth = 2;
    ctx.fillRect(-18, -18, 36, 36);
    ctx.strokeRect(-18, -18, 36, 36);

    ctx.strokeStyle = vent.broken ? '#7f1d1d' : '#64748b';
    ctx.lineWidth = 2;
    for (let y = -11; y <= 11; y += 7) {
      ctx.beginPath();
      ctx.moveTo(-13, y);
      ctx.lineTo(13, y);
      ctx.stroke();
    }
    if (vent.broken) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-12, -12);
      ctx.lineTo(12, 12);
      ctx.moveTo(12, -12);
      ctx.lineTo(-12, 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 5. Doors (Kapılar)
  for (const door of state.doors) {
    ctx.save();
    if (door.broken) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(door.x, door.y, door.w, door.h);
    } else if (door.locked) {
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.fillRect(door.x, door.y, door.w, door.h);
      ctx.strokeRect(door.x, door.y, door.w, door.h);

      // Lock indicator & remaining hits
      const cx = door.x + door.w / 2;
      const cy = door.y + door.h / 2;
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef3c7';
      ctx.fillText(`🔒${DOOR_MAX_LOCK_HITS - door.lockHits}`, cx, cy + 4);
    } else {
      // Unlocked door threshold
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(door.x, door.y, door.w, door.h);
      ctx.strokeRect(door.x, door.y, door.w, door.h);
    }
    ctx.restore();
  }

  // 6. Trapper Traps (INVISIBLE to Killer! Visible to Survivors!)
  if (!viewerIsKiller) {
    for (const trap of state.traps) {
      ctx.save();
      ctx.translate(trap.x, trap.y);
      ctx.strokeStyle = trap.kind === 'snare' ? '#a855f7' : '#c084fc';
      ctx.fillStyle = trap.kind === 'snare' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(192, 132, 252, 0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, trap.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(trap.kind === 'snare' ? '🪤' : '🕸️', 0, 1);
      ctx.restore();
    }
  }

  // 7. Smile E: Black Damage & Slow Aura on Floor around Smile
  for (const p of state.players) {
    if (p.role === 'killer' && !p.dead && p.darkZoneTimer > 0) {
      const darkRadius = SMILE_DARK_ZONE_RADIUS;
      ctx.save();
      ctx.translate(p.x, p.y);
      const darkGrad = ctx.createRadialGradient(0, 0, 18, 0, 0, darkRadius);
      darkGrad.addColorStop(0, 'rgba(2, 6, 23, 0.82)');
      darkGrad.addColorStop(0.75, 'rgba(2, 6, 23, 0.68)');
      darkGrad.addColorStop(1, 'rgba(225, 29, 72, 0.22)');
      ctx.fillStyle = darkGrad;
      ctx.beginPath();
      ctx.arc(0, 0, darkRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(225, 29, 72, 0.65)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = -state.elapsed * 32;
      ctx.beginPath();
      ctx.arc(0, 0, darkRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // 8. Barricades (Wood = Builder Q, Shadow = Smile E)
  for (const bar of state.barricades) {
    ctx.save();
    if (bar.kind === 'wood') {
      ctx.fillStyle = '#7c2d12';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.5;
      ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
      ctx.strokeRect(bar.x, bar.y, bar.w, bar.h);
      // Cross planks
      ctx.beginPath();
      ctx.moveTo(bar.x + 4, bar.y + 4);
      ctx.lineTo(bar.x + bar.w - 4, bar.y + bar.h - 4);
      ctx.moveTo(bar.x + bar.w - 4, bar.y + 4);
      ctx.lineTo(bar.x + 4, bar.y + bar.h - 4);
      ctx.stroke();
      if (bar.breakProgress > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(bar.x, bar.y - 7, bar.w * (bar.breakProgress / 4), 4);
      }
    } else {
      // Smile black barricade
      ctx.fillStyle = '#020617';
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 2.5;
      ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
      ctx.strokeRect(bar.x, bar.y, bar.w, bar.h);
      if (bar.expiresAt !== undefined) {
        const rem = Math.max(0, Math.ceil(bar.expiresAt - state.elapsed));
        ctx.font = '700 11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#fb7185';
        ctx.textAlign = 'center';
        ctx.fillText(`${rem}s`, bar.x + bar.w / 2, bar.y + bar.h / 2 + 4);
      }
    }
    ctx.restore();
  }

  // 9. Builder Turrets
  for (const turret of state.turrets) {
    ctx.save();
    ctx.translate(turret.x, turret.y);
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(turret.angle);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(4, -3.5, 16, 7);
    ctx.restore();
  }

  // 10. AoE, Slash & Blood Splatter Effects
  for (const fx of state.effects) {
    ctx.save();
    const alpha = Math.max(0, fx.ttl / fx.maxTtl);
    ctx.globalAlpha = alpha;
    if (fx.kind === 'blood_splatter') {
      const progress = 1 - alpha;
      const baseAng = fx.angle ?? 0;
      // Central crimson splash ring
      ctx.fillStyle = 'rgba(220, 38, 38, 0.45)';
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, 10 + progress * 16, 0, Math.PI * 2);
      ctx.fill();
      // 9 flying blood droplets spraying outward along hit direction
      for (let i = 0; i < 9; i++) {
        const spread = ((i - 4) / 4) * 1.15 + Math.sin(i * 2.7) * 0.18;
        const speedMult = 0.65 + (i % 3) * 0.25;
        const dist = (8 + progress * fx.radius * speedMult);
        const dx = fx.x + Math.cos(baseAng + spread) * dist;
        const dy = fx.y + Math.sin(baseAng + spread) * dist;
        const dropR = (4.8 - (i % 3) * 1.1) * (0.4 + alpha * 0.6);
        ctx.fillStyle = i % 2 === 0 ? '#ef4444' : '#b91c1c';
        ctx.beginPath();
        ctx.arc(dx, dy, Math.max(1.5, dropR), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (fx.kind === 'slash' || fx.kind === 'fighter_punch' || fx.kind === 'hungry_cleave') {
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = fx.kind === 'hungry_cleave' ? 9 : 6;
      ctx.beginPath();
      const ang = fx.angle ?? 0;
      ctx.arc(fx.x, fx.y, fx.radius * (1.1 - alpha * 0.2), ang - 0.9, ang + 0.9);
      ctx.stroke();
    } else {
      ctx.strokeStyle = fx.color;
      ctx.fillStyle = fx.color + '33';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 11. Projectiles (Turret bolts, Hungry Kitchen Knife, Juggernaut Chain Arm)
  for (const proj of state.projectiles) {
    ctx.save();
    if (proj.kind === 'juggernaut_arm') {
      const owner = state.players.find((pl) => pl.id === proj.ownerId);
      if (owner) {
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 5;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(owner.x, owner.y);
        ctx.lineTo(proj.x, proj.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#dc2626';
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (proj.kind === 'kitchen_knife') {
      const ang = Math.atan2(proj.vy, proj.vx);
      ctx.translate(proj.x, proj.y);
      ctx.rotate(ang);
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(16, 0);
      ctx.lineTo(-8, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-14, -2.5, 7, 5);
    } else {
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 12. Players (Survivors as Emojis, Killers as Detailed Monsters) & Smile R Minions
  for (const p of state.players) {
    if (p.role === 'survivor') {
      drawSurvivorEmoji(ctx, p, p.id === localPlayerId, state.elapsed);
    }
  }

  for (const m of state.smileMinions || []) {
    const mRecovering = (m.hitRecoveryTimer ?? 0) > 0;
    const mRecProgress = mRecovering ? 1 - Math.min(1, (m.hitRecoveryTimer ?? 0) / 1.1) : 0;

    ctx.save();
    ctx.translate(m.x, m.y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 5, m.radius, m.radius * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    // Remaining time ring
    const lifeRatio = Math.max(0, Math.min(1, m.ttl / m.maxTtl));
    ctx.strokeStyle = mRecovering ? 'rgba(148, 163, 184, 0.55)' : 'rgba(244, 63, 94, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, m.radius + 4, -Math.PI / 2, -Math.PI / 2 + lifeRatio * Math.PI * 2);
    ctx.stroke();

    // Hit slowdown recovery ring pulse
    if (mRecovering) {
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.85)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        m.radius + 7,
        -Math.PI / 2,
        -Math.PI / 2 + (1 - mRecProgress) * Math.PI * 2
      );
      ctx.stroke();
    }

    const recoilTilt = mRecovering ? Math.sin(mRecProgress * Math.PI) * -0.28 : 0;
    ctx.rotate(m.angle + recoilTilt);
    const step = mRecovering
      ? Math.sin(state.elapsed * 5) * 1.4
      : Math.sin(state.elapsed * 16) * 3.5;

    // Tiny running feet (visibly slowed during hit recovery)
    ctx.fillStyle = mRecovering ? '#334155' : '#1e293b';
    ctx.beginPath();
    ctx.arc(step, -m.radius + 1, 3.2, 0, Math.PI * 2);
    ctx.arc(-step, m.radius - 1, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Small smiley void body
    ctx.fillStyle = mRecovering ? '#0f172a' : '#020617';
    ctx.strokeStyle = mRecovering ? '#fb7185' : '#e11d48';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, m.radius * (mRecovering ? 0.94 : 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glowing eyes & wide white smile facing +X (squinted/dimmed during slowdown)
    ctx.fillStyle = mRecovering ? '#94a3b8' : '#fb7185';
    ctx.beginPath();
    ctx.arc(4, -4.5, mRecovering ? 1.6 : 2.1, 0, Math.PI * 2);
    ctx.arc(4, 4.5, mRecovering ? 1.6 : 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = mRecovering ? '#cbd5e1' : '#f8fafc';
    ctx.lineWidth = mRecovering ? 1.6 : 2;
    ctx.beginPath();
    ctx.arc(2, 0, 8, -0.55, 0.55);
    ctx.stroke();

    ctx.restore();
  }

  for (const p of state.players) {
    if (p.role === 'killer') {
      drawMonsterKiller(ctx, p, viewerIsKiller, state.elapsed);
    }
  }

  // 13. Active Channel Progress Ring (Revive / Lock / Bandage / Trap Escape / Break Barricade)
  for (const p of state.players) {
    if (!p.dead && p.channel) {
      const ratio = Math.min(1, p.channel.progress / p.channel.duration);
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 11, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 13b. Subtle Aim Reticle & Contextual World Key Hints for Local Player
  if (!localPlayer.dead) {
    ctx.save();
    ctx.strokeStyle = viewerIsKiller ? 'rgba(244, 63, 94, 0.35)' : 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      localPlayer.x,
      localPlayer.y,
      localPlayer.radius + 14,
      localPlayer.angle - 0.35,
      localPlayer.angle + 0.35
    );
    ctx.stroke();
    ctx.restore();

    // Contextual Engineer Hints near Vents & Doors
    if (localPlayer.role === 'survivor' && localPlayer.survivorClass === 'engineer' && !localPlayer.downed) {
      for (const vent of state.vents) {
        if (!vent.broken && Math.hypot(vent.x - localPlayer.x, vent.y - localPlayer.y) <= 84) {
          ctx.save();
          ctx.font = '700 11px "Outfit", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fbbf24';
          ctx.fillText('[Q] Vent Geçişi', vent.x, vent.y - 26);
          ctx.restore();
        }
      }
      for (const door of state.doors) {
        if (
          !door.broken &&
          !door.locked &&
          Math.hypot(door.x + door.w / 2 - localPlayer.x, door.y + door.h / 2 - localPlayer.y) <= 84
        ) {
          ctx.save();
          ctx.font = '700 11px "Outfit", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fbbf24';
          ctx.fillText('[E] Kilitle (3.5s)', door.x + door.w / 2, door.y - 12);
          ctx.restore();
        }
      }
    }
  }

  // 14. Floating Combat/Status Texts
  for (const ft of state.floatingTexts) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, ft.ttl / ft.maxTtl);
    ctx.font = '700 13px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore();

  // 15. Off-Screen Directional Edge Pings (Downed Allies)
  const margin = 44;
  for (const s of state.players) {
    if (s.role !== 'survivor' || s.dead || s.id === localPlayerId) continue;

    const showDowned = !viewerIsKiller && s.downed;
    if (!showDowned) continue;

    const sx = s.x - camX;
    const sy = s.y - camY;
    if (sx >= 24 && sx <= width - 24 && sy >= 24 && sy <= height - 24) continue;

    const ang = Math.atan2(sy - height / 2, sx - width / 2);
    const px = Math.max(margin, Math.min(width - margin, width / 2 + Math.cos(ang) * (width / 2 - margin)));
    const py = Math.max(margin, Math.min(height - margin, height / 2 + Math.sin(ang) * (height / 2 - margin)));

    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = s.downVulnerable ? '#ef4444' : '#eab308';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#090d16';
    ctx.fillText(s.downVulnerable ? '1!' : `${Math.ceil(s.hp)}`, 0, 0);
    ctx.restore();
  }

  // Subtle Horror Vignette overlay
  const vig = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.32,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(3,5,10,0.62)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  // Smile Q: 4s 75% Darkness Blindness on the nearest targeted survivor
  if (localPlayer.blindTimer > 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, height);
  }
}
