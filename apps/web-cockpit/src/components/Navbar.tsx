'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingBag,
  Store,
  Zap,
  Search,
  Bookmark,
  Receipt,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react';
import NavbarLogo from './NavbarLogo';
import { ThemeToggle } from './ThemeToggle';
import { DevModeToggle } from './DevModeToggle';
import { useUiMode } from '@/context/UiModeContext';

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isProduction, isDevEnvironment, showTechnicalDetails } = useUiMode();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const baseNavLinks = [
    {
      href: '/',
      label: showTechnicalDetails ? 'Cockpit' : 'Shop',
      icon: ShoppingBag,
    },
    {
      href: '/search',
      label: showTechnicalDetails ? 'AI Search' : 'Search',
      icon: Search,
    },
    {
      href: '/watchlist',
      label: showTechnicalDetails ? 'Watchlist' : 'Saved Items',
      icon: Bookmark,
    },
    {
      href: '/history',
      label: showTechnicalDetails ? 'Audit History' : 'Orders & Receipts',
      icon: Receipt,
    },
    {
      href: '/merchant',
      label: showTechnicalDetails ? 'Merchant Console' : 'Seller Portal',
      icon: Store,
    },
  ];

  const navLinks =
    !isProduction && isDevEnvironment && showTechnicalDetails
      ? [...baseNavLinks, { href: '/judge', label: 'Judge Chaos Lab', icon: Zap }]
      : baseNavLinks;

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 relative ${
        scrolled
          ? 'border-b border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#070d1a]/90 backdrop-blur-2xl shadow-xl shadow-black/5 dark:shadow-black/20'
          : 'border-b border-slate-200/40 dark:border-white/5 bg-white/75 dark:bg-[#080e1c]/75 backdrop-blur-xl'
      }`}
    >
      {/* Top subtle radiant border light */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo with 3D Orbital Rings */}
        <Link href="/" className="flex items-center gap-3 group select-none">
          <NavbarLogo />
          <div>
            <span className="font-black text-base tracking-tight text-slate-900 dark:text-white flex items-center gap-1 group-hover:opacity-95 transition-opacity">
              AEGIS<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400">PAY</span>
            </span>
            <span className="text-[10px] font-mono tracking-wider uppercase block text-slate-500 dark:text-slate-400 font-medium">
              {showTechnicalDetails ? 'Autonomous Commerce Cockpit' : 'Smart Shopping & Savings'}
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100/80 dark:bg-[#060b14]/80 p-1 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow-inner">
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
                className={`relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-white dark:bg-[#0e172a] text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-cyan-500/30 shadow-xs shadow-black/5 dark:shadow-cyan-950/30 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'}`} />
                <span>{link.label}</span>
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-cyan-500 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Section: Status Indicator, DevModeToggle, ThemeToggle, Mobile Hamburger */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/20 dark:border-emerald-500/30 px-3 py-1.5 rounded-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold tracking-wide">
              {showTechnicalDetails ? 'Sandbox Live' : 'PayPal Protected'}
            </span>
          </div>

          <DevModeToggle />
          <ThemeToggle />

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#070d1a]/95 backdrop-blur-2xl px-4 py-4 space-y-2 animate-fade-in-up">
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
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4 text-cyan-500" />
                <span>{link.label}</span>
              </Link>
            );
          })}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Developer Options</span>
            <DevModeToggle />
          </div>
        </div>
      )}
    </header>
  );
}
