import { useEffect, useRef } from 'react';
import { KillerId } from '../game/types';
import { KILLERS } from '../game/constants';

interface KillerWinCinematicProps {
  killerId: KillerId;
  onComplete: () => void;
}

const WIN_QUOTES: Record<KillerId, string> = {
  jumper: 'Karanlıktan süzüldü... kimse kaçamadı.',
  juggernaut: 'Demir ve kan. Tüm direniş ezildi.',
  smile: 'Tebessüm karanlığı yuttu.',
  hungry: 'Ziyafet sona erdi.',
  sawblooder: 'Testere sustu. Hayatta kalan yok.',
  darkness: 'Gölgeler tüm ışığı biçti.',
};

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

export function KillerWinCinematic({ killerId, onComplete }: KillerWinCinematicProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const completedRef = useRef(false);
  const spec = KILLERS[killerId];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    completedRef.current = false;
    let raf = 0;
    const start = performance.now();
    const TOTAL_DURATION = 3.9;

    const particles = Array.from({ length: 56 }, (_, i) => ({
      angle: (i / 56) * Math.PI * 2 + (i % 7) * 0.14,
      speed: 0.4 + ((i * 37) % 100) / 80,
      size: 2.4 + (i % 5) * 1.4,
      seed: (i * 23) % 100,
    }));

    const dustMotes = Array.from({ length: 28 }, (_, i) => ({
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
      const baseScale = Math.min(vw / 560, vh / 380) * 1.32;

      let shakeX = 0;
      let shakeY = 0;
      if (killerId === 'jumper' && t > 1.1 && t < 2.2) {
        const dec = 1 - (t - 1.1) / 1.1;
        shakeX = (Math.random() - 0.5) * 26 * dec;
        shakeY = (Math.random() - 0.5) * 26 * dec;
      } else if (killerId === 'juggernaut' && t > 1.45 && t < 2.35) {
        const dec = 1 - (t - 1.45) / 0.9;
        shakeX = (Math.random() - 0.5) * 34 * dec;
        shakeY = (Math.random() - 0.5) * 30 * dec;
      } else if (killerId === 'hungry' && t > 1.35 && t < 2.15) {
        const dec = 1 - (t - 1.35) / 0.8;
        shakeX = (Math.random() - 0.5) * 28 * dec;
        shakeY = (Math.random() - 0.5) * 22 * dec;
      } else if (killerId === 'sawblooder' && t > 1.0 && t < 2.65) {
        shakeX = (Math.random() - 0.5) * 15;
        shakeY = (Math.random() - 0.5) * 15;
      } else if (killerId === 'darkness' && t > 1.45 && t < 2.25) {
        const dec = 1 - (t - 1.45) / 0.8;
        shakeX = (Math.random() - 0.5) * 24 * dec;
        shakeY = (Math.random() - 0.5) * 22 * dec;
      }

      // 1. Pitch dark backdrop + killer atmospheric glow
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
        bgGrad.addColorStop(0, 'rgba(225, 29, 72, 0.25)');
        bgGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.22)');
      } else if (killerId === 'darkness') {
        bgGrad.addColorStop(0, 'rgba(124, 58, 237, 0.36)');
        bgGrad.addColorStop(0.5, 'rgba(30, 27, 75, 0.26)');
      } else {
        bgGrad.addColorStop(0, 'rgba(185, 28, 28, 0.35)');
        bgGrad.addColorStop(0.5, 'rgba(69, 10, 10, 0.2)');
      }
      bgGrad.addColorStop(1, 'rgba(2, 3, 6, 0.98)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, vw, vh);

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Ambient dust motes
      for (const m of dustMotes) {
        const mx = ((m.x + t * m.speed * 0.35) % 1) * vw;
        const my = ((m.y - t * m.speed * 0.2 + 2) % 1) * vh;
        ctx.fillStyle = `rgba(226, 232, 240, ${0.12 + Math.sin(t * 2 + m.phase) * 0.08})`;
        ctx.beginPath();
        ctx.arc(mx, my, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // =====================================================================
      // 1. JUMPER: Stalk -> Supersonic Pounce -> Screen Claw Slash
      // =====================================================================
      if (killerId === 'jumper') {
        if (t >= 0.75 && t < 1.5) {
          const lp = Math.min(1, (t - 0.75) / 0.35);
          ctx.strokeStyle = `rgba(245, 158, 11, ${lp * 0.35})`;
          ctx.lineWidth = 2;
          for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            const r1 = Math.min(vw, vh) * (0.16 + (1 - lp) * 0.14);
            const r2 = Math.max(vw, vh) * 0.75;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
            ctx.stroke();
          }
        }

        const leapP = t < 0.75 ? 0 : Math.min(1, (t - 0.75) / 0.38);
        const jScale = baseScale * (0.52 + easeOutCubic(leapP) * 2.1);
        const jy = cy - 45 + easeOutCubic(leapP) * 35;

        ctx.save();
        ctx.translate(cx, jy);
        ctx.scale(jScale, jScale);

        const legTwitch = Math.sin(t * 22) * 0.25;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          for (let i = -1; i <= 1; i++) {
            const a = side * (Math.PI * 0.45 + i * 0.36);
            const sw = legTwitch * side;
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
            ctx.lineTo(Math.cos(a + sw) * 30, Math.sin(a + sw) * 25);
            ctx.lineTo(Math.cos(a + sw * 1.4) * 46, Math.sin(a + sw * 1.4) * 36);
            ctx.stroke();
          }
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(side * 12, -10);
          ctx.quadraticCurveTo(side * 30, -24, side * 10, -40);
          ctx.stroke();
        }
        ctx.fillStyle = '#1c1917';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 12, 18, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.ellipse(0, -6, 22, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(-8, -14, 4.2, 0, Math.PI * 2);
        ctx.arc(8, -14, 4.2, 0, Math.PI * 2);
        ctx.arc(-14, -8, 2.5, 0, Math.PI * 2);
        ctx.arc(14, -8, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();

        if (t >= 1.1) {
          const sp = Math.min(1, (t - 1.1) / 0.25);
          const fade = t > 2.2 ? Math.max(0, 1 - (t - 2.2) / 0.8) : 1;
          ctx.save();
          ctx.globalAlpha = fade;
          for (let s = -1; s <= 1; s++) {
            const offset = s * 36;
            const x1 = cx - vw * 0.36;
            const y1 = cy - vh * 0.36 + offset;
            const x2 = x1 + vw * 0.72 * easeOutCubic(sp);
            const y2 = y1 + vh * 0.72 * easeOutCubic(sp);
            ctx.strokeStyle = 'rgba(220, 38, 38, 0.9)';
            ctx.lineWidth = 18 - Math.abs(s) * 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 6 - Math.abs(s);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // =====================================================================
      // 2. JUGGERNAUT: Heavy Stomp -> Overhead Raise -> Cataclysmic Ground Slam
      // =====================================================================
      else if (killerId === 'juggernaut') {
        const marchP = Math.min(1, t / 0.9);
        const raiseP = t < 0.9 ? 0 : Math.min(1, (t - 0.9) / 0.52);
        const slamP = t < 1.42 ? 0 : Math.min(1, (t - 1.42) / 0.16);
        const postT = Math.max(0, t - 1.56);

        const stompBounce = t < 0.9 ? Math.abs(Math.sin(t * 7)) * 14 : 0;
        const jScale = baseScale * (0.75 + marchP * 0.7 + slamP * 0.35);
        const fistRaise = easeInOutQuad(raiseP) * (1 - easeOutCubic(slamP));

        ctx.save();
        ctx.translate(cx, cy - 20 - stompBounce + slamP * 28);
        ctx.scale(jScale, jScale);

        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(0, -10, 9, 0, Math.PI * 2);
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

        const fistY = 12 - fistRaise * 56 + slamP * 26;
        const fistX = 42 - slamP * 14;
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * fistX, fistY);
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = slamP > 0.5 ? '#fca5a5' : '#dc2626';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(-14, -12, 28, 24, 6);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();

        if (t >= 1.45) {
          const shockP = Math.min(1, postT / 1.1);
          const impactY = cy + 60 * baseScale;
          const flash = postT < 0.18 ? 1 - postT / 0.18 : 0;
          if (flash > 0) {
            ctx.fillStyle = `rgba(220, 38, 38, ${flash * 0.35})`;
            ctx.fillRect(0, 0, vw, vh);
          }

          for (let r = 0; r < 3; r++) {
            const rp = Math.max(0, Math.min(1, (postT - r * 0.12) / 0.9));
            if (rp > 0 && rp < 1) {
              ctx.strokeStyle = r === 0 ? `rgba(252, 165, 165, ${1 - rp})` : `rgba(220, 38, 38, ${(1 - rp) * 0.85})`;
              ctx.lineWidth = (10 - r * 3) * (1 - rp);
              ctx.beginPath();
              ctx.ellipse(cx, impactY, 40 + rp * vw * 0.55, 16 + rp * vh * 0.25, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
          }

          ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0, 0.85 - shockP * 0.5)})`;
          ctx.lineWidth = 3.5;
          for (let c = 0; c < 10; c++) {
            const ca = (c / 10) * Math.PI * 2 + 0.18;
            const clen = Math.min(1, postT / 0.25) * Math.max(vw, vh) * 0.45;
            ctx.beginPath();
            ctx.moveTo(cx, impactY);
            ctx.lineTo(cx + Math.cos(ca) * clen * 0.5, impactY + Math.sin(ca) * clen * 0.28);
            ctx.lineTo(cx + Math.cos(ca + 0.1) * clen, impactY + Math.sin(ca + 0.1) * clen * 0.52);
            ctx.stroke();
          }

          const pT = Math.min(1, postT / 1.8);
          for (const pt of particles) {
            const px = cx + Math.cos(pt.angle) * (pT * vw * 0.5 * pt.speed);
            const py = impactY + Math.sin(pt.angle) * (pT * vh * 0.32 * pt.speed) - Math.sin(pT * Math.PI) * 110;
            ctx.fillStyle = pt.seed % 2 === 0 ? '#fca5a5' : '#ef4444';
            ctx.globalAlpha = Math.max(0, 1 - pT);
            ctx.beginPath();
            ctx.arc(px, py, pt.size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      // =====================================================================
      // 3. SMILE: Darkness Looms -> Glowing Crimson Smile Widens -> Void Engulfs
      // =====================================================================
      else if (killerId === 'smile') {
        const emergeP = Math.min(1, t / 1.0);
        const grinP = t < 0.7 ? 0 : Math.min(1, (t - 0.7) / 1.2);
        const lungeP = t < 1.9 ? 0 : Math.min(1, (t - 1.9) / 0.5);

        const orbitR = Math.min(vw, vh) * (0.28 - easeOutCubic(emergeP) * 0.04 + Math.sin(t * 4) * 0.015);
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * Math.PI * 2 + t * (1.8 + grinP * 2.4);
          const ox = cx + Math.cos(a) * orbitR;
          const oy = cy + Math.sin(a) * orbitR * 0.68;
          ctx.fillStyle = '#020617';
          ctx.strokeStyle = '#e11d48';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(ox, oy, 14 * (baseScale * 0.7), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        const sScale = baseScale * (0.9 + easeOutCubic(emergeP) * 0.9 + easeOutBack(lungeP) * 0.95);
        ctx.save();
        ctx.translate(cx, cy - 10);
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
          ctx.ellipse(sx, -12, 5, 4, sx < 0 ? 0.25 : -0.25, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        const grinSpan = 0.25 + easeOutCubic(grinP) * 1.1;
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
            ctx.moveTo(tx - 2.5, ty - 4);
            ctx.lineTo(tx, ty + 6 * Math.min(1, grinP * 1.3));
            ctx.lineTo(tx + 2.5, ty - 4);
            ctx.fill();
          }
        }
        ctx.restore();

        if (lungeP > 0) {
          ctx.fillStyle = `rgba(225, 29, 72, ${(1 - lungeP) * 0.26})`;
          ctx.fillRect(0, 0, vw, vh);
        }
      }

      // =====================================================================
      // 4. HUNGRY: Butcher Approaches -> Raises Giant Cleaver -> Massive Slash & Blood
      // =====================================================================
      else if (killerId === 'hungry') {
        const approachP = Math.min(1, t / 0.85);
        const windupP = t < 0.85 ? 0 : Math.min(1, (t - 0.85) / 0.45);
        const cleaveP = t < 1.3 ? 0 : Math.min(1, (t - 1.3) / 0.25);

        const hScale = baseScale * (0.9 + approachP * 0.72 + cleaveP * 0.32);
        ctx.save();
        ctx.translate(cx, cy - 10);
        ctx.scale(hScale, hScale);

        const chomp = Math.abs(Math.sin(t * 10));
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
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(-17, -17, 4.5, 0, Math.PI * 2);
        ctx.arc(17, -17, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.save();
        const bladeAngle = -0.5 - easeInOutQuad(windupP) * 1.45 + easeOutCubic(cleaveP) * 3.2;
        ctx.translate(36, 10);
        ctx.rotate(bladeAngle);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-8, -5, 22, 10);
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, -8);
        ctx.lineTo(66, -22);
        ctx.lineTo(66, 16);
        ctx.lineTo(14, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(22, 8, 40, 5);
        ctx.restore();
        ctx.restore();

        if (t >= 1.32) {
          const postT = t - 1.32;
          const sp = Math.min(1, postT / 0.25);
          const sweepR = Math.min(vw, vh) * 0.42;
          const fade = Math.max(0, 1 - postT / 1.2);
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 28;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.2, -1.2 + easeOutCubic(sp) * 2.5);
          ctx.stroke();
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.2, -1.2 + easeOutCubic(sp) * 2.5);
          ctx.stroke();
          ctx.restore();

          const dp = Math.min(1, postT / 1.9);
          for (const pt of particles) {
            const dist = dp * Math.max(vw, vh) * 0.54 * pt.speed;
            const px = cx + Math.cos(pt.angle) * dist;
            const py = cy + Math.sin(pt.angle) * dist + dp * dp * 120;
            ctx.fillStyle = pt.seed % 2 === 0 ? '#ef4444' : '#991b1b';
            ctx.globalAlpha = Math.max(0, 1 - dp * 0.8);
            ctx.beginPath();
            ctx.arc(px, py, pt.size * 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      // =====================================================================
      // 5. SAWBLOODER: Pulls Cord -> Chainsaw Roars & Sparks Fly -> Lunge Sweep
      // =====================================================================
      else if (killerId === 'sawblooder') {
        const revP = t < 0.9 ? 0 : Math.min(1, (t - 0.9) / 0.45);
        const lungeP = t < 1.55 ? 0 : Math.min(1, (t - 1.55) / 0.65);

        const fScale = baseScale * (0.95 + Math.min(1, t / 0.8) * 0.55 + lungeP * 0.35);
        ctx.save();
        ctx.translate(cx, cy - 10);
        ctx.scale(fScale, fScale);

        const sawVibe = t > 0.7 ? Math.sin(t * 60) * 3 : 0;

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
        const sawAngle = -0.35 + Math.sin(revP * Math.PI * 3) * 0.14 - easeOutCubic(lungeP) * 1.7;
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

        if (t > 0.8) {
          ctx.fillStyle = '#fef08a';
          for (let s = 0; s < 8; s++) {
            const sx = 28 + Math.random() * 54;
            const sy = (Math.random() - 0.5) * 26;
            ctx.fillRect(sx, sy, 3.2, 3.2);
          }
        }
        ctx.restore();
        ctx.restore();

        if (t >= 1.0 && t < 2.9) {
          const spT = Math.min(1, (t - 1.0) / 1.5);
          for (const pt of particles) {
            const px = cx + Math.cos(pt.angle) * (spT * vw * 0.45 * pt.speed);
            const py = cy + Math.sin(pt.angle) * (spT * vh * 0.4 * pt.speed) + spT * spT * 90;
            ctx.fillStyle = pt.seed % 3 === 0 ? '#fef08a' : '#ef4444';
            ctx.globalAlpha = Math.max(0, 1 - spT * 0.9);
            ctx.fillRect(px - 2, py - 2, 4, 4);
          }
          ctx.globalAlpha = 1;
        }
      }

      // =====================================================================
      // 6. DARKNESS: Emerges from Void Mist -> Spinning Scythe Reap -> Purple Crescent
      // =====================================================================
      else {
        const emergeP = Math.min(1, t / 0.95);
        const reapP = t < 1.35 ? 0 : Math.min(1, (t - 1.35) / 0.35);

        const dScale = baseScale * (0.85 + easeOutCubic(emergeP) * 0.72 + reapP * 0.3);
        ctx.save();
        ctx.translate(cx, cy - 14);
        ctx.scale(dScale, dScale);

        for (let w = 0; w < 8; w++) {
          const wa = (w / 8) * Math.PI * 2 + t * 2.6;
          ctx.fillStyle = 'rgba(124, 58, 237, 0.3)';
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
        const scytheAng = -0.9 + easeOutCubic(reapP) * 3.1;
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

        if (t >= 1.38) {
          const postT = t - 1.38;
          const sp = Math.min(1, postT / 0.3);
          const sweepR = Math.min(vw, vh) * 0.44;
          const fade = Math.max(0, 1 - postT / 1.25);
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.strokeStyle = '#7c3aed';
          ctx.lineWidth = 24;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.4, -1.4 + easeOutCubic(sp) * 2.8);
          ctx.stroke();
          ctx.strokeStyle = '#e9d5ff';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.4, -1.4 + easeOutCubic(sp) * 2.8);
          ctx.stroke();
          ctx.restore();

          for (const pt of particles) {
            const dp = Math.min(1, postT / 1.6);
            const dist = dp * pt.speed * Math.min(vw, vh) * 0.45;
            ctx.fillStyle = pt.seed % 2 === 0 ? '#a855f7' : '#e9d5ff';
            ctx.globalAlpha = Math.max(0, 1 - dp);
            ctx.beginPath();
            ctx.arc(cx + Math.cos(pt.angle) * dist, cy + Math.sin(pt.angle) * dist, pt.size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();

      // Letterbox bars + classic killer win title & quote
      const barH = Math.round(Math.min(78, vh * 0.11));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fillRect(0, 0, vw, barH);
      ctx.fillRect(0, vh - barH, vw, barH);

      const titleAlpha = t < 2.15 ? 0 : Math.min(1, (t - 2.15) / 0.45);
      if (titleAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = titleAlpha;
        ctx.textAlign = 'center';
        ctx.font = '800 30px "Outfit", sans-serif';
        ctx.fillStyle = spec.accentColor;
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 14;
        ctx.fillText(`${spec.name.toUpperCase()} KAZANDI`, cx, vh - barH / 2 - 4);
        ctx.font = '500 13px "Inter", sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.shadowBlur = 0;
        ctx.fillText(WIN_QUOTES[killerId], cx, vh - barH / 2 + 18);
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [killerId, onComplete, spec.accentColor, spec.name]);

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
