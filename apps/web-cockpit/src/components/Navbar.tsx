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
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-slate-200/80 dark:border-slate-800/90 bg-white/95 dark:bg-[#070d1a]/95 backdrop-blur-xl shadow-lg shadow-black/5'
          : 'border-b border-slate-200/40 dark:border-slate-800/40 bg-white/80 dark:bg-[#090f1d]/80 backdrop-blur-md'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo with 3D Orbital Rings */}
        <Link href="/" className="flex items-center gap-3 group">
          <NavbarLogo />
          <div>
            <span className="font-extrabold text-base tracking-wide text-slate-900 dark:text-white flex items-center gap-1">
              AEGIS<span className="text-cyan-600 dark:text-cyan-400">PAY</span>
            </span>
            <span className="text-[10px] font-mono block text-slate-500 dark:text-slate-400">
              {showTechnicalDetails ? 'Autonomous Commerce Cockpit' : 'Smart Shopping & Savings'}
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-[#050912] p-1 rounded-xl border border-slate-200 dark:border-slate-800">
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
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Section: Status Indicator, DevModeToggle, ThemeToggle, Mobile Hamburger */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-medium">
              {showTechnicalDetails ? 'Sandbox Live' : 'PayPal Protected'}
            </span>
          </div>

          <DevModeToggle />
          <ThemeToggle />

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
