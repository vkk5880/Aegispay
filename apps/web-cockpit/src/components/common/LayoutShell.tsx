'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { CustomCursor } from '@/components/common/CustomCursor';
import { CursorEnergy } from '@/components/common/CursorEnergy';
import { PageTransition } from '@/components/common/PageTransition';

export interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps) {
  const pathname = usePathname();
  const isShare = pathname?.startsWith('/share');

  return (
    <>
      {!isShare && (
        <>
          <CustomCursor />
          <CursorEnergy />
        </>
      )}
      <PageTransition>{children}</PageTransition>
    </>
  );
}
