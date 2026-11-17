import { useEffect, useRef } from 'react';
import { KillerId } from '../game/types';
import { KILLERS } from '../game/constants';

interface KillerWinCinematicProps {
  killerId: KillerId;
  onComplete: () => void;
}

const WIN_QUOTES: Record<KillerId, string> = {
  jumper: 'KARANLIKTAN SIÇRADI — KİMSE KAÇAMADI',
  juggernaut: 'ÇELİK VE ÖFKE TÜM ENGELLERİ EZDİ',
  smile: 'KARANLIKTAKİ TEBESSÜM SON SÖZÜ SÖYLEDİ',
  hungry: 'AV TAMAMLANDI — KASABIN SATIRI DOYMADI',
  sawblooder: 'TESTERE KÜKREDİ — KİMSE KURTULAMADI',
};

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
}

function easeInOutQuad(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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
    const TOTAL_DURATION = 3.8; // Full-screen animation before summary modal appears

    // Deterministic particles for debris / embers / blood drops
    const particles = Array.from({ length: 48 }, (_, i) => ({
      angle: (i / 48) * Math.PI * 2 + (i % 5) * 0.17,
      speed: 0.4 + ((i * 37) % 100) / 85,
      size: 2.5 + (i % 5) * 1.4,
      offset: (i * 19) % 100,
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
      const baseScale = Math.min(vw / 520, vh / 360) * 1.35;

      // Pitch black base with killer-colored atmospheric vignette
      ctx.fillStyle = '#030407';
      ctx.fillRect(0, 0, vw, vh);

      const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(vw, vh) * 0.72);
      if (killerId === 'jumper') {
        bgGrad.addColorStop(0, 'rgba(180, 83, 9, 0.28)');
        bgGrad.addColorStop(0.55, 'rgba(69, 26, 3, 0.16)');
      } else if (killerId === 'juggernaut') {
        bgGrad.addColorStop(0, 'rgba(220, 38, 38, 0.34)');
        bgGrad.addColorStop(0.55, 'rgba(30, 41, 59, 0.22)');
      } else if (killerId === 'smile') {
        bgGrad.addColorStop(0, 'rgba(225, 29, 72, 0.26)');
        bgGrad.addColorStop(0.55, 'rgba(15, 23, 42, 0.25)');
      } else {
        bgGrad.addColorStop(0, 'rgba(185, 28, 28, 0.38)');
        bgGrad.addColorStop(0.55, 'rgba(69, 10, 10, 0.2)');
      }
      bgGrad.addColorStop(1, 'rgba(2, 3, 6, 0.96)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, vw, vh);

      // Compute screen shake per killer climax
      let shakeX = 0;
      let shakeY = 0;
      if (killerId === 'jumper' && t >= 1.35 && t < 1.95) {
        const dec = 1 - (t - 1.35) / 0.6;
        shakeX = (Math.random() - 0.5) * 26 * dec;
        shakeY = (Math.random() - 0.5) * 20 * dec;
      } else if (killerId === 'juggernaut') {
        if ((t > 0.35 && t < 0.5) || (t > 0.8 && t < 0.95)) {
          shakeY = (Math.random() - 0.5) * 10;
        } else if (t >= 1.7 && t < 2.5) {
          const dec = 1 - (t - 1.7) / 0.8;
          shakeX = (Math.random() - 0.5) * 34 * dec;
          shakeY = (Math.random() - 0.5) * 28 * dec;
        }
      } else if (killerId === 'smile' && t >= 2.0 && t < 2.65) {
        const dec = 1 - (t - 2.0) / 0.65;
        shakeX = (Math.random() - 0.5) * 14 * dec;
        shakeY = (Math.random() - 0.5) * 14 * dec;
      } else if (killerId === 'hungry' && t >= 1.75 && t < 2.45) {
        const dec = 1 - (t - 1.75) / 0.7;
        shakeX = (Math.random() - 0.5) * 30 * dec;
        shakeY = (Math.random() - 0.5) * 24 * dec;
      } else if (killerId === 'sawblooder' && t >= 1.45 && t < 2.35) {
        const dec = 1 - (t - 1.45) / 0.9;
        shakeX = (Math.random() - 0.5) * 32 * dec;
        shakeY = (Math.random() - 0.5) * 26 * dec;
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // =====================================================================
      // 1. JUMPER CINEMATIC: Stalking Eyes -> Supersonic Pounce -> Quad Claw Tear
      // =====================================================================
      if (killerId === 'jumper') {
        const stalkP = Math.min(1, t / 0.85);
        const leapP = t < 0.85 ? 0 : Math.min(1, (t - 0.85) / 0.52);
        const slashP = t < 1.32 ? 0 : Math.min(1, (t - 1.32) / 0.38);

        // Radial speed lines during pounce
        if (leapP > 0 && t < 1.85) {
          const alpha = t < 1.37 ? leapP : Math.max(0, 1 - (t - 1.37) / 0.48);
          ctx.strokeStyle = `rgba(245, 158, 11, ${alpha * 0.45})`;
          ctx.lineWidth = 2.5;
          for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            const r1 = Math.min(vw, vh) * (0.14 + (1 - leapP) * 0.12);
            const r2 = Math.max(vw, vh) * 0.75;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
            ctx.stroke();
          }
        }

        // Monster scale & crouch offset
        const monsterScale =
          baseScale *
          (t < 0.85
            ? 0.55 + stalkP * 0.2 - Math.sin(stalkP * Math.PI) * 0.14
            : 0.75 + easeOutCubic(leapP) * 1.95);
        const monsterY =
          cy + (t < 0.85 ? 36 * (1 - stalkP * 0.3) : 25 - easeOutCubic(leapP) * 35);

        // Ghostly afterimages during leap
        if (leapP > 0.05 && leapP < 0.98) {
          for (let g = 1; g <= 3; g++) {
            const gs = monsterScale * (1 - g * 0.14);
            ctx.save();
            ctx.globalAlpha = 0.22 / g;
            ctx.translate(cx, monsterY + g * 18);
            ctx.scale(gs, gs);
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.ellipse(0, 0, 26, 20, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // Jumper full detailed body
        ctx.save();
        ctx.translate(cx, monsterY);
        ctx.scale(monsterScale, monsterScale);
        const legTwitch = t < 0.85 ? Math.sin(t * 24) * 0.18 : Math.sin(t * 10) * 0.32;

        // 6 huge razor legs + front scythe claws reaching forward!
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

          // Front scythe-claws
          const clawReach = leapP > 0 ? easeOutCubic(leapP) * 16 : 0;
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(side * 12, -10);
          ctx.quadraticCurveTo(side * (30 + clawReach), -28 - clawReach, side * (10 + clawReach * 0.4), -38 - clawReach);
          ctx.stroke();
        }

        // Segmented abdomen & thorax
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

        // 4 glowing predator eyes
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

        // Screen-wide glowing 4-claw slash tear!
        if (slashP > 0) {
          const flash = t < 1.55 ? 1 - (t - 1.32) / 0.23 : 0;
          if (flash > 0) {
            ctx.fillStyle = `rgba(251, 191, 36, ${flash * 0.22})`;
            ctx.fillRect(0, 0, vw, vh);
          }

          for (let s = -1.5; s <= 1.5; s += 1) {
            const off = s * Math.min(vw, vh) * 0.085;
            const x1 = vw * 0.16 + off * 0.6;
            const y1 = vh * 0.14 - off * 0.4;
            const x2 = x1 + (vw * 0.68) * easeOutCubic(slashP);
            const y2 = y1 + (vh * 0.72) * easeOutCubic(slashP);

            // Outer crimson blood gash
            ctx.strokeStyle = 'rgba(220, 38, 38, 0.85)';
            ctx.lineWidth = 18 - Math.abs(s) * 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Inner molten amber-white slash core
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 7 - Math.abs(s);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }

          // Flying golden sparks & crimson droplets
          const dp = (t - 1.32) / 2.2;
          for (const pt of particles) {
            const r = dp * Math.max(vw, vh) * 0.48 * pt.speed;
            const px = cx + Math.cos(pt.angle) * r;
            const py = cy + Math.sin(pt.angle) * r + dp * dp * 90;
            ctx.fillStyle = pt.offset % 2 === 0 ? '#ef4444' : '#fbbf24';
            ctx.globalAlpha = Math.max(0, 1 - dp * 0.85);
            ctx.beginPath();
            ctx.arc(px, py, pt.size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      // =====================================================================
      // 2. JUGGERNAUT CINEMATIC: Heavy March -> Titan Fist Raise -> Cataclysmic Slam
      // =====================================================================
      else if (killerId === 'juggernaut') {
        const marchP = Math.min(1, t / 1.0);
        const raiseP = t < 0.85 ? 0 : Math.min(1, (t - 0.85) / 0.75);
        const slamT = 1.72;
        const slamP = t < slamT ? 0 : Math.min(1, (t - slamT) / 1.4);

        // Ground crater, fissures & expanding crimson shockwaves on slam!
        if (t >= slamT) {
          const flash = t < slamT + 0.25 ? 1 - (t - slamT) / 0.25 : 0;
          if (flash > 0) {
            ctx.fillStyle = `rgba(220, 38, 38, ${flash * 0.35})`;
            ctx.fillRect(0, 0, vw, vh);
          }

          // 3 huge expanding shockwave rings
          for (let r = 0; r < 3; r++) {
            const rp = Math.max(0, Math.min(1, (t - slamT - r * 0.14) / 1.1));
            if (rp > 0 && rp < 1) {
              ctx.strokeStyle = r === 0 ? `rgba(248, 113, 113, ${1 - rp})` : `rgba(220, 38, 38, ${(1 - rp) * 0.8})`;
              ctx.lineWidth = (10 - r * 2.5) * (1 - rp);
              ctx.beginPath();
              ctx.ellipse(
                cx,
                cy + vh * 0.12,
                60 + rp * vw * 0.65,
                25 + rp * vh * 0.32,
                0,
                0,
                Math.PI * 2
              );
              ctx.stroke();
            }
          }

          // Glowing tectonic floor fractures radiating across full screen
          const crackAlpha = Math.max(0.25, 1 - slamP * 0.45);
          ctx.strokeStyle = `rgba(239, 68, 68, ${crackAlpha})`;
          ctx.lineWidth = 3.5;
          for (let c = 0; c < 10; c++) {
            const ca = (c / 10) * Math.PI * 2 + 0.18;
            const maxLen = Math.max(vw, vh) * 0.55 * easeOutCubic(Math.min(1, slamP * 2.5));
            ctx.beginPath();
            ctx.moveTo(cx, cy + vh * 0.1);
            const midX = cx + Math.cos(ca + 0.09) * maxLen * 0.5;
            const midY = cy + vh * 0.1 + Math.sin(ca + 0.09) * maxLen * 0.35;
            ctx.lineTo(midX, midY);
            ctx.lineTo(
              cx + Math.cos(ca - 0.06) * maxLen,
              cy + vh * 0.1 + Math.sin(ca - 0.06) * maxLen * 0.7
            );
            ctx.stroke();
          }

          // Flying steel & magma embers
          for (const pt of particles) {
            const pT = Math.min(1, (t - slamT) / 1.8);
            const px = cx + Math.cos(pt.angle) * (pT * vw * 0.52 * pt.speed);
            const py = cy + vh * 0.08 + Math.sin(pt.angle) * (pT * vh * 0.4 * pt.speed) - Math.sin(pT * Math.PI) * 95;
            ctx.fillStyle = pt.offset % 2 === 0 ? '#fca5a5' : '#ef4444';
            ctx.globalAlpha = Math.max(0, 1 - pT);
            ctx.beginPath();
            ctx.arc(px, py, pt.size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        // Juggernaut towering armored body
        const stompBounce = t < 1.0 ? Math.abs(Math.sin(t * 7.5)) * 12 : 0;
        const slamDrop =
          t < slamT
            ? -easeInOutQuad(raiseP) * 45
            : -45 + easeOutCubic(Math.min(1, (t - slamT) / 0.14)) * 75;
        const jScale = baseScale * (0.85 + marchP * 0.55 + (t >= slamT ? 0.25 : 0));

        ctx.save();
        ctx.translate(cx, cy - stompBounce + slamDrop * 0.55);
        ctx.scale(jScale, jScale);

        // Obsidian armored torso + pauldrons
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Molten crimson armor chest vents
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-18, -6);
        ctx.lineTo(-8, 14);
        ctx.moveTo(18, -6);
        ctx.lineTo(8, 14);
        ctx.stroke();

        // Glowing crimson core eye
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(0, -10, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fecaca';
        ctx.beginPath();
        ctx.arc(0, -10, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Twin curved ivory-steel horns
        ctx.fillStyle = '#e2e8f0';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * 14, -20);
          ctx.quadraticCurveTo(side * 38, -42, side * 44, -18);
          ctx.quadraticCurveTo(side * 28, -24, side * 18, -12);
          ctx.fill();
        }

        // Giant spiked gauntlets raising & slamming together!
        const fistRaiseY =
          t < slamT
            ? 10 - easeInOutQuad(raiseP) * 52
            : -42 + easeOutCubic(Math.min(1, (t - slamT) / 0.14)) * 66;
        const fistSpreadX =
          t < slamT
            ? 38 + easeInOutQuad(raiseP) * 10
            : 48 - easeOutCubic(Math.min(1, (t - slamT) / 0.14)) * 28;

        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * fistSpreadX, fistRaiseY);
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = t >= slamT ? '#f87171' : '#dc2626';
          ctx.lineWidth = 3.2;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = raiseP > 0 ? 16 : 6;
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
      // 3. SMILE CINEMATIC: Orbiting Void Spheres -> Shadow Tendrils -> Giant Grin
      // =====================================================================
      else if (killerId === 'smile') {
        const emergeP = Math.min(1, t / 1.1);
        const grinP = t < 0.7 ? 0 : Math.min(1, (t - 0.7) / 1.2);
        const horrorP = t < 1.9 ? 0 : Math.min(1, (t - 1.9) / 1.0);

        // Creeping shadow tendrils stretching from all 4 screen corners toward center
        ctx.strokeStyle = 'rgba(225, 29, 72, 0.35)';
        ctx.lineWidth = 4;
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2 + Math.sin(t * 1.5 + k) * 0.1;
          const reach = (0.35 + emergeP * 0.55) * Math.max(vw, vh) * 0.55;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * Math.max(vw, vh) * 0.75, cy + Math.sin(a) * Math.max(vw, vh) * 0.75);
          ctx.quadraticCurveTo(
            cx + Math.cos(a + 0.25) * reach * 0.6,
            cy + Math.sin(a + 0.25) * reach * 0.6,
            cx + Math.cos(a) * (Math.max(vw, vh) * 0.75 - reach),
            cy + Math.sin(a) * (Math.max(vw, vh) * 0.75 - reach)
          );
          ctx.stroke();
        }

        // Orbiting void spheres with ghostly trails
        const orbitR = Math.min(vw, vh) * (0.34 - easeOutCubic(emergeP) * 0.08 + Math.sin(t * 3) * 0.02);
        const orbitSpeed = 1.6 + horrorP * 2.4;
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

        // Colossal Smile Entity
        const sScale = baseScale * (0.9 + easeOutCubic(emergeP) * 0.85 + horrorP * 0.45);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sScale, sScale);

        // Eerie dark void head
        ctx.fillStyle = '#020617';
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#e11d48';
        ctx.shadowBlur = 24 + horrorP * 20;
        ctx.beginPath();
        ctx.arc(0, 0, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Flickering crimson eyes
        const eyeFlare = 1 + Math.sin(t * 14) * 0.12;
        ctx.fillStyle = '#fb7185';
        ctx.shadowColor = '#e11d48';
        ctx.shadowBlur = 18;
        for (const sx of [-13, 13]) {
          ctx.beginPath();
          ctx.ellipse(sx, -12, 5.2 * eyeFlare, 4 * eyeFlare, sx < 0 ? 0.25 : -0.25, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Giant widening porcelain razor grin + jagged fangs
        const grinSpan = 0.22 + easeOutCubic(grinP) * 1.15;
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(0, 3, 24, Math.PI * (0.5 - grinSpan * 0.42), Math.PI * (0.5 + grinSpan * 0.42));
        ctx.stroke();

        if (grinP > 0.25) {
          const toothCount = 7;
          ctx.fillStyle = '#f8fafc';
          for (let i = -3; i <= 3; i++) {
            const frac = i / ((toothCount - 1) / 2);
            const ang = Math.PI * 0.5 + frac * grinSpan * 0.36;
            const tx = Math.cos(ang) * 24;
            const ty = 3 + Math.sin(ang) * 24;
            ctx.beginPath();
            ctx.moveTo(tx - 2.6, ty - 4);
            ctx.lineTo(tx, ty + 5 * Math.min(1, grinP * 1.3));
            ctx.lineTo(tx + 2.6, ty - 4);
            ctx.fill();
          }
        }
        ctx.restore();

        // Subtle horror glitch lines during climax
        if (horrorP > 0 && Math.random() < 0.45) {
          ctx.fillStyle = 'rgba(225, 29, 72, 0.16)';
          ctx.fillRect(0, Math.random() * vh, vw, 4 + Math.random() * 14);
        }
      }

      // =====================================================================
      // 4. HUNGRY CINEMATIC: Rage Maw -> Giant Cleaver Windup -> Full-Screen Slash
      // =====================================================================
      else if (killerId === 'hungry') {
        const windupP = Math.min(1, t / 1.35);
        const cleaveT = 1.65;
        const cleaveP = t < cleaveT ? 0 : Math.min(1, (t - cleaveT) / 0.28);

        // Pulsing blood rage backdrop
        const pulse = 0.5 + 0.5 * Math.sin(t * 7);
        const rage = ctx.createRadialGradient(cx, cy, 30, cx, cy, Math.max(vw, vh) * 0.55);
        rage.addColorStop(0, `rgba(220, 38, 38, ${0.28 + pulse * 0.16})`);
        rage.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = rage;
        ctx.fillRect(0, 0, vw, vh);

        const hScale = baseScale * (0.95 + windupP * 0.55 + (t >= cleaveT ? 0.35 : 0));
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(hScale, hScale);

        const chomp = Math.abs(Math.sin(t * 9.5));

        // Bulky butcher torso
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

        // Giant snapping jaws
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

        // Glowing ferocious eyes
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(-17, -17, 4.8, 0, Math.PI * 2);
        ctx.arc(17, -17, 4.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Colossal serrated Meat Cleaver windup & execution sweep!
        ctx.save();
        const bladeAngle =
          t < cleaveT
            ? -0.45 - easeInOutQuad(windupP) * 1.15
            : -1.6 + easeOutCubic(cleaveP) * 3.15;
        ctx.translate(36, 10);
        ctx.rotate(bladeAngle);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-8, -5, 22, 10);
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, -8);
        ctx.lineTo(66, -20);
        ctx.lineTo(66, 16);
        ctx.lineTo(14, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Blood edge along cleaver
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(22, 8, 40, 5.5);
        ctx.restore();
        ctx.restore();

        // Massive full-screen crimson cleave arc + flying blood spray!
        if (t >= cleaveT) {
          const postT = t - cleaveT;
          const flash = postT < 0.22 ? 1 - postT / 0.22 : 0;
          if (flash > 0) {
            ctx.fillStyle = `rgba(220, 38, 38, ${flash * 0.34})`;
            ctx.fillRect(0, 0, vw, vh);
          }

          const arcFade = postT > 1.1 ? Math.max(0, 1 - (postT - 1.1) / 0.9) : 1;
          ctx.save();
          ctx.globalAlpha = arcFade;
          const sweepR = Math.min(vw, vh) * 0.44;
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 24;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.25, -1.25 + easeOutCubic(cleaveP) * 2.55);
          ctx.stroke();

          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.25, -1.25 + easeOutCubic(cleaveP) * 2.55);
          ctx.stroke();
          ctx.restore();

          // Blood splatter droplets across the viewport
          const dp = Math.min(1, postT / 1.9);
          for (const pt of particles) {
            const dist = dp * Math.max(vw, vh) * 0.56 * pt.speed;
            const px = cx + Math.cos(pt.angle) * dist;
            const py = cy + Math.sin(pt.angle) * dist + dp * dp * 110;
            ctx.fillStyle = pt.offset % 2 === 0 ? '#ef4444' : '#991b1b';
            ctx.globalAlpha = Math.max(0, 1 - dp * 0.75);
            ctx.beginPath();
            ctx.arc(px, py, pt.size * 1.25, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      // =====================================================================
      // 5. FLIESCHER CINEMATIC: Revving Chainsaw in Dark -> Sparks Spray -> Screen Slash
      // =====================================================================
      else if (killerId === 'sawblooder') {
        const revT = 1.45;
        const revP = Math.min(1, t / revT);
        const slashP = t < revT ? 0 : Math.min(1, (t - revT) / 0.32);

        // Dark industrial crimson background with pulse
        const pulse = 0.5 + 0.5 * Math.sin(t * 8);
        const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(vw, vh) * 0.6);
        bgGrad.addColorStop(0, `rgba(220, 38, 38, ${0.3 + pulse * 0.18})`);
        bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, vw, vh);

        const fScale = baseScale * (1.0 + (t >= revT ? 0.35 : revP * 0.2));
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(fScale, fScale);

        const sawVibe = Math.sin(t * 60) * 2.5;

        // Bulky executioner silhouette
        ctx.fillStyle = '#291814';
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Executioner helm & Glowing red eyes
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, -6, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(-8, -8, 4.5, 0, Math.PI * 2);
        ctx.arc(8, -8, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Massive Chainsaw
        ctx.save();
        const sawAngle = t < revT ? -0.3 + Math.sin(t * 22) * 0.15 : -1.4 + easeOutCubic(slashP) * 3.2;
        ctx.translate(22, 10 + sawVibe);
        ctx.rotate(sawAngle);

        // Motor block
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.fillRect(-10, -10, 24, 20);
        ctx.strokeRect(-10, -10, 24, 20);

        // Long blade
        ctx.fillStyle = '#94a3b8';
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(14, -8);
        ctx.lineTo(80, -5);
        ctx.arc(80, 0, 5, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(14, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Bloodied cutting edge
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(30, -5, 52, 10);

        // Sparks spraying from teeth
        ctx.fillStyle = '#fef08a';
        for (let s = 0; s < 6; s++) {
          const sx = 30 + Math.random() * 50;
          const sy = (Math.random() - 0.5) * 24;
          ctx.fillRect(sx, sy, 3, 3);
        }

        ctx.restore();
        ctx.restore();

        // Screen slash tear effect
        if (t >= revT) {
          const postT = t - revT;
          const flash = postT < 0.2 ? 1 - postT / 0.2 : 0;
          if (flash > 0) {
            ctx.fillStyle = `rgba(220, 38, 38, ${flash * 0.4})`;
            ctx.fillRect(0, 0, vw, vh);
          }

          ctx.save();
          const sweepR = Math.min(vw, vh) * 0.46;
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 26;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.2, -1.2 + easeOutCubic(slashP) * 2.5);
          ctx.stroke();

          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(cx, cy, sweepR, -1.2, -1.2 + easeOutCubic(slashP) * 2.5);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.restore();

      // Dramatic Cinematic Title Banner fading in after beat 1 (around t > 1.15s)
      const titleAlpha = t < 1.15 ? 0 : Math.min(1, (t - 1.15) / 0.5);
      if (titleAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = titleAlpha;

        // Top & bottom subtle cinematic letterbox bars
        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.fillRect(0, 0, vw, 64);
        ctx.fillRect(0, vh - 86, vw, 86);

        ctx.textAlign = 'center';
        ctx.font = '800 34px "Outfit", sans-serif';
        ctx.fillStyle = spec.accentColor;
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 14;
        ctx.fillText(`${spec.name.toUpperCase()} KAZANDI`, cx, vh - 44);

        ctx.shadowBlur = 0;
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(WIN_QUOTES[killerId], cx, vh - 20);
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
      <div className="fixed bottom-4 right-5 text-[11px] font-mono text-slate-400/75 pointer-events-none">
        Geçmek için tıkla
      </div>
    </div>
  );
}
