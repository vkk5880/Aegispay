'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface WarpBackgroundProps {
  isWarping?: boolean;
  starCount?: number;
  className?: string;
  baseColor?: string;
}

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number; // Previous Z for streak drawing
}

export function WarpBackground({
  isWarping = false,
  starCount = 900,
  className = '',
  baseColor = '#22d3ee', // Cyan neon
}: WarpBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let isVisible = true;

    // Initialize star vectors in spherical / cubic volume
    const stars: Star[] = [];
    const maxDepth = 1500;

    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 2000,
        z: Math.random() * maxDepth + 1,
        pz: maxDepth,
      });
    }

    let currentSpeed = isWarping ? 32 : 1.8;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    let lastTime = performance.now();

    const render = (now: number) => {
      if (!isVisible) return;

      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const targetSpeed = isWarping ? 45 : 1.5;
      currentSpeed += (targetSpeed - currentSpeed) * Math.min(delta * 4, 1);

      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;

      // Dark space background with slight trails when warping
      if (isWarping) {
        ctx.fillStyle = 'rgba(6, 11, 20, 0.35)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      ctx.lineWidth = isWarping ? 1.8 : 1.0;

      for (let i = 0; i < starCount; i++) {
        const star = stars[i];
        star.pz = star.z;
        star.z -= currentSpeed * 60 * delta;

        // Reset if star passes viewer
        if (star.z <= 0) {
          star.x = (Math.random() - 0.5) * 2000;
          star.y = (Math.random() - 0.5) * 2000;
          star.z = maxDepth;
          star.pz = maxDepth;
        }

        // Perspective projection
        const fov = 320;
        const k = fov / star.z;
        const px = star.x * k + cx;
        const py = star.y * k + cy;

        // Previous projected point for streaks
        const prevK = fov / star.pz;
        const prevPx = star.x * prevK + cx;
        const prevPy = star.y * prevK + cy;

        // Skip if outside viewport bounds
        if (px < -50 || px > w + 50 || py < -50 || py > h + 50) continue;

        const depthRatio = Math.max(0, 1 - star.z / maxDepth);
        const alpha = Math.min(1, depthRatio * (isWarping ? 0.9 : 0.75));

        ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
        ctx.fillStyle = `rgba(167, 139, 250, ${alpha})`;

        if (isWarping && Math.hypot(px - prevPx, py - prevPy) > 1) {
          ctx.beginPath();
          ctx.moveTo(prevPx, prevPy);
          ctx.lineTo(px, py);
          ctx.stroke();
        } else {
          const size = Math.max(0.8, depthRatio * 2.2);
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    const onVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible) {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimationFrame(animationFrameId);
    };
  }, [mounted, isWarping, starCount, baseColor]);

  if (!mounted) return null;

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[-1] bg-[#060b14] overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
