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
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          for (let i = -1; i <= 1; i++) {
            const a = side * (Math.PI * 0.48 + i * 0.42);
            const sw = walk * 0.25 * side;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
            ctx.lineTo(Math.cos(a + sw) * 24, Math.sin(a + sw) * 24);
            ctx.lineTo(Math.cos(a + sw * 1.3) * 35, Math.sin(a + sw * 1.3) * 35);
            ctx.stroke();
          }
        }
        ctx.fillStyle = '#292524';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(-14, 0, 15, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.ellipse(5, 0, 20, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(17, -6, 3.8, 0, Math.PI * 2);
        ctx.arc(17, 6, 3.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (killerId === 'juggernaut') {
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2.2;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.roundRect(10 + side * walk * 4, side * 19 - 7, 19, 14, 4);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#64748b';
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(4, 0, 6.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#e2e8f0';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(6, side * 10);
          ctx.quadraticCurveTo(18, side * 20, 25, side * 12);
          ctx.quadraticCurveTo(15, side * 12, 10, side * 7);
          ctx.fill();
        }
      } else if (killerId === 'smile') {
        for (let t = 0; t < 6; t++) {
          const a = (t / 6) * Math.PI * 2 + elapsed * 2;
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#e11d48';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 24, Math.sin(a) * 24, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = '#020617';
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 21, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(5, 0, 14, -Math.PI * 0.4, Math.PI * 0.4);
        ctx.stroke();

        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.arc(8, -7, 3.5, 0, Math.PI * 2);
        ctx.arc(8, 7, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (killerId === 'hungry') {
        ctx.save();
        ctx.translate(12, 18);
        ctx.rotate(walk * 0.2);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(6, -5, 22, 12);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(10, 4, 18, 3);
        ctx.restore();

        ctx.fillStyle = '#7f1d1d';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 23, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#09090b';
        ctx.beginPath();
        ctx.ellipse(8, 0, 10, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(5, -10, 3, 0, Math.PI * 2);
        ctx.arc(5, 10, 3, 0, Math.PI * 2);
        ctx.fill();
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
