'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface TerrainBackgroundProps {
  className?: string;
  wireframeColor?: string;
  horizonColor?: string;
  speed?: number;
}

export function TerrainBackground({
  className = '',
  wireframeColor = 'rgba(6, 182, 212, 0.25)',
  horizonColor = 'rgba(168, 85, 247, 0.45)',
  speed = 1.0,
}: TerrainBackgroundProps) {
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
    let time = 0;
    let isVisible = true;

    // Grid dimension parameters
    const cols = 28;
    const rows = 24;
    const fov = 380;

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
      time += delta * speed * 0.8;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const horizonY = h * 0.48;

      ctx.clearRect(0, 0, w, h);

      // Deep space atmospheric background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, '#04070e');
      skyGrad.addColorStop(1, '#080e1a');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, horizonY);

      // Horizon glow
      const glowGrad = ctx.createRadialGradient(
        w / 2,
        horizonY,
        10,
        w / 2,
        horizonY,
        w * 0.6
      );
      glowGrad.addColorStop(0, horizonColor);
      glowGrad.addColorStop(0.3, 'rgba(6, 182, 212, 0.15)');
      glowGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, horizonY - 120, w, 240);

      // Compute 3D projected vertices
      const points: { x: number; y: number; z: number; visible: boolean }[][] = [];

      for (let r = 0; r < rows; r++) {
        points[r] = [];
        const normalizedZ = (r / rows) * 20 + 1.2;
        const z = normalizedZ;

        for (let c = 0; c < cols; c++) {
          const normalizedX = (c / (cols - 1) - 0.5) * 32;
          const x = normalizedX;

          // Undulating harmonic waves
          const wave1 = Math.sin(x * 0.35 + time * 1.2) * 1.2;
          const wave2 = Math.cos(z * 0.45 - time * 1.5) * 1.5;
          const wave3 = Math.sin((x + z) * 0.2 + time * 0.8) * 0.8;
          const y = wave1 + wave2 + wave3 - 3.2;

          // Perspective projection
          const scale = fov / (z + 2.5);
          const screenX = w / 2 + x * scale;
          const screenY = horizonY - y * scale;

          points[r][c] = {
            x: screenX,
            y: screenY,
            z,
            visible: screenY >= horizonY - 20,
          };
        }
      }

      // Render perspective grid lines
      ctx.lineWidth = 1.2;

      // Draw horizontal cross-lines (row waves)
      for (let r = 0; r < rows; r++) {
        const depthAlpha = Math.max(0, 1 - r / rows);
        ctx.strokeStyle = wireframeColor.replace(
          /[\d.]+\)$/,
          `${(depthAlpha * 0.55).toFixed(3)})`
        );
        ctx.beginPath();
        let started = false;

        for (let c = 0; c < cols; c++) {
          const p = points[r][c];
          if (!p.visible) continue;

          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
        ctx.stroke();
      }

      // Draw longitudinal lines stretching into horizon
      for (let c = 0; c < cols; c++) {
        ctx.beginPath();
        let started = false;

        for (let r = 0; r < rows; r++) {
          const p = points[r][c];
          if (!p.visible) continue;

          const depthAlpha = Math.max(0, 1 - r / rows);
          ctx.strokeStyle = wireframeColor.replace(
            /[\d.]+\)$/,
            `${(depthAlpha * 0.45).toFixed(3)})`
          );

          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
        ctx.stroke();
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
  }, [mounted, wireframeColor, horizonColor, speed]);

  if (!mounted) return null;

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[0] bg-[#04070e] overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
