import { useEffect, useRef } from 'react';
import { KillerId, SurvivorClassId } from '../game/types';
import { KILLERS, SURVIVOR_CLASSES } from '../game/constants';

interface KillerWinCinematicProps {
  killerId: KillerId;
  lastVictimName?: string;
  lastVictimClass?: SurvivorClassId;
  onComplete: () => void;
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
}

function easeInOutQuad(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutBack(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function KillerWinCinematic({
  killerId,
  lastVictimName,
  lastVictimClass,
  onComplete,
}: KillerWinCinematicProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const completedRef = useRef(false);
  const spec = KILLERS[killerId];
  const victimSpec = lastVictimClass ? SURVIVOR_CLASSES[lastVictimClass] : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    completedRef.current = false;
    let raf = 0;
    const start = performance.now();
    const TOTAL_DURATION = 4.1;

    // Deterministic particles for sparks, blood droplets, embers, and concrete debris
    const particles = Array.from({ length: 64 }, (_, i) => ({
      angle: (i / 64) * Math.PI * 2 + (i % 7) * 0.13,
      speed: 0.35 + ((i * 41) % 100) / 78,
      size: 2.2 + (i % 5) * 1.5,
      seed: (i * 23) % 100,
    }));

    const dustMotes = Array.from({ length: 34 }, (_, i) => ({
      x: ((i * 73) % 100) / 100,
      y: ((i * 47) % 100) / 100,
      r: 1 + (i % 3) * 0.9,
      speed: 0.03 + (i % 5) * 0.015,
      phase: i * 0.8,
    }));

    const finish = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    };

    const drawVictimActor = (
      vx: number,
      vy: number,
      vScale: number,
      alpha: number,
      trembleAmp: number,
      flashRed: number,
      t: number
    ) => {
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      const sx = vx + Math.sin(t * 48) * trembleAmp;
      const sy = vy + Math.cos(t * 42) * trembleAmp * 0.7;
      ctx.translate(sx, sy);
      ctx.scale(vScale, vScale);

      // Ground perspective shadow
      ctx.fillStyle = flashRed > 0.2 ? 'rgba(153, 27, 27, 0.72)' : 'rgba(2, 6, 23, 0.75)';
      ctx.beginPath();
      ctx.ellipse(0, 20, 26 + flashRed * 14, 9 + flashRed * 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Survivor badge ring
      ctx.fillStyle = flashRed > 0.35 ? '#7f1d1d' : '#0f172a';
      ctx.strokeStyle = flashRed > 0.2 ? '#ef4444' : victimSpec?.accentColor ?? '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '22px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(victimSpec?.emoji ?? '🏃', 0, 1);

      if (flashRed > 0) {
        ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.65, flashRed * 0.65)})`;
        ctx.beginPath();
        ctx.arc(0, 0, 21, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= TOTAL_DURATION) {
        finish();
        return;
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(vw * dpr) || canvas.height !== Math.floor(vh * dpr)) {
        canvas.width = Math.floor(vw * dpr);
        canvas.height = Math.floor(vh * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = vw / 2;
      const cy = vh / 2;
      const baseScale = Math.min(vw / 560, vh / 380) * 1.28;

      // Dynamic camera zoom & shake per killer
      let camZoom = 1.0;
      let camOffX = 0;
      let camOffY = 0;
      let shakeX = 0;
      let shakeY = 0;

      if (killerId === 'jumper') {
        camZoom = t < 0.85 ? 1 + t * 0.08 : t < 1.3 ? 1.07 + easeOutCubic((t - 0.85) / 0.45) * 0.16 : 1.23 - Math.min(0.15, (t - 1.3) * 0.08);
        if (t >= 1.28 && t < 2.45) {
          const beat = ((t - 1.28) * 4.3) % 1;
          const mag = beat < 0.35 ? 24 * (1 - beat / 0.35) : 4;
          shakeX = (Math.random() - 0.5) * mag;
          shakeY = (Math.random() - 0.5) * mag;
        }
      } else if (killerId === 'juggernaut') {
        camZoom = 1 + Math.min(0.22, t * 0.08);
        if ((t > 0.25 && t < 0.42) || (t > 0.65 && t < 0.82)) {
          shakeY = (Math.random() - 0.5) * 12;
        } else if (t >= 1.58 && t < 2.0) {
          const dec = 1 - (t - 1.58) / 0.42;
          shakeX = (Math.random() - 0.5) * 28 * dec;
          shakeY = (Math.random() - 0.5) * 24 * dec;
        } else if (t >= 2.16 && t < 2.95) {
          const dec = 1 - (t - 2.16) / 0.79;
          shakeX = (Math.random() - 0.5) * 38 * dec;
          shakeY = (Math.random() - 0.5) * 32 * dec;
        }
      } else if (killerId === 'smile') {
        camZoom = 1 + easeInOutQuad(Math.min(1, t / 2.2)) * 0.28;
        if (t >= 2.02 && t < 2.75) {
          const dec = 1 - (t - 2.02) / 0.73;
          shakeX = (Math.random() - 0.5) * 22 * dec;
          shakeY = (Math.random() - 0.5) * 20 * dec;
        }
      } else if (killerId === 'hungry') {
        camZoom = t < 1.95 ? 1 + t * 0.08 : 1.15 + easeOutCubic(Math.min(1, (t - 1.95) / 0.3)) * 0.14;
        if ((t >= 0.94 && t < 1.16) || (t >= 1.36 && t < 1.58)) {
          shakeX = (Math.random() - 0.5) * 18;
          shakeY = (Math.random() - 0.5) * 16;
        } else if (t >= 1.96 && t < 2.7) {
          const dec = 1 - (t - 1.96) / 0.74;
          shakeX = (Math.random() - 0.5) * 34 * dec;
          shakeY = (Math.random() - 0.5) * 28 * dec;
        }
      } else if (killerId === 'sawblooder') {
        camZoom = t < 1.25 ? 1 + t * 0.1 : 1.12 + Math.sin((t - 1.25) * 24) * 0.025;
        if (t >= 1.25 && t < 2.6) {
          const mag = t < 2.25 ? 14 : 28 * Math.max(0, 1 - (t - 2.25) / 0.35);
          shakeX = (Math.random() - 0.5) * mag;
          shakeY = (Math.random() - 0.5) * mag;
        }
      } else {
        camZoom = t < 1.85 ? 1 + t * 0.09 : 1.17 + easeOutCubic(Math.min(1, (t - 1.85) / 0.3)) * 0.12;
        if (t >= 1.86 && t < 2.65) {
          const dec = 1 - (t - 1.86) / 0.79;
          shakeX = (Math.random() - 0.5) * 28 * dec;
          shakeY = (Math.random() - 0.5) * 24 * dec;
        }
      }

      // 1. Pitch dark horror backdrop + radial killer atmosphere
      ctx.fillStyle = '#020306';
      ctx.fillRect(0, 0, vw, vh);

      const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(vw, vh) * 0.78);
      if (killerId === 'jumper') {
        bgGrad.addColorStop(0, 'rgba(180, 83, 9, 0.28)');
        bgGrad.addColorStop(0.5, 'rgba(69, 26, 3, 0.16)');
      } else if (killerId === 'juggernaut') {
        bgGrad.addColorStop(0, 'rgba(220, 38, 38, 0.34)');
        bgGrad.addColorStop(0.5, 'rgba(30, 41, 59, 0.22)');
      } else if (killerId === 'smile') {
        bgGrad.addColorStop(0, 'rgba(225, 29, 72, 0.24)');
        bgGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.22)');
      } else if (killerId === 'darkness') {
        bgGrad.addColorStop(0, 'rgba(124, 58, 237, 0.36)');
        bgGrad.addColorStop(0.5, 'rgba(30, 27, 75, 0.26)');
      } else {
        bgGrad.addColorStop(0, 'rgba(185, 28, 28, 0.36)');
        bgGrad.addColorStop(0.5, 'rgba(69, 10, 10, 0.2)');
      }
      bgGrad.addColorStop(1, 'rgba(2, 3, 6, 0.98)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, vw, vh);

      // Apply camera transform
      ctx.save();
      ctx.translate(cx + shakeX + camOffX, cy + shakeY + camOffY);
      ctx.scale(camZoom, camZoom);
      ctx.translate(-cx, -cy);

      // 2. Bunker Concrete Perspective Floor & Overhead Spotlight Shaft
      const horizonY = cy + vh * 0.04;
      const floorGrad = ctx.createLinearGradient(0, horizonY, 0, vh);
      floorGrad.addColorStop(0, 'rgba(15, 23, 42, 0.15)');
      floorGrad.addColorStop(0.4, 'rgba(15, 23, 42, 0.58)');
      floorGrad.addColorStop(1, 'rgba(2, 6, 23, 0.95)');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(-100, horizonY, vw + 200, vh - horizonY + 120);

      // Perspective floor grid lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1.2;
      for (let g = -8; g <= 8; g++) {
        ctx.beginPath();
        ctx.moveTo(cx + g * (vw * 0.055), horizonY);
        ctx.lineTo(cx + g * (vw * 0.22), vh + 80);
        ctx.stroke();
      }
      for (let r = 1; r <= 5; r++) {
        const ry = horizonY + Math.pow(r / 5, 1.55) * (vh * 0.45);
        ctx.beginPath();
        ctx.moveTo(-80, ry);
        ctx.lineTo(vw + 80, ry);
        ctx.stroke();
      }

      // Volumetric overhead horror spotlight cone
      const flicker =
        killerId === 'smile' && t > 0.35 && t < 0.72
          ? Math.random() > 0.55
            ? 0.03
            : 0.14
          : killerId === 'sawblooder'
          ? 0.08 + Math.abs(Math.sin(t * 7)) * 0.12
          : 0.13;
      const coneGrad = ctx.createLinearGradient(cx, 0, cx, cy + vh * 0.28);
      coneGrad.addColorStop(0, `rgba(226, 232, 240, ${flicker * 1.15})`);
      coneGrad.addColorStop(1, 'rgba(226, 232, 240, 0)');
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(cx - vw * 0.08, -40);
      ctx.lineTo(cx + vw * 0.08, -40);
      ctx.lineTo(cx + vw * 0.34, cy + vh * 0.32);
      ctx.lineTo(cx - vw * 0.34, cy + vh * 0.32);
      ctx.closePath();
      ctx.fill();

      // Atmospheric floating dust motes
      for (const m of dustMotes) {
        const mx = ((m.x + t * m.speed * 0.35) % 1) * vw;
        const my = ((m.y - t * m.speed * 0.2 + 2) % 1) * vh;
        ctx.fillStyle = `rgba(226, 232, 240, ${0.12 + Math.sin(t * 2 + m.phase) * 0.08})`;
        ctx.beginPath();
        ctx.arc(mx, my, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // =====================================================================
      // 1. JUMPER: Ceiling Drop -> Supersonic Pounce -> 5-Slash Shred -> Leap Back
      // =====================================================================
      if (killerId === 'jumper') {
        const victimX = cx + (t < 0.85 ? -t * 28 : -24);
        const victimY = cy + vh * 0.17;
        const impactT = 1.28;
        const victimHitFlash =
          t >= impactT && t < 2.45 ? Math.max(0, Math.sin(((t - impactT) * 4.3) * Math.PI)) : 0;
        const victimAlpha = t < 2.3 ? 0.96 : Math.max(0, 1 - (t - 2.3) / 0.55);
        drawVictimActor(
          victimX,
          victimY,
          baseScale * (t < impactT ? 1 : 0.92),
          victimAlpha,
          t < 1.28 ? 2.5 : 6,
          victimHitFlash,
          t
        );

        // Stalking silken threads from darkness above
        if (t < 1.1) {
          const threadAlpha = Math.max(0, 1 - Math.max(0, t - 0.8) / 0.3);
          ctx.strokeStyle = `rgba(214, 211, 209, ${threadAlpha * 0.35})`;
          ctx.lineWidth = 1.4;
          for (const ox of [-28, 0, 28]) {
            ctx.beginPath();
            ctx.moveTo(cx + ox * 1.4, -20);
            ctx.lineTo(cx + ox * 0.4, cy - vh * 0.12 + Math.min(1, t / 0.7) * 45);
            ctx.stroke();
          }
        }

        // Radial speed lines during pounce
        if (t >= 0.85 && t < 1.65) {
          const lp = Math.min(1, (t - 0.85) / 0.45);
          const alpha = t < 1.3 ? lp : Math.max(0, 1 - (t - 1.3) / 0.35);
          ctx.strokeStyle = `rgba(245, 158, 11, ${alpha * 0.45})`;
          ctx.lineWidth = 2.4;
          for (let i = 0; i < 32; i++) {
            const a = (i / 32) * Math.PI * 2;
            const r1 = Math.min(vw, vh) * (0.14 + (1 - lp) * 0.14);
            const r2 = Math.max(vw, vh) * 0.78;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
            ctx.stroke();
          }
        }

        // Jumper position & dynamic staging
        let jx = cx + 22;
        let jy = cy - vh * 0.22;
        let jScale = baseScale * 0.72;
        let jRot = 0;
        if (t < 0.85) {
          const p = easeOutCubic(t / 0.85);
          jy = cy - vh * 0.25 + p * (vh * 0.08);
          jScale = baseScale * (0.65 + p * 0.22);
        } else if (t < 1.3) {
          const p = easeOutCubic((t - 0.85) / 0.45);
          jx = cx + 22 + (victimX - (cx + 22)) * p;
          jy = cy - vh * 0.17 + (victimY - 12 - (cy - vh * 0.17)) * p;
          jScale = baseScale * (0.87 + p * 1.05);
        } else if (t < 2.42) {
          const flurryP = (t - 1.3) / 1.12;
          const lunge = Math.sin(flurryP * Math.PI * 5);
          jx = victimX + lunge * 36;
          jy = victimY - 18 + Math.abs(lunge) * 14;
          jScale = baseScale * (1.85 + Math.abs(lunge) * 0.22);
          jRot = lunge * 0.28;
        } else {
          const p = easeOutCubic(Math.min(1, (t - 2.42) / 0.45));
          jx = victimX + p * 34;
          jy = victimY - 20 - p * 46;
          jScale = baseScale * (1.85 - p * 0.35);
          jRot = -p * 0.08;
        }

        // Ghostly speed afterimages during leap
        if (t >= 0.85 && t < 1.32) {
          for (let g = 1; g <= 3; g++) {
            ctx.save();
            ctx.globalAlpha = 0.22 / g;
            ctx.translate(jx + g * 12, jy - g * 26);
            ctx.scale(jScale * (1 - g * 0.12), jScale * (1 - g * 0.12));
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.ellipse(0, 0, 26, 20, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // Detailed Jumper Model
        ctx.save();
        ctx.translate(jx, jy);
        ctx.rotate(jRot);
        ctx.scale(jScale, jScale);
        const legTwitch = t < 0.85 ? Math.sin(t * 26) * 0.22 : Math.sin(t * 32) * 0.38;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          for (let i = -1; i <= 1; i++) {
            const a = side * (Math.PI * 0.44 + i * 0.36);
            const sw = legTwitch * side;
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 5.5;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
            ctx.lineTo(Math.cos(a + sw) * 32, Math.sin(a + sw) * 26);
            ctx.lineTo(Math.cos(a + sw * 1.45) * 48, Math.sin(a + sw * 1.45) * 38);
            ctx.stroke();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a + sw) * 32, Math.sin(a + sw) * 26);
            ctx.lineTo(Math.cos(a + sw * 1.45) * 52, Math.sin(a + sw * 1.45) * 42);
            ctx.stroke();
          }
          const clawSlash = t >= 1.3 && t < 2.42 ? Math.sin(t * 28) * 14 : 0;
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 4.2;
          ctx.beginPath();
          ctx.moveTo(side * 12, -10);
          ctx.quadraticCurveTo(side * (32 + clawSlash), -26, side * (10 + clawSlash * 0.4), -42);
          ctx.stroke();
        }
        ctx.fillStyle = '#1c1917';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(0, 12, 18, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.ellipse(0, -6, 22, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(-8, -14, 4.4, 0, Math.PI * 2);
        ctx.arc(8, -14, 4.4, 0, Math.PI * 2);
        ctx.arc(-14, -8, 2.5, 0, Math.PI * 2);
        ctx.arc(14, -8, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();

        // 5-beat rapid glowing screen-wide claw slashes!
        if (t >= 1.28) {
          const beats = [
            [1.28, -0.62],
            [1.52, 0.58],
            [1.76, -0.52],
            [2.0, 0.65],
            [2.24, -0.58],
          ];
          for (const [bt, angle] of beats) {
            if (t >= bt) {
              const bp = Math.min(1, (t - bt) / 0.22);
              const fade = t - bt > 0.35 ? Math.max(0, 1 - (t - bt - 0.35) / 1.1) : 1;
              if (fade > 0.02) {
                ctx.save();
                ctx.globalAlpha = fade;
                ctx.translate(victimX, victimY - 24);
                ctx.rotate(angle);
                for (let s = -1; s <= 1; s++) {
                  const len = Math.min(vw, vh) * 0.44 * easeOutCubic(bp);
                  ctx.strokeStyle = 'rgba(220, 38, 38, 0.85)';
                  ctx.lineWidth = 15 - Math.abs(s) * 4;
                  ctx.lineCap = 'round';
                  ctx.beginPath();
                  ctx.moveTo(-len, s * 22);
                  ctx.lineTo(len, s * 22);
                  ctx.stroke();

                  ctx.strokeStyle = '#fef08a';
                  ctx.lineWidth = 5 - Math.abs(s);
                  ctx.beginPath();
                  ctx.moveTo(-len, s * 22);
                  ctx.lineTo(len, s * 22);
                  ctx.stroke();
                }
                ctx.restore();
              }
            }
          }
          // Sparks & blood droplets
          const dp = Math.min(1, (t - 1.28) / 2.2);
          for (const pt of particles) {
            const r = dp * Math.max(vw, vh) * 0.5 * pt.speed;
            const px = victimX + Math.cos(pt.angle) * r;
            const py = victimY + Math.sin(pt.angle) * r + dp * dp * 95;
            ctx.fillStyle = pt.seed % 2 === 0 ? '#ef4444' : '#fbbf24';
            ctx.globalAlpha = Math.max(0, 1 - dp * 0.85);
            ctx.beginPath();
            ctx.arc(px, py, pt.size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      // =====================================================================
      // 2. JUGGERNAUT: Heavy March -> Titan Lift -> Double Cataclysmic Slam
      // =====================================================================
      else if (killerId === 'juggernaut') {
        const slam1T = 1.58;
        const slam2T = 2.16;
        const victimX = cx;
        let victimY = cy + vh * 0.19;
        if (t >= slam1T && t < slam2T) {
          const bounce = Math.sin(Math.min(1, (t - slam1T) / 0.45) * Math.PI) * 32;
          victimY -= bounce;
        }
        const vFlash =
          (t >= slam1T && t < slam1T + 0.28) || (t >= slam2T && t < slam2T + 0.4) ? 0.9 : 0;
        const vAlpha = t < slam2T + 0.12 ? 0.96 : Math.max(0, 1 - (t - slam2T - 0.12) / 0.55);
        drawVictimActor(
          victimX,
          victimY,
          baseScale * (t >= slam2T ? 0.72 : 1),
          vAlpha,
          t < slam1T ? 2 : 5,
          vFlash,
          t
        );

        // Shockwaves & floor craters on Slam 1 and Slam 2
        for (const [st, intensity] of [
          [slam1T, 0.75],
          [slam2T, 1.15],
        ]) {
          if (t >= st) {
            const sp = Math.min(1, (t - st) / 1.15);
            const flash = t - st < 0.22 ? 1 - (t - st) / 0.22 : 0;
            if (flash > 0) {
              ctx.fillStyle = `rgba(220, 38, 38, ${flash * 0.28 * intensity})`;
              ctx.fillRect(-50, -50, vw + 100, vh + 100);
            }
            for (let r = 0; r < 3; r++) {
              const rp = Math.max(0, Math.min(1, (t - st - r * 0.1) / 0.95));
              if (rp > 0 && rp < 1) {
                ctx.strokeStyle =
                  r === 0 ? `rgba(252, 165, 165, ${1 - rp})` : `rgba(220, 38, 38, ${(1 - rp) * 0.8})`;
                ctx.lineWidth = (10 - r * 2.5) * (1 - rp) * intensity;
                ctx.beginPath();
                ctx.ellipse(
                  victimX,
                  cy + vh * 0.18,
                  50 + rp * vw * 0.62 * intensity,
                  22 + rp * vh * 0.28 * intensity,
                  0,
                  0,
                  Math.PI * 2
                );
                ctx.stroke();
              }
            }
          }
        }

        if (t >= slam1T) {
          const crackP = t >= slam2T ? 1 : 0.55;
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.82)';
          ctx.lineWidth = t >= slam2T ? 4 : 2.5;
          for (let c = 0; c < 12; c++) {
            const ca = (c / 12) * Math.PI * 2 + 0.16;
            const len = Math.max(vw, vh) * 0.52 * crackP;
            ctx.beginPath();
            ctx.moveTo(victimX, cy + vh * 0.18);
            ctx.lineTo(
              victimX + Math.cos(ca + 0.08) * len * 0.48,
              cy + vh * 0.18 + Math.sin(ca + 0.08) * len * 0.28
            );
            ctx.lineTo(
              victimX + Math.cos(ca - 0.05) * len,
              cy + vh * 0.18 + Math.sin(ca - 0.05) * len * 0.55
            );
            ctx.stroke();
          }
        }

        if (t >= slam2T) {
          const pT = Math.min(1, (t - slam2T) / 1.7);
          for (const pt of particles) {
            const px = victimX + Math.cos(pt.angle) * (pT * vw * 0.55 * pt.speed);
            const py =
              cy +
              vh * 0.15 +
              Math.sin(pt.angle) * (pT * vh * 0.35 * pt.speed) -
              Math.sin(pT * Math.PI) * 125;
            ctx.fillStyle = pt.seed % 2 === 0 ? '#fca5a5' : '#ef4444';
            ctx.globalAlpha = Math.max(0, 1 - pT);
            ctx.beginPath();
            ctx.arc(px, py, pt.size * 1.15, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        // Juggernaut towering armored body
        const marchP = Math.min(1, t / 1.0);
        const raise1 = t < 1.0 ? 0 : t < slam1T ? easeInOutQuad((t - 1.0) / 0.58) : 0;
        const raise2 = t >= 1.82 && t < slam2T ? easeInOutQuad((t - 1.82) / 0.34) : 0;
        const activeLift = Math.max(raise1, raise2);
        const stompBounce = t < 1.0 ? Math.abs(Math.sin(t * 7)) * 13 : 0;
        const slamDrop =
          (t >= slam1T && t < 1.82) || t >= slam2T
            ? easeOutCubic(Math.min(1, (t >= slam2T ? t - slam2T : t - slam1T) / 0.12)) * 28
            : -activeLift * 36;
        const jScale = baseScale * (0.82 + marchP * 0.58 + (t >= slam2T ? 0.24 : 0));

        ctx.save();
        ctx.translate(cx, cy - 10 - stompBounce + slamDrop * 0.65);
        ctx.scale(jScale, jScale);

        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(-18, -6);
        ctx.lineTo(-8, 14);
        ctx.moveTo(18, -6);
        ctx.lineTo(8, 14);
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(0, -10, 9.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fecaca';
        ctx.beginPath();
        ctx.arc(0, -10, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#e2e8f0';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * 14, -20);
          ctx.quadraticCurveTo(side * 38, -42, side * 44, -18);
          ctx.quadraticCurveTo(side * 28, -24, side * 18, -12);
          ctx.fill();
        }

        const isSlamming = (t >= slam1T && t < 1.82) || t >= slam2T;
        const fistY = isSlamming ? 32 : 10 - activeLift * 54;
        const fistX = isSlamming ? 20 : 40 + activeLift * 10;
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * fistX, fistY);
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = isSlamming ? '#fca5a5' : '#dc2626';
          ctx.lineWidth = 3.2;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = activeLift > 0 ? 18 : 8;
          ctx.beginPath();
          ctx.roundRect(-14, -12, 28, 24, 6);
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.restore();
        }
        ctx.restore();
      }

      // =====================================================================
      // 3. SMILE: Lights Flicker Out -> Void Cage -> Giant Fanged Jaw Chomp
      // =====================================================================
      else if (killerId === 'smile') {
        const chompT = 2.02;
        const emergeP = Math.min(1, t / 1.15);
        const grinP = t < 0.65 ? 0 : Math.min(1, (t - 0.65) / 1.25);
        const chompP = t < chompT ? 0 : Math.min(1, (t - chompT) / 0.35);

        const victimAlpha = t < chompT ? 0.96 : Math.max(0, 1 - (t - chompT) / 0.32);
        drawVictimActor(
          cx,
          cy + vh * 0.16,
          baseScale * (1 - chompP * 0.3),
          victimAlpha,
          4.5,
          chompP,
          t
        );

        // Creeping shadow tendrils stretching inward to snare victim
        ctx.strokeStyle = 'rgba(225, 29, 72, 0.42)';
        ctx.lineWidth = 4.5;
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2 + Math.sin(t * 1.8 + k) * 0.12;
          const reach = (0.3 + emergeP * 0.62) * Math.max(vw, vh) * 0.56;
          const sx = cx + Math.cos(a) * Math.max(vw, vh) * 0.78;
          const sy = cy + Math.sin(a) * Math.max(vw, vh) * 0.78;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(
            cx + Math.cos(a + 0.25) * reach * 0.55,
            cy + Math.sin(a + 0.25) * reach * 0.55,
            cx + Math.cos(a) * (Math.max(vw, vh) * 0.78 - reach),
            cy + Math.sin(a) * (Math.max(vw, vh) * 0.78 - reach)
          );
          ctx.stroke();
        }

        // Orbiting void spheres collapsing inward at climax
        const orbitR =
          Math.min(vw, vh) *
          (t < chompT
            ? 0.36 - easeOutCubic(emergeP) * 0.12 + Math.sin(t * 4) * 0.02
            : Math.max(0.02, 0.24 * (1 - chompP)));
        const orbitSpeed = 1.8 + grinP * 3.2;
        for (let s = 0; s < 6; s++) {
          const baseA = (s / 6) * Math.PI * 2 + t * orbitSpeed;
          for (let tr = 3; tr >= 0; tr--) {
            const ta = baseA - tr * 0.16;
            const ox = cx + Math.cos(ta) * orbitR;
            const oy = cy + Math.sin(ta) * orbitR * 0.68;
            ctx.globalAlpha = tr === 0 ? 1 : 0.22 / tr;
            ctx.fillStyle = tr === 0 ? '#020617' : '#e11d48';
            ctx.strokeStyle = '#fb7185';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(ox, oy, (15 - tr * 2.5) * (baseScale * 0.65), 0, Math.PI * 2);
            ctx.fill();
            if (tr === 0) ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;

        // Colossal Smile Entity lunging forward
        const sScale = baseScale * (0.85 + easeOutCubic(emergeP) * 0.85 + easeOutBack(chompP) * 0.65);
        ctx.save();
        ctx.translate(cx, cy - 8 + chompP * 18);
        ctx.scale(sScale, sScale);

        ctx.fillStyle = '#020617';
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#e11d48';
        ctx.shadowBlur = 28;
        ctx.beginPath();
        ctx.arc(0, 0, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#fb7185';
        ctx.shadowColor = '#e11d48';
        ctx.shadowBlur = 18;
        for (const sx of [-13, 13]) {
          ctx.beginPath();
          ctx.ellipse(sx, -12, 5.4, 4.2, sx < 0 ? 0.25 : -0.25, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        const grinSpan = 0.24 + easeOutCubic(grinP) * 1.15;
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(0, 3, 24, Math.PI * (0.5 - grinSpan * 0.42), Math.PI * (0.5 + grinSpan * 0.42));
        ctx.stroke();

        if (grinP > 0.2) {
          ctx.fillStyle = '#f8fafc';
          for (let i = -4; i <= 4; i++) {
            const frac = i / 4;
            const ang = Math.PI * 0.5 + frac * grinSpan * 0.38;
            const tx = Math.cos(ang) * 24;
            const ty = 3 + Math.sin(ang) * 24;
            ctx.beginPath();
            ctx.moveTo(tx - 2.6, ty - 4);
            ctx.lineTo(tx, ty + 6 * Math.min(1, grinP * 1.3));
            ctx.lineTo(tx + 2.6, ty - 4);
            ctx.fill();
          }
        }
        ctx.restore();

        if (chompP > 0 && chompP < 1) {
          ctx.fillStyle = `rgba(225, 29, 72, ${(1 - chompP) * 0.3})`;
          ctx.fillRect(-50, -50, vw + 100, vh + 100);
        }
      }

      // =====================================================================
      // 4. HUNGRY: Butcher Stomp -> Double Chop -> Giant Execution Cleave
      // =====================================================================
      else if (killerId === 'hungry') {
        const chop1 = 0.94;
        const chop2 = 1.36;
        const cleaveT = 1.96;
        const vFlash =
          (t >= chop1 && t < chop1 + 0.18) ||
          (t >= chop2 && t < chop2 + 0.18) ||
          t >= cleaveT
            ? 0.9
            : 0;
        const vAlpha = t < cleaveT + 0.08 ? 0.96 : Math.max(0, 1 - (t - cleaveT - 0.08) / 0.48);
        const vx = cx + (t >= chop2 ? 12 : t >= chop1 ? -12 : 0);
        drawVictimActor(vx, cy + vh * 0.18, baseScale, vAlpha, 3.5, vFlash, t);

        const approachP = Math.min(1, t / 0.85);
        const hScale = baseScale * (0.85 + approachP * 0.62 + (t >= cleaveT ? 0.28 : 0));
        const lungeX =
          t >= chop1 && t < chop1 + 0.22
            ? -22
            : t >= chop2 && t < chop2 + 0.22
            ? 22
            : 0;
        ctx.save();
        ctx.translate(cx + lungeX, cy - 12);
        ctx.scale(hScale, hScale);

        const chomp = Math.abs(Math.sin(t * 11));
        const grad = ctx.createRadialGradient(-5, -5, 10, 0, 0, 42);
        grad.addColorStop(0, '#ef4444');
        grad.addColorStop(1, '#450a0a');
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#09090b';
        ctx.beginPath();
        ctx.ellipse(0, 6, 15 + chomp * 5, 19, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef2f2';
        for (let fy = -8; fy <= 20; fy += 6.5) {
          ctx.beginPath();
          ctx.moveTo(-14, fy - 2.5);
          ctx.lineTo(-5 - chomp * 2.5, fy);
          ctx.lineTo(-14, fy + 2.5);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(14, fy - 2.5);
          ctx.lineTo(5 + chomp * 2.5, fy);
          ctx.lineTo(14, fy + 2.5);
          ctx.fill();
        }

        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(-17, -17, 4.8, 0, Math.PI * 2);
        ctx.arc(17, -17, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Meat cleaver motion through chops + final overhead sweep
        let bladeAngle = -0.5;
        if (t < chop1) {
          bladeAngle = -0.5 - (t / chop1) * 0.85;
        } else if (t < chop2) {
          bladeAngle = -1.35 + easeOutCubic(Math.min(1, (t - chop1) / 0.16)) * 2.1;
        } else if (t < 1.55) {
          bladeAngle = 0.75 - easeOutCubic(Math.min(1, (t - chop2) / 0.16)) * 2.2;
        } else if (t < cleaveT) {
          bladeAngle = -1.45 - easeInOutQuad((t - 1.55) / (cleaveT - 1.55)) * 0.55;
        } else {
          bladeAngle = -2.0 + easeOutCubic(Math.min(1, (t - cleaveT) / 0.24)) * 3.6;
        }

        ctx.save();
        ctx.translate(36, 10);
        ctx.rotate(bladeAngle);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-8, -5, 22, 10);
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, -8);
        ctx.lineTo(68, -22);
        ctx.lineTo(68, 17);
        ctx.lineTo(14, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(22, 8, 42, 5.5);
        ctx.restore();
        ctx.restore();

        // Slash arcs on chop 1, chop 2, and final cleave
        for (const [ct, span, w] of [
          [chop1, 1.3, 14],
          [chop2, 1.4, 16],
          [cleaveT, 2.75, 26],
        ]) {
          if (t >= ct) {
            const cp = Math.min(1, (t - ct) / 0.26);
            const fade = Math.max(0, 1 - (t - ct) / 0.85);
            if (fade > 0.02) {
              ctx.save();
              ctx.globalAlpha = fade;
              const sweepR = Math.min(vw, vh) * (ct === cleaveT ? 0.44 : 0.28);
              ctx.strokeStyle = '#dc2626';
              ctx.lineWidth = w;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.arc(cx, cy + 16, sweepR, -span / 2, -span / 2 + easeOutCubic(cp) * span);
              ctx.stroke();
              ctx.strokeStyle = '#f8fafc';
              ctx.lineWidth = w * 0.3;
              ctx.beginPath();
              ctx.arc(cx, cy + 16, sweepR, -span / 2, -span / 2 + easeOutCubic(cp) * span);
              ctx.stroke();
              ctx.restore();
            }
          }
        }

        if (t >= cleaveT) {
          const postT = t - cleaveT;
          const dp = Math.min(1, postT / 1.8);
          for (const pt of particles) {
            const dist = dp * Math.max(vw, vh) * 0.56 * pt.speed;
            const px = cx + Math.cos(pt.angle) * dist;
            const py = cy + Math.sin(pt.angle) * dist + dp * dp * 115;
            ctx.fillStyle = pt.seed % 2 === 0 ? '#ef4444' : '#991b1b';
            ctx.globalAlpha = Math.max(0, 1 - dp * 0.78);
            ctx.beginPath();
            ctx.arc(px, py, pt.size * 1.25, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      // =====================================================================
      // 5. SAWBLOODER: Alarm Strobe -> Cord Yank -> Saw Grind -> Ripping Sweep
      // =====================================================================
      else if (killerId === 'sawblooder') {
        const grindT = 1.25;
        const ripT = 2.24;
        const isGrinding = t >= grindT && t < ripT;
        const vFlash = isGrinding ? 0.65 + Math.sin(t * 36) * 0.25 : t >= ripT ? 0.95 : 0;
        const vAlpha = t < ripT + 0.08 ? 0.96 : Math.max(0, 1 - (t - ripT - 0.08) / 0.45);
        drawVictimActor(cx, cy + vh * 0.17, baseScale, vAlpha, isGrinding ? 7.5 : 3, vFlash, t);

        const approach = Math.min(1, t / grindT);
        const fScale = baseScale * (0.9 + approach * 0.35 + (t >= ripT ? 0.25 : 0));
        const cordPull =
          (t > 0.4 && t < 0.68) || (t > 0.78 && t < 1.05) ? Math.sin(t * 24) * 9 : 0;

        ctx.save();
        ctx.translate(cx + cordPull, cy - 8);
        ctx.scale(fScale, fScale);

        const sawVibe = t >= 0.85 ? Math.sin(t * 68) * 3 : 0;

        ctx.fillStyle = '#291814';
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, -6, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(-8, -8, 4.5, 0, Math.PI * 2);
        ctx.arc(8, -8, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.save();
        const sawAngle =
          t < grindT
            ? -0.45 + Math.sin(t * 16) * 0.14
            : t < ripT
            ? 0.25 + Math.sin(t * 28) * 0.22
            : 0.25 - easeOutCubic(Math.min(1, (t - ripT) / 0.28)) * 2.15;
        ctx.translate(20, 12 + sawVibe);
        ctx.rotate(sawAngle);

        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.fillRect(-10, -10, 24, 20);
        ctx.strokeRect(-10, -10, 24, 20);

        ctx.fillStyle = '#94a3b8';
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(14, -8);
        ctx.lineTo(84, -5);
        ctx.arc(84, 0, 5, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(14, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#dc2626';
        ctx.fillRect(30, -5, 54, 10);

        if (t >= 0.85) {
          ctx.fillStyle = '#fef08a';
          for (let s = 0; s < 8; s++) {
            const sx = 28 + Math.random() * 54;
            const sy = (Math.random() - 0.5) * 26;
            ctx.fillRect(sx, sy, 3.2, 3.2);
          }
        }
        ctx.restore();
        ctx.restore();

        // Continuous sparks fountain during saw grind + explosive rip arc
        if (isGrinding) {
          for (let s = 0; s < 18; s++) {
            const age = ((t * 3.8 + s * 0.17) % 1);
            const sa = -Math.PI * 0.8 + (s % 9) * 0.22;
            const dist = age * Math.min(vw, vh) * 0.34;
            ctx.fillStyle = s % 2 === 0 ? '#fef08a' : '#ef4444';
            ctx.globalAlpha = 1 - age;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(sa) * dist, cy + vh * 0.14 + Math.sin(sa) * dist, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (t >= ripT) {
          const rp = Math.min(1, (t - ripT) / 0.28);
          const fade = Math.max(0, 1 - (t - ripT) / 0.9);
          ctx.save();
          ctx.globalAlpha = fade;
          const sweepR = Math.min(vw, vh) * 0.46;
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 26;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.25, -1.25 + easeOutCubic(rp) * 2.55);
          ctx.stroke();
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.25, -1.25 + easeOutCubic(rp) * 2.55);
          ctx.stroke();
          ctx.restore();
        }
      }

      // =====================================================================
      // 6. DARKNESS: Triple Spectral Dash -> Arcane Rune Spin -> Crescent Reap
      // =====================================================================
      else {
        const reapT = 1.85;
        const vAlpha = t < reapT + 0.06 ? 0.96 : Math.max(0, 1 - (t - reapT - 0.06) / 0.45);
        drawVictimActor(cx, cy + vh * 0.17, baseScale, vAlpha, 3.5, t >= reapT ? 0.85 : 0, t);

        // Spinning violet rune circle underneath victim
        if (t >= 0.4) {
          const runeAlpha = Math.min(0.85, (t - 0.4) * 1.4) * (t > reapT + 0.6 ? Math.max(0, 1 - (t - reapT - 0.6) / 0.7) : 1);
          ctx.save();
          ctx.translate(cx, cy + vh * 0.17);
          ctx.scale(1, 0.45);
          ctx.rotate(t * 2.4);
          ctx.strokeStyle = `rgba(168, 85, 247, ${runeAlpha})`;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(0, 0, Math.min(vw, vh) * 0.24, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([12, 8]);
          ctx.beginPath();
          ctx.arc(0, 0, Math.min(vw, vh) * 0.18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Triple spectral afterimage positions encircling victim before climax
        const dx =
          t < 0.75
            ? cx - vw * 0.18
            : t < 1.15
            ? cx + vw * 0.16
            : t < 1.55
            ? cx
            : cx;
        const dy =
          t < 0.75
            ? cy - 12
            : t < 1.15
            ? cy - 18
            : t < 1.55
            ? cy - 32
            : cy - 18;
        const dScale = baseScale * (0.8 + easeInOutQuad(Math.min(1, t / 1.5)) * 0.68);

        ctx.save();
        ctx.translate(dx, dy);
        ctx.scale(dScale, dScale);
        for (let w = 0; w < 8; w++) {
          const wa = (w / 8) * Math.PI * 2 + t * 2.8;
          ctx.fillStyle = 'rgba(124, 58, 237, 0.32)';
          ctx.beginPath();
          ctx.arc(Math.cos(wa) * 52, Math.sin(wa) * 52, 14, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#09090b';
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#c084fc';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(-9, -6, 4.2, 0, Math.PI * 2);
        ctx.arc(9, -6, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.save();
        const scytheAng =
          t < reapT
            ? -0.9 + Math.sin(t * 3.5) * 0.35
            : -0.9 + easeOutCubic(Math.min(1, (t - reapT) / 0.28)) * 3.1;
        ctx.rotate(scytheAng);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(-42, 22);
        ctx.lineTo(56, -22);
        ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(56, -22);
        ctx.quadraticCurveTo(76, -64, 24, -78);
        ctx.quadraticCurveTo(52, -48, 44, -16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.restore();

        if (t >= reapT) {
          const rp = Math.min(1, (t - reapT) / 0.3);
          const fade = Math.max(0, 1 - (t - reapT) / 1.1);
          const sweepR = Math.min(vw, vh) * 0.48;
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.strokeStyle = '#7c3aed';
          ctx.lineWidth = 24;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.4, -1.4 + easeOutCubic(rp) * 2.8);
          ctx.stroke();
          ctx.strokeStyle = '#e9d5ff';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.4, -1.4 + easeOutCubic(rp) * 2.8);
          ctx.stroke();
          ctx.restore();

          for (const pt of particles) {
            const dp = Math.min(1, (t - reapT) / 1.5);
            const dist = dp * pt.speed * Math.min(vw, vh) * 0.48;
            ctx.fillStyle = pt.seed % 2 === 0 ? '#a855f7' : '#e9d5ff';
            ctx.globalAlpha = Math.max(0, 1 - dp);
            ctx.beginPath();
            ctx.arc(cx + Math.cos(pt.angle) * dist, cy + Math.sin(pt.angle) * dist, pt.size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore(); // End camera zoom/shake transform

      // Clean cinemascope letterbox bars (ZERO top text; clean victory banner fades in at finale only)
      const barH = Math.round(Math.min(76, vh * 0.11));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fillRect(0, 0, vw, barH);
      ctx.fillRect(0, vh - barH, vw, barH);

      const titleAlpha = t < 2.35 ? 0 : Math.min(1, (t - 2.35) / 0.45);
      if (titleAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = titleAlpha;
        ctx.textAlign = 'center';
        ctx.font = '800 30px "Outfit", sans-serif';
        ctx.fillStyle = spec.accentColor;
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 14;
        ctx.fillText(
          `${spec.name.toUpperCase()} KAZANDI`,
          cx,
          vh - barH / 2 + 10
        );
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [killerId, lastVictimName, onComplete, spec.accentColor, spec.name, victimSpec]);

  return (
    <div
      onClick={onComplete}
      className="fixed inset-0 z-50 bg-black cursor-pointer select-none"
      role="dialog"
      aria-label={`${spec.name} kazanma animasyonu`}
    >
      <canvas ref={canvasRef} className="block w-screen h-screen" />
      <div className="fixed bottom-3 right-5 text-[11px] font-mono text-slate-500/80 pointer-events-none">
        Geçmek için tıkla
      </div>
    </div>
  );
}
