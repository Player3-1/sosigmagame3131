import {
  DOOR_MAX_LOCK_HITS,
  FIGHTER_Q_RADIUS,
  HUNGRY_HIT_RECOVERY_SECONDS,
  JUGGERNAUT_HIT_RECOVERY_SECONDS,
  JUMPER_HIT_RECOVERY_SECONDS,
  KILLERS,
  KILLER_HIT_RECOVERY_SECONDS,
  PROTECTOR_SHIELD_AMOUNT,
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
    killerId === 'jumper'
      ? JUMPER_HIT_RECOVERY_SECONDS
      : killerId === 'juggernaut'
      ? JUGGERNAUT_HIT_RECOVERY_SECONDS
      : killerId === 'smile'
      ? SMILE_HIT_RECOVERY_SECONDS
      : killerId === 'hungry'
      ? HUNGRY_HIT_RECOVERY_SECONDS
      : KILLER_HIT_RECOVERY_SECONDS;
  const recP = isRecovering ? 1 - Math.min(1, k.hitRecoveryTimer / totalRec) : 0;

  // Juggernaut R invisibility (3s)
  if (k.invisibleTimer > 0 && !viewerIsKiller) {
    return;
  }

  ctx.save();

  // Transparency rules:
  // - Juggernaut R invisible to self = 0.35
  // - Darkness E: 5% visible (95% transparent) to survivors, 0.32 to self
  const inDarknessStealth = (k.darknessStealthTimer ?? 0) > 0;
  const inDarknessMode = (k.darknessModeTimer ?? 0) > 0;
  if (k.invisibleTimer > 0 && viewerIsKiller) {
    ctx.globalAlpha = 0.35;
  } else if (inDarknessStealth) {
    ctx.globalAlpha = viewerIsKiller ? 0.32 : 0.05;
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

  // Status auras (Freeze / Stun / Frenzy / Sawblooder R Bloodlust / Darkness Mode)
  if ((k.frozenTimer ?? 0) > 0) {
    const pulse = Math.sin(elapsed * 10) * 2;
    ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
    ctx.beginPath();
    ctx.arc(0, 0, k.radius + 17 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, 0, k.radius + 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, k.radius + 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (k.stunTimer > 0) {
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, k.radius + 14, 0, Math.PI * 2);
    ctx.stroke();
  } else if (inDarknessMode) {
    ctx.fillStyle = 'rgba(124, 58, 237, 0.28)';
    ctx.beginPath();
    ctx.arc(0, 0, k.radius + 19 + Math.sin(elapsed * 16) * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.85)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, k.radius + 14 + Math.cos(elapsed * 14) * 3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (k.frenzyTimer > 0 || (killerId === 'sawblooder' && (k.chainsawFlurryTimer ?? 0) > 0)) {
    ctx.fillStyle = 'rgba(220, 38, 38, 0.28)';
    ctx.beginPath();
    ctx.arc(0, 0, k.radius + 18 + Math.sin(elapsed * 14) * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, k.radius + 14 + Math.cos(elapsed * 12) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  const speedMag = Math.hypot(k.vx, k.vy);
  const walkCycle = speedMag > 10 ? Math.sin(elapsed * 14) : Math.sin(elapsed * 3) * 0.25;

  ctx.rotate(k.angle);

  if (killerId === 'jumper') {
    // JUMPER: Nightmarish skeletal bone-arachnid stalker with bloodied scythes
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -1; i <= 1; i++) {
        const legBaseAngle = side * (Math.PI * 0.48 + i * 0.44);
        const swing = walkCycle * 0.3 * (i % 2 === 0 ? 1 : -1) * side;
        const jx = Math.cos(legBaseAngle + swing) * 26;
        const jy = Math.sin(legBaseAngle + swing) * 26;
        const tipX = Math.cos(legBaseAngle + swing * 1.35) * 42;
        const tipY = Math.sin(legBaseAngle + swing * 1.35) * 42;
        ctx.strokeStyle = '#292524';
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(legBaseAngle) * 12, Math.sin(legBaseAngle) * 12);
        ctx.lineTo(jx, jy);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // Bone-barbed inner joint & bloody talon tip
        ctx.strokeStyle = '#d6d3d1';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(jx, jy);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Venomous segmented abdomen with dorsal rib spikes
    ctx.fillStyle = '#09090b';
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(-16, 0, 18, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Thorax carapace with skull-like bone plates
    const grad = ctx.createRadialGradient(4, 0, 4, 0, 0, 26);
    grad.addColorStop(0, '#450a0a');
    grad.addColorStop(0.7, '#1c1917');
    grad.addColorStop(1, '#09090b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(6, 0, 22, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Jagged skeletal dorsal spines
    ctx.fillStyle = '#e7e5e4';
    for (let s = -12; s <= 8; s += 8) {
      ctx.beginPath();
      ctx.moveTo(s, -6);
      ctx.lineTo(s + 6, 0);
      ctx.lineTo(s, 6);
      ctx.closePath();
      ctx.fill();
    }

    // Blood-soaked razor mandibles
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(21, -10);
    ctx.quadraticCurveTo(36, -13, 35, -3);
    ctx.moveTo(21, 10);
    ctx.quadraticCurveTo(36, 13, 35, 3);
    ctx.stroke();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(28, -9);
    ctx.lineTo(35, -3);
    ctx.moveTo(28, 9);
    ctx.lineTo(35, 3);
    ctx.stroke();

    // 6 sunken glowing crimson-amber spider eyes
    ctx.fillStyle = '#000000';
    for (const ey of [-7, 7]) {
      ctx.beginPath();
      ctx.arc(19, ey, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#dc2626';
    ctx.shadowBlur = 12;
    for (const ey of [-7, 7]) {
      ctx.beginPath();
      ctx.arc(20, ey, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(14, ey * 1.45, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(11, ey * 0.7, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (isRecovering) {
      const wipe = Math.sin(recP * Math.PI * 3);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(16, side * 14);
        ctx.rotate(side * (-0.55 + wipe * 0.45));
        ctx.strokeStyle = '#e7e5e4';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(18, side * 5);
        ctx.lineTo(29, -side * 4);
        ctx.stroke();
        ctx.restore();
      }
    }
  } else if (killerId === 'juggernaut') {
    // JUGGERNAUT: Cursed rusted-iron executioner colossus bound in chains & glowing gore
    const clapWave = isRecovering ? Math.abs(Math.sin(recP * Math.PI * 2)) : 0;
    for (const side of [-1, 1]) {
      const punchOffset = isRecovering
        ? 10 + clapWave * 8
        : side * walkCycle * 7;
      const lateralOffset = isRecovering
        ? side * (22 - clapWave * 14)
        : side * 22;
      ctx.fillStyle = '#1c1917';
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.roundRect(12 + punchOffset, lateralOffset - 8, 22, 16, 4);
      ctx.fill();
      ctx.stroke();

      // Gore-stained iron spikes on gauntlets
      ctx.fillStyle = '#cbd5e1';
      for (let sp = -4; sp <= 4; sp += 4) {
        ctx.beginPath();
        ctx.moveTo(34 + punchOffset, lateralOffset + sp - 2.5);
        ctx.lineTo(42 + punchOffset, lateralOffset + sp);
        ctx.lineTo(34 + punchOffset, lateralOffset + sp + 2.5);
        ctx.fill();
      }
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.arc(31 + punchOffset, lateralOffset, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (isRecovering && clapWave > 0.82) {
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(34, 0, 12 + (clapWave - 0.82) * 35, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Jagged skull-spiked pauldrons
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-14, side * 31);
      ctx.lineTo(15, side * 29);
      ctx.lineTo(18, side * 12);
      ctx.lineTo(-18, side * 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Cracked dark-iron torso oozing molten blood glow
    const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, 26);
    grad.addColorStop(0, '#450a0a');
    grad.addColorStop(1, '#09090b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#57534e';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Jagged crimson chest fissure & iron chains
    ctx.strokeStyle = '#ef4444';
    ctx.shadowColor = '#dc2626';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(4, -2);
    ctx.lineTo(-3, 7);
    ctx.lineTo(9, 12);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Iron torture-cage helm & broken asymmetric bull horns
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(10, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#d6d3d1';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(8, side * 11);
      ctx.quadraticCurveTo(21, side * 23, 28, side * 14);
      ctx.quadraticCurveTo(17, side * 14, 12, side * 8);
      ctx.fill();
    }

    // Burning hellfire eye slit behind cage bars
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.fillRect(17, -7, 4, 5);
    ctx.fillRect(17, 2, 4, 5);
    ctx.shadowBlur = 0;
  } else if (killerId === 'smile') {
    // SMILE: Nightmare eldritch shadow demon with torn razor-fanged grin
    const orbitBase = getSmileOrbitPhase(k.id, elapsed, isRecovering);
    for (let t = 0; t < 6; t++) {
      const a = (t / 6) * Math.PI * 2 + orbitBase;
      const dist = (isRecovering ? 22 : 27) + Math.sin(elapsed * (isRecovering ? 1.8 : 5.5) + t) * 3.5;
      ctx.fillStyle = isRecovering ? 'rgba(15, 23, 42, 0.8)' : 'rgba(2, 6, 23, 0.96)';
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * dist, Math.sin(a) * dist, isRecovering ? 5.5 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Pitch-black void core with blood-crimson rim
    const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
    grad.addColorStop(0, '#000000');
    grad.addColorStop(0.72, '#09090b');
    grad.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Torn-wide bloody mouth cavity
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.arc(6, 0, 17, -Math.PI * 0.48, Math.PI * 0.48);
    ctx.stroke();

    // Razor-sharp triangular fangs along the grin
    ctx.fillStyle = '#f8fafc';
    for (let ta = -0.4; ta <= 0.4; ta += 0.13) {
      const tx = 6 + Math.cos(ta) * 16.5;
      const ty = Math.sin(ta) * 16.5;
      ctx.beginPath();
      ctx.moveTo(tx - 1.8, ty - 1.8);
      ctx.lineTo(tx + 3.2, ty);
      ctx.lineTo(tx - 1.8, ty + 1.8);
      ctx.closePath();
      ctx.fill();
    }

    // Hollow sunken pitch-black eyes with piercing glowing crimson pinpoint pupils
    ctx.fillStyle = '#000000';
    for (const ey of [-8.5, 8.5]) {
      ctx.beginPath();
      ctx.ellipse(8, ey, 5.5, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff2a55';
    ctx.shadowColor = '#e11d48';
    ctx.shadowBlur = 14;
    for (const ey of [-8.5, 8.5]) {
      ctx.beginPath();
      ctx.arc(10, ey, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  } else if (killerId === 'hungry') {
    // HUNGRY: Grotesque stitched flesh-abomination butcher with gaping bloody jaws
    const isRed = k.frenzyTimer > 0;
    ctx.save();
    if (isRecovering) {
      const wipeArc = Math.sin(recP * Math.PI);
      ctx.translate(14 + wipeArc * 6, 20 - wipeArc * 16);
      ctx.rotate(-wipeArc * 1.45);
    } else {
      ctx.translate(14, 20);
      ctx.rotate(walkCycle * 0.25);
    }
    ctx.fillStyle = '#451a03';
    ctx.fillRect(-4, -3, 12, 6);
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.lineTo(35, -10);
    ctx.lineTo(35, 9);
    ctx.lineTo(8, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b91c1c';
    const bloodLen = isRecovering ? Math.max(0, 21 * (1 - recP * 1.15)) : 21;
    if (bloodLen > 0.5) {
      ctx.fillRect(13, 4, bloodLen, 4.2);
    }
    ctx.restore();

    // Bloated scarred flesh body
    const grad = ctx.createRadialGradient(-2, 0, 6, 0, 0, 27);
    grad.addColorStop(0, isRed ? '#dc2626' : '#7f1d1d');
    grad.addColorStop(1, isRed ? '#450a0a' : '#18181b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isRed ? '#f87171' : '#991b1b';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Flesh stitches across back
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -10);
    ctx.lineTo(-6, 10);
    ctx.stroke();
    for (let st = -6; st <= 6; st += 6) {
      ctx.beginPath();
      ctx.moveTo(-13, st);
      ctx.lineTo(-7, st);
      ctx.stroke();
    }

    // Giant torn vertical maw lined with bloody fangs
    ctx.fillStyle = '#050505';
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(10, 0, 13, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fef2f2';
    for (let fy = -13; fy <= 13; fy += 5.5) {
      ctx.beginPath();
      ctx.moveTo(3, fy - 2.2);
      ctx.lineTo(11, fy);
      ctx.lineTo(3, fy + 2.2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(20, fy - 2.2);
      ctx.lineTo(13, fy);
      ctx.lineTo(20, fy + 2.2);
      ctx.fill();
    }

    // Sunken feverish eyes
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(6, -13, 4.5, 0, Math.PI * 2);
    ctx.arc(6, 13, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isRed ? '#ffffff' : '#f87171';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(7, -13, 2.5, 0, Math.PI * 2);
    ctx.arc(7, 13, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (killerId === 'sawblooder') {
    // SAWBLOODER: Nightmarish leather-masked chainsaw butcher with roaring saw
    const stuckT = k.chainsawStuckTimer ?? 0;
    const isStuck = stuckT > 0;
    const stuckP = isStuck ? Math.max(0, Math.min(1, 1 - stuckT / 2.0)) : 0;
    const isBroken = Boolean(k.sawMalfunction);
    const isCharging = !isBroken && !isStuck && ((k.chainsawChargeTimer ?? 0) > 0 || k.dashKind === 'sawblooder_q');
    const isFlurrying = (k.chainsawFlurryTimer ?? 0) > 0;
    const isRevving = !isBroken && !isStuck && Boolean(k.sawRevving);
    const activeSaw = isCharging || isRevving;
    const sawVibe = activeSaw ? Math.sin(elapsed * 58) * 2.1 : isFlurrying ? Math.sin(elapsed * 32) * 1.1 : 0;

    // Pull-back body offset during 2s stuck-in-wall chainsaw extraction
    let bodyPullX = 0;
    let sawOffsetX = 14;
    let sawOffsetY = walkCycle * 2.2;
    let sawTilt = 0;
    if (isStuck) {
      if (stuckP < 0.45) {
        const t = stuckP / 0.45;
        bodyPullX = -t * 7 + Math.sin(elapsed * 46) * 1.4;
        sawOffsetX = 24 + Math.sin(elapsed * 46) * 0.8;
        sawOffsetY = Math.sin(elapsed * 38) * 1.2;
        sawTilt = Math.sin(elapsed * 30) * 0.05;
      } else if (stuckP < 0.88) {
        const t = (stuckP - 0.45) / 0.43;
        bodyPullX = -7 - t * 4 + Math.sin(elapsed * 52) * 1.2;
        sawOffsetX = 24 - t * 12;
        sawOffsetY = -t * 2;
        sawTilt = -t * 0.16;
      } else {
        const t = (stuckP - 0.88) / 0.12;
        bodyPullX = -11 * (1 - t);
        sawOffsetX = 12 + t * 2;
        sawOffsetY = -2 * (1 - t);
        sawTilt = -0.16 * (1 - t);
      }
    }

    // Wall/obstacle impact crack & sparks ahead while blade is jammed
    if (isStuck && stuckP < 0.88) {
      const embedX = sawOffsetX + 46;
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(embedX, 0);
      ctx.lineTo(embedX + 10, -8);
      ctx.moveTo(embedX, 0);
      ctx.lineTo(embedX + 12, 0);
      ctx.moveTo(embedX, 0);
      ctx.lineTo(embedX + 10, 8);
      ctx.stroke();

      ctx.fillStyle = '#fde047';
      for (let s = 0; s < 5; s++) {
        const spAngle = (Math.random() - 0.5) * 1.8 + Math.PI;
        const spDist = 4 + Math.random() * 14;
        ctx.fillRect(embedX + Math.cos(spAngle) * spDist, Math.sin(spAngle) * spDist, 2.3, 2.3);
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(bodyPullX, 0);

    // Blood-soaked torso & tattered butcher apron
    const bodyGrad = ctx.createRadialGradient(-3, 0, 5, 0, 0, 25);
    bodyGrad.addColorStop(0, isFlurrying ? '#7f1d1d' : '#450a0a');
    bodyGrad.addColorStop(1, '#09090b');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Heavy gore-drenched apron
    ctx.fillStyle = '#1c100d';
    ctx.beginPath();
    ctx.roundRect(-8, -14, 18, 28, 4);
    ctx.fill();
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.arc(2, -6, 6, 0, Math.PI * 2);
    ctx.arc(5, 5, 7.5, 0, Math.PI * 2);
    ctx.arc(-3, 4, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Stitched leather skin-mask head
    ctx.fillStyle = '#291a14';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(3, 0, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Scarred mask stitches & sunken blood-red eyes
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(8, -4.5, 4, 0, Math.PI * 2);
    ctx.arc(8, 4.5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#dc2626';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(9.5, -4.5, 2.2, 0, Math.PI * 2);
    ctx.arc(9.5, 4.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Gripping bloodied forearms (stretched when tugging stuck chainsaw)
    const armReach = isStuck ? 15 - bodyPullX * 0.4 : 10;
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.ellipse(armReach, -13, isStuck ? 11 : 9, 5, 0.25, 0, Math.PI * 2);
    ctx.ellipse(armReach, 13, isStuck ? 11 : 9, 5, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // --- THE ROARING CHAINSAW ---
    ctx.save();
    if (isStuck) {
      ctx.translate(sawOffsetX, sawOffsetY);
      ctx.rotate(sawTilt);
    } else if (isRecovering) {
      const wipeArc = Math.sin(recP * Math.PI);
      ctx.translate(14 + wipeArc * 8, 2 - wipeArc * 14);
      ctx.rotate(-wipeArc * 1.2);
    } else if (activeSaw) {
      ctx.translate(21 + sawVibe, sawVibe * 0.6);
    } else {
      ctx.translate(14, walkCycle * 2.2);
    }

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = isBroken ? '#f59e0b' : '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-4, -8, 16, 16, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isBroken ? '#78350f' : '#b45309';
    ctx.fillRect(0, -6, 3, 12);
    ctx.fillRect(6, -6, 3, 12);

    ctx.fillStyle = '#64748b';
    ctx.fillRect(-6, -4, 4, 3);
    if (activeSaw) {
      ctx.fillStyle = 'rgba(251, 146, 60, 0.85)';
      ctx.beginPath();
      ctx.arc(-8 + Math.random() * -6, -4 + (Math.random() - 0.5) * 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Malfunction smoke & erratic short-circuit sparks around motor
    if (isBroken) {
      for (let m = 0; m < 3; m++) {
        const smokePhase = (elapsed * 2.6 + m * 0.33) % 1;
        ctx.fillStyle = `rgba(100, 116, 139, ${(1 - smokePhase) * 0.55})`;
        ctx.beginPath();
        ctx.arc(
          2 - smokePhase * 12 + Math.sin(elapsed * 5 + m) * 3,
          -4 - smokePhase * 14,
          3.5 + smokePhase * 4.5,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      if (Math.sin(elapsed * 28) > 0.25) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(2 + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 12, 2.5, 2.5);
      }
    }

    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(12, -5);
    ctx.lineTo(45, -3.5);
    ctx.arc(45, 0, 3.5, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(12, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#991b1b';
    ctx.fillRect(19, -3.5, 25, 7);

    // Chainsaw teeth (spins rapidly ONLY when revving/charging; halted when broken or jammed)
    ctx.fillStyle = activeSaw ? '#fef08a' : isBroken ? '#64748b' : '#94a3b8';
    const teethOffset = isBroken || isStuck ? 0 : (elapsed * (activeSaw ? 56 : 8)) % 6;
    for (let tx = 14 + teethOffset; tx < 47; tx += 6) {
      ctx.fillRect(tx, -6.8, 2.5, 2.4);
      ctx.fillRect(tx, 4.4, 2.5, 2.4);
    }

    if (activeSaw) {
      ctx.fillStyle = '#fde047';
      for (let s = 0; s < 4; s++) {
        const sx = 24 + Math.random() * 22;
        const sy = (Math.random() - 0.5) * 18;
        ctx.fillRect(sx, sy, 2.2, 2.2);
      }
    }

    ctx.restore();
  } else if (killerId === 'darkness') {
    // DARKNESS: Hooded void shadow reaper wielding a bloodied crescent scythe
    const darkAura = (k.darknessModeTimer ?? 0) > 0 || k.dashKind === 'darkness_e';

    // Swirling shadow wisps trailing behind cloak
    for (let w = 0; w < 5; w++) {
      const wa = Math.PI + (w - 2) * 0.42 + Math.sin(elapsed * 6 + w) * 0.2;
      const wr = 20 + Math.sin(elapsed * 7 + w * 1.3) * 4;
      ctx.fillStyle = darkAura ? 'rgba(139, 92, 246, 0.45)' : 'rgba(15, 23, 42, 0.72)';
      ctx.beginPath();
      ctx.arc(Math.cos(wa) * wr, Math.sin(wa) * wr, 7 - w * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cloak body
    const bodyGrad = ctx.createRadialGradient(-2, 0, 4, 0, 0, 25);
    bodyGrad.addColorStop(0, darkAura ? '#4c1d95' : '#1e1b4b');
    bodyGrad.addColorStop(0.65, '#09090b');
    bodyGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(-2, 0, 24, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = darkAura ? '#a78bfa' : '#7c3aed';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Tattered reaper shoulder mantle
    ctx.fillStyle = '#09090b';
    ctx.strokeStyle = '#5b21b6';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-14, -18);
    ctx.quadraticCurveTo(4, -22, 12, -11);
    ctx.lineTo(12, 11);
    ctx.quadraticCurveTo(4, 22, -14, 18);
    ctx.quadraticCurveTo(-22, 0, -14, -18);
    ctx.fill();
    ctx.stroke();

    // Deep hooded visage & glowing violet-crimson eyes
    ctx.fillStyle = '#020205';
    ctx.strokeStyle = darkAura ? '#c4b5fd' : '#6d28d9';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(5, 0, 12, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = darkAura ? '#e9d5ff' : '#c084fc';
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(9, -4.5, 2.3, 0, Math.PI * 2);
    ctx.arc(9, 4.5, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // --- REAPER SCYTHE (TIRPAN) + 0.9s RELOAD WIPE ANIMATION ---
    ctx.save();
    if (isRecovering) {
      // 0.9s reload motion: pull scythe across & twist to wipe blood off the crescent blade
      const wipeArc = Math.sin(recP * Math.PI);
      ctx.translate(10 + wipeArc * 6, 15 - wipeArc * 22);
      ctx.rotate(-0.2 - wipeArc * 1.55);
    } else {
      ctx.translate(10, 16 + walkCycle * 2.2);
      ctx.rotate(walkCycle * 0.14);
    }

    // Long scythe handle
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, 4);
    ctx.lineTo(30, -4);
    ctx.stroke();

    // Violet arcane collar joint
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.arc(28, -4, 3.6, 0, Math.PI * 2);
    ctx.fill();

    // Large curved crescent reaper blade
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = darkAura ? '#ddd6fe' : '#a78bfa';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(28, -4);
    ctx.quadraticCurveTo(38, -26, 14, -36);
    ctx.quadraticCurveTo(28, -22, 22, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Blood along crescent blade edge that wipes off during 0.9s reload
    const scytheBloodAlpha = isRecovering ? Math.max(0, 1 - recP * 1.25) : 0.85;
    if (scytheBloodAlpha > 0.04) {
      ctx.strokeStyle = `rgba(220, 38, 38, ${scytheBloodAlpha})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(27, -14);
      ctx.quadraticCurveTo(31, -24, 17, -33);
      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.restore();

  // Killer Nameplate & Stamina bar above monster (hidden during Juggernaut invisibility & Darkness 95% stealth)
  if ((k.invisibleTimer <= 0 && !inDarknessStealth) || viewerIsKiller) {
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
    const stamW = 46;
    const stamH = 4;
    const stamRatio = Math.max(0, Math.min(1, k.stamina / Math.max(1, k.maxStamina)));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(k.x - stamW / 2 - 1, k.y - k.radius - 12, stamW + 2, stamH + 2);
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

  // Fighter Q ready strike-area indicator (matches FIGHTER_Q_RADIUS)
  if (
    isLocal &&
    s.survivorClass === 'fighter' &&
    !s.downed &&
    !s.dead &&
    (s.fighterQCharges ?? 0) > 0 &&
    s.cdQ <= 0
  ) {
    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.06)';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, FIGHTER_Q_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
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

  // Protector Q shield bubble
  if ((s.shieldHp ?? 0) > 0) {
    ctx.strokeStyle = '#38bdf8';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius + 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Chaplain Q yellow blessing outline (+2 HP/s + absorbs 1 killer strike)
  if (s.blessed && !s.dead) {
    const pulse = Math.sin(elapsed * 8) * 1.4;
    ctx.save();
    ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius + 9 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Protector E 3s invulnerability golden aura
  if ((s.protectedTimer ?? 0) > 0) {
    const pulse = Math.sin(elapsed * 14) * 2.2;
    ctx.strokeStyle = '#facc15';
    ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius + 11 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Protector's held golden wing staff
  if (s.survivorClass === 'protector' && !s.downed) {
    ctx.save();
    ctx.rotate(s.angle);
    // Staff shaft held diagonally forward on right side
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(4, 11);
    ctx.lineTo(24, 5);
    ctx.stroke();
    // Golden wing-tip & glowing orb
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(25, 4.5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Chaplain's held silver pocket knife when a knife charge is ready
  if (s.survivorClass === 'chaplain' && (s.chaplainKnifeCharges ?? 0) > 0 && !s.downed) {
    ctx.save();
    ctx.rotate(s.angle);
    // Dark handle
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, 10);
    ctx.lineTo(15, 7);
    ctx.stroke();
    // Silver blade tip
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(15, 7);
    ctx.lineTo(25, 3);
    ctx.stroke();
    ctx.restore();
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

  // Name, HP, Shield & Stamina bar above survivor
  const barW = 38;
  const barH = 4;
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(-barW / 2 - 1, -s.radius - 15, barW + 2, barH + 1);
  const maxVal = s.downed ? 100 : s.maxHp;
  const hpRatio = Math.max(0, Math.min(1, s.hp / maxVal));
  ctx.fillStyle = s.downed
    ? s.downVulnerable
      ? '#ef4444'
      : '#eab308'
    : hpRatio > 0.45
    ? '#10b981'
    : '#ef4444';
  ctx.fillRect(-barW / 2, -s.radius - 14, barW * hpRatio, barH);

  // Slim Survivor Stamina bar directly beneath HP bar
  const stamH = 3;
  const stamRatio = Math.max(0, Math.min(1, s.stamina / Math.max(1, s.maxStamina)));
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(-barW / 2 - 1, -s.radius - 9, barW + 2, stamH + 1);
  ctx.fillStyle = s.staminaExhausted ? '#f59e0b' : '#38bdf8';
  ctx.fillRect(-barW / 2, -s.radius - 9, barW * stamRatio, stamH);

  // Decaying cyan shield bar right above HP bar
  if ((s.shieldHp ?? 0) > 0) {
    const shieldRatio = Math.max(0, Math.min(1, (s.shieldHp ?? 0) / PROTECTOR_SHIELD_AMOUNT));
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(-barW / 2 - 1, -s.radius - 20, barW + 2, 4);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-barW / 2, -s.radius - 19, barW * shieldRatio, 3);
  }

  ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  const isGoldLabel = (s.protectedTimer ?? 0) > 0 || Boolean(s.blessed);
  ctx.fillStyle = isGoldLabel ? '#fde047' : isLocal ? '#7dd3fc' : '#cbd5e1';
  const namePrefix = (s.protectedTimer ?? 0) > 0 ? '🛡️ ' : s.blessed ? '✝️ ' : '';
  ctx.fillText(
    `${namePrefix}${s.name}`,
    0,
    -s.radius - ((s.shieldHp ?? 0) > 0 ? 24 : 19)
  );

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

  // 4. Vents
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
      const maxHits = door.maxLockHits ?? DOOR_MAX_LOCK_HITS;
      const isReinforced = maxHits >= 10;
      const isCustom = Boolean(door.isCustom);
      ctx.fillStyle = isReinforced ? '#1e293b' : isCustom ? '#7c2d12' : '#78350f';
      ctx.strokeStyle = isReinforced ? '#38bdf8' : isCustom ? '#fb923c' : '#f59e0b';
      ctx.lineWidth = isReinforced ? 3 : 2.5;
      ctx.fillRect(door.x, door.y, door.w, door.h);
      ctx.strokeRect(door.x, door.y, door.w, door.h);

      // Lock indicator & remaining hits
      const cx = door.x + door.w / 2;
      const cy = door.y + door.h / 2;
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isReinforced ? '#e0f2fe' : '#fef3c7';
      ctx.fillText(`🔒${Math.max(0, maxHits - door.lockHits)}`, cx, cy + 4);
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

  // 6. Traps & Smile Mines
  // - Trapper/Bomber traps: INVISIBLE to Killer, visible to Survivors
  // - Smile E Mines ('smile_mine'): ONLY visible to Trapper class (and Killer who placed them); hidden from all other survivors!
  const viewerIsTrapper = !viewerIsKiller && localPlayer.survivorClass === 'trapper';
  for (const trap of state.traps) {
    if (trap.kind === 'smile_mine') {
      if (!viewerIsKiller && !viewerIsTrapper) continue;
      ctx.save();
      ctx.translate(trap.x, trap.y);
      const pulse = 0.72 + Math.sin(state.elapsed * 6) * 0.25;
      ctx.fillStyle = `rgba(225, 29, 72, ${(0.22 * pulse).toFixed(3)})`;
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, trap.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    if (viewerIsKiller) continue;
    ctx.save();
    ctx.translate(trap.x, trap.y);
    ctx.strokeStyle =
      trap.kind === 'snare' ? '#a855f7' : trap.kind === 'bomb' ? '#ea580c' : '#c084fc';
    ctx.fillStyle =
      trap.kind === 'snare'
        ? 'rgba(168, 85, 247, 0.2)'
        : trap.kind === 'bomb'
        ? 'rgba(234, 88, 12, 0.22)'
        : 'rgba(192, 132, 252, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, trap.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(trap.kind === 'snare' ? '🪤' : trap.kind === 'bomb' ? '💣' : '🕸️', 0, 1);
    ctx.restore();
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
    } else if (fx.kind === 'fighter_punch') {
      const progress = 1 - alpha;
      // Full strike area fill & crisp outer perimeter
      ctx.fillStyle = `rgba(239, 68, 68, ${(0.28 * alpha).toFixed(3)})`;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Expanding inner shockwave ring
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 4 * alpha + 1;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius * (0.35 + progress * 0.65), 0, Math.PI * 2);
      ctx.stroke();

      // Forward punch arc aligned to the outer perimeter (only when directional angle is given)
      if (fx.angle !== undefined) {
        ctx.strokeStyle = '#fef2f2';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.radius * 0.96, fx.angle - 0.85, fx.angle + 0.85);
        ctx.stroke();
      }
    } else if (fx.kind === 'protector_beam') {
      const tx = fx.targetX ?? fx.x;
      const ty = fx.targetY ?? fx.y;
      ctx.fillStyle = fx.color + '44';
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(tx, ty, fx.radius * (1.15 - alpha * 0.35), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (fx.kind === 'slash' || fx.kind === 'hungry_cleave') {
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = fx.kind === 'hungry_cleave' ? 9 : 6;
      ctx.beginPath();
      const ang = fx.angle ?? 0;
      ctx.arc(fx.x, fx.y, fx.radius * (1.1 - alpha * 0.2), ang - 0.9, ang + 0.9);
      ctx.stroke();
    } else if (fx.kind === 'killer_kill') {
      const progress = 1 - alpha; // 0 -> 1 over 1.85s
      const kId = fx.killerId ?? 'juggernaut';
      const ang = fx.angle ?? 0;
      const r = fx.radius;

      // Dark expanding arterial blood pool beneath impact point
      const poolGrow = Math.min(1, progress * 3.2);
      const poolFade = progress > 0.65 ? Math.max(0, 1 - (progress - 0.65) / 0.35) : 1;
      ctx.fillStyle = `rgba(90, 10, 14, ${(0.55 * poolFade).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(fx.x, fx.y, 18 + poolGrow * 28, 12 + poolGrow * 20, ang, 0, Math.PI * 2);
      ctx.fill();

      // Victim silhouette / badge reacting to finishing blow in first 0.55s
      if (fx.victimEmoji && progress < 0.62) {
        const vp = progress / 0.62;
        const vAlpha = Math.max(0, 1 - vp * vp);
        ctx.save();
        ctx.globalAlpha = vAlpha;
        let vx = fx.x;
        let vy = fx.y;
        let vScaleX = 1;
        let vScaleY = 1;
        let vRot = 0;
        if (kId === 'juggernaut') {
          // Crushed flat into crater
          vScaleX = 1 + Math.min(0.45, vp * 0.7);
          vScaleY = Math.max(0.28, 1 - vp * 0.85);
        } else if (kId === 'smile') {
          // Trembling & dragged down into black abyss
          vx += Math.sin(vp * 42) * 3;
          const shrink = Math.max(0.15, 1 - vp * 0.9);
          vScaleX = shrink;
          vScaleY = shrink;
        } else if (kId === 'hungry' || kId === 'sawblooder') {
          // Knocked back violently along strike angle
          vx += Math.cos(ang) * vp * 22;
          vy += Math.sin(ang) * vp * 22;
          vRot = vp * 0.8;
        } else if (kId === 'jumper') {
          // Shredded in place
          vx += Math.sin(vp * 50) * 4;
          vRot = Math.sin(vp * 28) * 0.35;
        } else {
          // Darkness: collapses as soul separates
          vScaleX = 1 - vp * 0.25;
          vScaleY = 1 - vp * 0.25;
        }
        ctx.translate(vx, vy);
        ctx.rotate(vRot);
        ctx.scale(vScaleX, vScaleY);
        ctx.fillStyle = '#7f1d1d';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = '18px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fx.victimEmoji, 0, 1);
        ctx.restore();
      }

      if (kId === 'jumper') {
        // JUMPER: Predatory spider pounce -> 3 rapid diagonal razor claw rips + arterial droplets + snapped silk threads
        const slashes = [
          { start: 0.0, dir: ang + 0.45, off: -10 },
          { start: 0.12, dir: ang - 0.52, off: 0 },
          { start: 0.24, dir: ang + 0.38, off: 10 },
        ];
        for (const sl of slashes) {
          if (progress >= sl.start) {
            const sp = Math.min(1, (progress - sl.start) / 0.25);
            const fade = Math.max(0, 1 - (progress - sl.start) / 0.72);
            if (fade > 0.02) {
              ctx.save();
              ctx.globalAlpha = fade;
              ctx.translate(fx.x, fx.y);
              ctx.rotate(sl.dir);
              for (let claw = -1; claw <= 1; claw++) {
                const len = r * 0.76 * Math.min(1, sp * 1.4);
                const yOff = claw * 10 + sl.off * 0.4;
                ctx.strokeStyle = 'rgba(153, 27, 27, 0.9)';
                ctx.lineWidth = 7.5 * fade + 1.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(-len * 0.45, yOff);
                ctx.lineTo(len * 0.85, yOff);
                ctx.stroke();

                ctx.strokeStyle = '#fef08a';
                ctx.lineWidth = 2.4 * fade + 0.6;
                ctx.beginPath();
                ctx.moveTo(-len * 0.45, yOff);
                ctx.lineTo(len * 0.85, yOff);
                ctx.stroke();
              }
              ctx.restore();
            }
          }
        }
        // Dark spiderweb threads snapping outward + realistic blood droplets with gravity
        for (let t = 0; t < 8; t++) {
          const ta = (t / 8) * Math.PI * 2 + 0.2;
          const dist = r * (0.25 + progress * 0.62);
          ctx.strokeStyle = `rgba(214, 211, 209, ${(0.36 * alpha).toFixed(3)})`;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(fx.x + Math.cos(ta) * 14, fx.y + Math.sin(ta) * 14);
          ctx.lineTo(fx.x + Math.cos(ta + 0.15) * dist, fx.y + Math.sin(ta + 0.15) * dist);
          ctx.stroke();
        }
        for (let d = 0; d < 18; d++) {
          const da = ang + ((d - 8.5) / 9) * 1.5 + (d % 3) * 0.18;
          const speed = 0.38 + (d % 5) * 0.16;
          const dist = progress * r * speed;
          const px = fx.x + Math.cos(da) * dist;
          const py = fx.y + Math.sin(da) * dist + progress * progress * 24;
          ctx.fillStyle = d % 4 === 0 ? '#fbbf24' : '#dc2626';
          ctx.globalAlpha = Math.max(0, alpha * 0.95);
          ctx.beginPath();
          ctx.arc(px, py, 2.2 + (d % 3) * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kId === 'juggernaut') {
        // JUGGERNAUT: Tectonic crater fissures + flying stone/concrete chunks + crimson shockwaves
        const craterP = Math.min(1, progress * 3.5);
        // Dark depressed crater center
        ctx.fillStyle = `rgba(15, 23, 42, ${(0.72 * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 24 * craterP, 0, Math.PI * 2);
        ctx.fill();

        // Twin expanding pressure shockwaves
        for (let ring = 0; ring < 3; ring++) {
          const rp = Math.max(0, Math.min(1, (progress - ring * 0.08) / 0.65));
          if (rp > 0 && rp < 1) {
            ctx.strokeStyle =
              ring === 0
                ? `rgba(252, 165, 165, ${(1 - rp).toFixed(3)})`
                : `rgba(220, 38, 38, ${((1 - rp) * 0.85).toFixed(3)})`;
            ctx.lineWidth = (7.5 - ring * 2) * (1 - rp);
            ctx.beginPath();
            ctx.arc(fx.x, fx.y, 18 + rp * r * 0.95, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        // Jagged concrete fracture cracks
        ctx.lineCap = 'round';
        for (let c = 0; c < 11; c++) {
          const ca = (c / 11) * Math.PI * 2 + 0.14;
          const len = r * (0.45 + (c % 3) * 0.18) * craterP;
          ctx.strokeStyle = `rgba(15, 23, 42, ${(0.9 * alpha).toFixed(3)})`;
          ctx.lineWidth = 4.2 * alpha + 1;
          ctx.beginPath();
          ctx.moveTo(fx.x, fx.y);
          ctx.lineTo(fx.x + Math.cos(ca + 0.12) * len * 0.48, fx.y + Math.sin(ca + 0.12) * len * 0.48);
          ctx.lineTo(fx.x + Math.cos(ca - 0.08) * len, fx.y + Math.sin(ca - 0.08) * len);
          ctx.stroke();

          ctx.strokeStyle = `rgba(220, 38, 38, ${(0.75 * alpha).toFixed(3)})`;
          ctx.lineWidth = 1.6 * alpha + 0.5;
          ctx.beginPath();
          ctx.moveTo(fx.x, fx.y);
          ctx.lineTo(fx.x + Math.cos(ca + 0.12) * len * 0.48, fx.y + Math.sin(ca + 0.12) * len * 0.48);
          ctx.lineTo(fx.x + Math.cos(ca - 0.08) * len, fx.y + Math.sin(ca - 0.08) * len);
          ctx.stroke();
        }
        // Flying concrete rubble & blood droplets
        for (let d = 0; d < 16; d++) {
          const da = (d / 16) * Math.PI * 2 + 0.3;
          const flight = Math.min(1, progress * 1.35);
          const dist = flight * r * (0.35 + (d % 4) * 0.18);
          const lift = Math.sin(flight * Math.PI) * (18 + (d % 3) * 8);
          const px = fx.x + Math.cos(da) * dist;
          const py = fx.y + Math.sin(da) * dist - lift;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(flight * 4 + d);
          ctx.globalAlpha = Math.max(0, alpha);
          if (d % 3 === 0) {
            ctx.fillStyle = '#475569';
            ctx.fillRect(-3.5, -2.5, 7, 5);
          } else {
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      } else if (kId === 'smile') {
        // SMILE: Abyssal shadow pit opening + writhing shadow tendrils + snapping fanged jaws
        const openP = progress < 0.4 ? progress / 0.4 : 1;
        const closeP = progress > 0.58 ? (progress - 0.58) / 0.42 : 0;
        const pitR = r * 0.44 * openP * (1 - closeP * 0.72);
        if (pitR > 2) {
          ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
          ctx.strokeStyle = `rgba(225, 29, 72, ${(0.8 * alpha).toFixed(3)})`;
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, pitR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        // Writhing dark crimson-tipped tendrils coiling inward
        for (let t = 0; t < 8; t++) {
          const ta = (t / 8) * Math.PI * 2 + progress * 2.4;
          const reach = r * (0.28 + Math.sin(progress * Math.PI) * 0.45);
          ctx.strokeStyle = `rgba(15, 23, 42, ${(0.88 * alpha).toFixed(3)})`;
          ctx.lineWidth = 4.5 * alpha + 1;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(fx.x, fx.y);
          ctx.quadraticCurveTo(
            fx.x + Math.cos(ta + 0.4) * reach * 0.55,
            fx.y + Math.sin(ta + 0.4) * reach * 0.55,
            fx.x + Math.cos(ta) * reach,
            fx.y + Math.sin(ta) * reach
          );
          ctx.stroke();

          ctx.fillStyle = `rgba(225, 29, 72, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(fx.x + Math.cos(ta) * reach, fx.y + Math.sin(ta) * reach, 3 * alpha + 1, 0, Math.PI * 2);
          ctx.fill();
        }
        // Clamping jagged white teeth + glowing crimson eyes inside the abyss
        if (progress > 0.18 && progress < 0.78) {
          const biteP = Math.min(1, (progress - 0.18) / 0.35);
          const jawGap = Math.max(0, (1 - biteP) * 16);
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - Math.max(0, progress - 0.55) / 0.23);
          ctx.fillStyle = '#f8fafc';
          for (let tooth = -3; tooth <= 3; tooth++) {
            const tx = fx.x + tooth * 7.5;
            ctx.beginPath();
            ctx.moveTo(tx - 3, fx.y - jawGap - 6);
            ctx.lineTo(tx, fx.y - jawGap + 4);
            ctx.lineTo(tx + 3, fx.y - jawGap - 6);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(tx - 3, fx.y + jawGap + 6);
            ctx.lineTo(tx, fx.y + jawGap - 4);
            ctx.lineTo(tx + 3, fx.y + jawGap + 6);
            ctx.fill();
          }
          ctx.fillStyle = '#fb7185';
          ctx.beginPath();
          ctx.arc(fx.x - 10, fx.y - 14, 3.2, 0, Math.PI * 2);
          ctx.arc(fx.x + 10, fx.y - 14, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (kId === 'hungry') {
        // HUNGRY: Heavy meat-cleaver sweep with steel gleam + directional arterial spray cone + bone chips
        const sweepP = Math.min(1, progress * 3.1);
        const arcStart = ang - 1.55;
        const arcEnd = arcStart + sweepP * 3.1;
        // Deep floor cleave scar
        ctx.strokeStyle = `rgba(69, 10, 10, ${(0.75 * alpha).toFixed(3)})`;
        ctx.lineWidth = 10 * alpha + 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r * 0.56, arcStart, arcEnd);
        ctx.stroke();
        // Crimson blood sweep + razor-sharp steel edge trail
        ctx.strokeStyle = `rgba(220, 38, 38, ${(0.92 * alpha).toFixed(3)})`;
        ctx.lineWidth = 14 * alpha + 2;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r * 0.78, arcStart, arcEnd);
        ctx.stroke();
        ctx.strokeStyle = `rgba(248, 250, 252, ${(0.9 * alpha).toFixed(3)})`;
        ctx.lineWidth = 3.5 * alpha + 0.8;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r * 0.82, Math.max(arcStart, arcEnd - 1.3), arcEnd);
        ctx.stroke();

        // High-pressure arterial blood cone + bone splinters along hit angle
        for (let b = 0; b < 22; b++) {
          const spread = ((b - 10.5) / 11) * 0.85 + Math.sin(b * 2.1) * 0.14;
          const ba = ang + spread;
          const speed = 0.42 + (b % 5) * 0.17;
          const dist = Math.min(1, progress * 1.45) * r * speed;
          const px = fx.x + Math.cos(ba) * dist;
          const py = fx.y + Math.sin(ba) * dist + progress * progress * 20;
          ctx.globalAlpha = Math.max(0, alpha);
          if (b % 6 === 0) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(px - 2, py - 2, 4.5, 2.8);
          } else {
            ctx.fillStyle = b % 2 === 0 ? '#dc2626' : '#7f1d1d';
            ctx.beginPath();
            ctx.arc(px, py, 2.4 + (b % 3) * 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (kId === 'sawblooder') {
        // SAWBLOODER: High-RPM vibrating saw tear + incandescent steel sparks + dual blood spray jets
        const vib = progress < 0.65 ? Math.sin(progress * 90) * 3 : 0;
        const sawLen = r * 0.68;
        // Smoke puff ring
        ctx.fillStyle = `rgba(30, 41, 59, ${(0.42 * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 18 + progress * 34, 0, Math.PI * 2);
        ctx.fill();

        // Serrated saw tear scar along strike angle
        ctx.save();
        ctx.translate(fx.x + vib, fx.y - vib * 0.6);
        ctx.rotate(ang);
        ctx.strokeStyle = `rgba(153, 27, 27, ${(0.92 * alpha).toFixed(3)})`;
        ctx.lineWidth = 10 * alpha + 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-sawLen * 0.35, 0);
        ctx.lineTo(sawLen * 0.75, 0);
        ctx.stroke();
        ctx.strokeStyle = `rgba(226, 232, 240, ${(0.85 * alpha).toFixed(3)})`;
        ctx.lineWidth = 3 * alpha;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -progress * 90;
        ctx.beginPath();
        ctx.moveTo(-sawLen * 0.35, 0);
        ctx.lineTo(sawLen * 0.75, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Violent perpendicular arterial blood jets + incandescent saw sparks
        for (let sp = 0; sp < 24; sp++) {
          const side = sp % 2 === 0 ? 1 : -1;
          const fanAng = ang + side * (Math.PI * 0.35 + ((sp % 6) / 6) * 0.75);
          const dist = progress * r * (0.38 + (sp % 4) * 0.19);
          const px = fx.x + Math.cos(fanAng) * dist;
          const py = fx.y + Math.sin(fanAng) * dist + progress * progress * 16;
          ctx.globalAlpha = Math.max(0, alpha);
          if (sp % 3 === 0) {
            ctx.fillStyle = sp % 6 === 0 ? '#fef08a' : '#fb923c';
            ctx.fillRect(px - 2, py - 2, 4, 4);
          } else {
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.arc(px, py, 2.2 + (sp % 3) * 1.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        // DARKNESS: Obsidian arcane rune circle + sweeping grim scythe crescent + rising shattered soul wisps
        // Floor violet rune circle
        ctx.save();
        ctx.translate(fx.x, fx.y);
        ctx.rotate(progress * 3.5);
        ctx.strokeStyle = `rgba(168, 85, 247, ${(0.75 * alpha).toFixed(3)})`;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Sweeping cold silver-violet grim scythe blade arc
        const reapP = Math.min(1, progress * 3.2);
        const arcStart = ang - 1.65;
        const arcEnd = arcStart + reapP * 3.3;
        ctx.strokeStyle = `rgba(124, 58, 237, ${(0.95 * alpha).toFixed(3)})`;
        ctx.lineWidth = 14 * alpha + 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r * 0.84, arcStart, arcEnd);
        ctx.stroke();
        ctx.strokeStyle = `rgba(243, 232, 255, ${(0.95 * alpha).toFixed(3)})`;
        ctx.lineWidth = 4 * alpha + 1;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r * 0.87, Math.max(arcStart, arcEnd - 1.4), arcEnd);
        ctx.stroke();

        // Severed soul orb rising & shattering into luminous violet embers
        if (progress < 0.55) {
          const soulP = progress / 0.55;
          const sy = fx.y - soulP * 34;
          ctx.fillStyle = `rgba(216, 180, 254, ${(0.9 * (1 - soulP * 0.4)).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(fx.x, sy, 8 * (1 - soulP * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
        for (let w = 0; w < 14; w++) {
          const wa = (w / 14) * Math.PI * 2 + progress * 2.2;
          const dist = Math.max(0, progress - 0.15) * r * (0.45 + (w % 3) * 0.18);
          const wx = fx.x + Math.cos(wa) * dist;
          const wy = fx.y - progress * 28 + Math.sin(wa) * dist * 0.7;
          ctx.fillStyle = w % 2 === 0 ? '#e9d5ff' : '#9333ea';
          ctx.globalAlpha = Math.max(0, alpha * 0.92);
          ctx.beginPath();
          ctx.arc(wx, wy, 2.5 + (w % 3), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
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
    } else if (proj.kind === 'meat_lob') {
      const height = proj.lobHeight ?? 0;
      // Parabolic ground shadow (shrinks with height)
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      const shadowR = Math.max(5, 14 * (1 - height / 90));
      ctx.beginPath();
      ctx.ellipse(proj.x, proj.y, shadowR, shadowR * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Flying raw meat chunk
      const spin = (proj.lobProgress ?? 0) * Math.PI * 4;
      ctx.translate(proj.x, proj.y - height);
      ctx.rotate(spin);

      // Raw red meat
      ctx.fillStyle = '#991b1b';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 9, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Protruding white bone fragment
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-14, -2.5, 7, 5);

      // Blood glisten
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(3, -2, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (proj.kind === 'protector_shield' || proj.kind === 'protector_protect') {
      const isShield = proj.kind === 'protector_shield';
      const ang = Math.atan2(proj.vy, proj.vx);
      const coreColor = isShield ? '#e0f2fe' : '#fef9c3';
      const glowColor = isShield ? '#38bdf8' : '#facc15';
      ctx.translate(proj.x, proj.y);
      ctx.rotate(ang);

      // Wide magic trail tail
      const tailGrad = ctx.createLinearGradient(-44, 0, 8, 0);
      tailGrad.addColorStop(0, 'rgba(0,0,0,0)');
      tailGrad.addColorStop(1, glowColor);
      ctx.strokeStyle = tailGrad;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-44, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();

      // Enlarged outer magic area halo & crisp ring
      ctx.fillStyle = glowColor + '3d';
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Bright arcane core orb
      ctx.fillStyle = coreColor;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, 11.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (proj.kind === 'bomber_bomb') {
      ctx.translate(proj.x, proj.y);
      const spin = (state.elapsed * 12) % (Math.PI * 2);
      ctx.rotate(spin);
      // Bomb sphere (dark charcoal with orange outline)
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Burning fuse spark
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, -proj.radius - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      // Emoji icon
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💣', 0, 1);
    } else if (proj.kind === 'smile_ball') {
      const ang = Math.atan2(proj.vy, proj.vx);
      ctx.translate(proj.x, proj.y);
      ctx.rotate(ang);
      // Crimson dark trail
      const tailGrad = ctx.createLinearGradient(-26, 0, 4, 0);
      tailGrad.addColorStop(0, 'rgba(225, 29, 72, 0)');
      tailGrad.addColorStop(1, 'rgba(225, 29, 72, 0.78)');
      ctx.strokeStyle = tailGrad;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(2, 0);
      ctx.stroke();
      // Small void crimson sphere
      ctx.fillStyle = '#020617';
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Tiny glowing smile eyes & grin
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(3, -3, 1.7, 0, Math.PI * 2);
      ctx.arc(3, 3, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(1, 0, 5.5, -0.55, 0.55);
      ctx.stroke();
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

    // Contextual Engineer & Darkness Hints near Vents & Doors
    if (
      (localPlayer.role === 'survivor' && localPlayer.survivorClass === 'engineer' && !localPlayer.downed) ||
      (localPlayer.role === 'killer' && localPlayer.killerId === 'darkness')
    ) {
      for (const vent of state.vents) {
        if (!vent.broken && Math.hypot(vent.x - localPlayer.x, vent.y - localPlayer.y) <= 84) {
          ctx.save();
          ctx.font = '700 11px "Outfit", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = localPlayer.role === 'killer' ? '#c084fc' : '#fbbf24';
          ctx.fillText(localPlayer.role === 'killer' ? '[Q] Gölge Venti' : '[Q] Vent Geçişi', vent.x, vent.y - 26);
          ctx.restore();
        }
      }
    }
    if (localPlayer.role === 'survivor' && localPlayer.survivorClass === 'engineer' && !localPlayer.downed) {
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
          ctx.fillText('[E] Kilitle (3s)', door.x + door.w / 2, door.y - 12);
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

  // Darkness Mode spectral violet edge aura
  if ((localPlayer.darknessModeTimer ?? 0) > 0) {
    const dmVig = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.25,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72
    );
    dmVig.addColorStop(0, 'rgba(124, 58, 237, 0)');
    dmVig.addColorStop(1, 'rgba(109, 40, 217, 0.34)');
    ctx.fillStyle = dmVig;
    ctx.fillRect(0, 0, width, height);
  }

  // Smile Q: 4s 75% Darkness Blindness on the nearest targeted survivor
  if (localPlayer.blindTimer > 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, height);
  }
}
