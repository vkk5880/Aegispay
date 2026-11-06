'use client';

import React, { useEffect, useState } from 'react';

export function CursorEnergy() {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: -200, y: -200 });
  const [isPointer, setIsPointer] = useState(false);
  const [isTouch, setIsTouch] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(pointer: coarse)').matches) {
      return;
    }
    setIsTouch(false);

    let rafId: number;
    let targetX = -200;
    let targetY = -200;
    let currentX = -200;
    let currentY = -200;

    const onMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      const target = e.target as HTMLElement | null;
      setIsPointer(!!target?.closest('button, a, input, [role="button"]'));
    };

    const updatePhysics = () => {
      currentX += (targetX - currentX) * 0.15;
      currentY += (targetY - currentY) * 0.15;
      setPos({ x: currentX, y: currentY });
      rafId = requestAnimationFrame(updatePhysics);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    rafId = requestAnimationFrame(updatePhysics);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  if (isTouch) return null;

  return (
    <div className="hidden md:block pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <div
        className="absolute rounded-full blur-3xl mix-blend-screen transition-transform duration-300"
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          transform: `translate(-50%, -50%) scale(${isPointer ? 1.3 : 1})`,
          width: '320px',
          height: '320px',
          background: isPointer
            ? 'radial-gradient(circle, rgba(6,182,212,0.18) 0%, rgba(59,130,246,0.08) 40%, transparent 70%)'
            : 'radial-gradient(circle, rgba(14,165,233,0.1) 0%, rgba(99,102,241,0.04) 50%, transparent 70%)',
        }}
      />
    </div>
  );
}
