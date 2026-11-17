import { useEffect, useRef } from 'react';
import { KillerId } from '../game/types';
import { KILLERS } from '../game/constants';

interface KillerPreviewProps {
  killerId: KillerId;
  size?: number;
}

export function KillerPreview({ killerId, size = 96 }: KillerPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const elapsed = (now - start) / 1000;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate(-Math.PI / 5 + Math.sin(elapsed * 1.4) * 0.12);
      const scale = size / 96;
      ctx.scale(scale, scale);

      const walk = Math.sin(elapsed * 5) * 0.4;

      if (killerId === 'jumper') {
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          for (let i = -1; i <= 1; i++) {
            const a = side * (Math.PI * 0.48 + i * 0.44);
            const sw = walk * 0.25 * side;
            const jx = Math.cos(a + sw) * 24;
            const jy = Math.sin(a + sw) * 24;
            const tipX = Math.cos(a + sw * 1.3) * 36;
            const tipY = Math.sin(a + sw * 1.3) * 36;
            ctx.strokeStyle = '#292524';
            ctx.lineWidth = 4.8;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
            ctx.lineTo(jx, jy);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();

            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.arc(tipX, tipY, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.fillStyle = '#09090b';
        ctx.strokeStyle = '#991b1b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(-14, 0, 15, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1c1917';
        ctx.strokeStyle = '#b45309';
        ctx.beginPath();
        ctx.ellipse(5, 0, 20, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e7e5e4';
        for (let s = -9; s <= 5; s += 7) {
          ctx.beginPath();
          ctx.moveTo(s, -5);
          ctx.lineTo(s + 5, 0);
          ctx.lineTo(s, 5);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(16, -6, 4.5, 0, Math.PI * 2);
        ctx.arc(16, 6, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(17, -6, 2.8, 0, Math.PI * 2);
        ctx.arc(17, 6, 2.8, 0, Math.PI * 2);
        ctx.arc(12, -10, 1.8, 0, Math.PI * 2);
        ctx.arc(12, 10, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (killerId === 'juggernaut') {
        ctx.fillStyle = '#1c1917';
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 2.2;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.roundRect(10 + side * walk * 4, side * 19 - 7, 19, 14, 4);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = '#09090b';
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#57534e';
        ctx.stroke();

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-6, -8);
        ctx.lineTo(4, 0);
        ctx.lineTo(-2, 8);
        ctx.stroke();

        ctx.fillStyle = '#d6d3d1';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(6, side * 10);
          ctx.quadraticCurveTo(18, side * 20, 25, side * 12);
          ctx.quadraticCurveTo(15, side * 12, 10, side * 7);
          ctx.fill();
        }
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(14, -6, 3.5, 4);
        ctx.fillRect(14, 2, 3.5, 4);
      } else if (killerId === 'smile') {
        for (let t = 0; t < 6; t++) {
          const a = (t / 6) * Math.PI * 2 + elapsed * 2.2;
          ctx.fillStyle = '#020617';
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 24, Math.sin(a) * 24, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 21, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#991b1b';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(5, 0, 14, -Math.PI * 0.45, Math.PI * 0.45);
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        for (let ta = -0.38; ta <= 0.38; ta += 0.16) {
          const tx = 5 + Math.cos(ta) * 14;
          const ty = Math.sin(ta) * 14;
          ctx.beginPath();
          ctx.moveTo(tx - 1.5, ty - 1.5);
          ctx.lineTo(tx + 2.8, ty);
          ctx.lineTo(tx - 1.5, ty + 1.5);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = '#ff2a55';
        ctx.beginPath();
        ctx.arc(9, -7.5, 2.2, 0, Math.PI * 2);
        ctx.arc(9, 7.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (killerId === 'hungry') {
        ctx.save();
        ctx.translate(12, 18);
        ctx.rotate(walk * 0.2);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(6, -5, 22, 12);
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(10, 4, 18, 3.5);
        ctx.restore();

        ctx.fillStyle = '#450a0a';
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 23, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#050505';
        ctx.strokeStyle = '#991b1b';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(8, 0, 10, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fef2f2';
        for (let fy = -10; fy <= 10; fy += 5) {
          ctx.beginPath();
          ctx.moveTo(3, fy - 1.8);
          ctx.lineTo(9, fy);
          ctx.lineTo(3, fy + 1.8);
          ctx.fill();
        }

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(6, -11, 2.6, 0, Math.PI * 2);
        ctx.arc(6, 11, 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (killerId === 'sawblooder') {
        ctx.fillStyle = '#450a0a';
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1c100d';
        ctx.beginPath();
        ctx.roundRect(-7, -12, 16, 24, 3);
        ctx.fill();

        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.arc(2, -4, 4.5, 0, Math.PI * 2);
        ctx.arc(4, 5, 5.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#291a14';
        ctx.beginPath();
        ctx.arc(3, 0, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(7, -4, 3.4, 0, Math.PI * 2);
        ctx.arc(7, 4, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(8, -4, 2, 0, Math.PI * 2);
        ctx.arc(8, 4, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(10, 0);
        ctx.rotate(walk * 0.15);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-2, -6, 12, 12);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(1, -4, 2, 8);
        ctx.fillStyle = '#64748b';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(10, -3.5);
        ctx.lineTo(26, -2.5);
        ctx.arc(26, 0, 2.5, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(10, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(14, -2.5, 12, 5);
        ctx.restore();
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [killerId, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      aria-label={`${KILLERS[killerId].name} canavar önizlemesi`}
      className="shrink-0"
    />
  );
}
