'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, ShoppingBag, Store, Zap } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Buyer Cockpit', icon: ShoppingBag },
    { href: '/merchant', label: 'Merchant Console', icon: Store },
    { href: '/judge', label: 'Judge Chaos Lab', icon: Zap },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#090f1d]/90 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-wide text-slate-900 dark:text-white">
              AEGIS<span className="text-cyan-600 dark:text-cyan-400">PAY</span>
            </span>
            <span className="text-[10px] font-mono block text-slate-500 dark:text-slate-400">
              Autonomous Commerce Cockpit
            </span>
          </div>
        </Link>

        {/* Global Navigation Links */}
        <nav className="flex items-center gap-1 bg-slate-100 dark:bg-[#050912] p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive =
              link.href === '/'
                ? pathname === '/'
                : pathname?.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Status Indicator & Theme Toggle */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-medium">
              Sandbox Live
            </span>
          </div>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
