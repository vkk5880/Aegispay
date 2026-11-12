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
  User,
  LogIn,
  CreditCard,
  LogOut,
  Lock,
} from 'lucide-react';
import NavbarLogo from './NavbarLogo';
import { ThemeToggle } from './ThemeToggle';
import { DevModeToggle } from './DevModeToggle';
import { useUiMode } from '@/context/UiModeContext';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isProduction, isDevEnvironment, showTechnicalDetails } = useUiMode();
  const {
    user,
    isLoggedIn,
    isAuthorized,
    isTrackingMode,
    loginWithPayPal,
    authorizePayment,
    openProfileSidebar,
  } = useAuth();
  const { totalItemsCount, openCart } = useCart();

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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand Logo with 3D Orbital Rings */}
        <Link href="/" className="flex items-center gap-2.5 group select-none">
          <NavbarLogo />
          <div>
            <span className="font-black text-sm sm:text-base tracking-tight text-slate-900 dark:text-white flex items-center gap-1 group-hover:opacity-95 transition-opacity leading-tight">
              AEGIS<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400">PAY</span>
            </span>
            <span className="text-[9px] font-mono tracking-wider uppercase block text-slate-500 dark:text-slate-400 font-medium leading-none mt-0.5">
              {showTechnicalDetails ? 'Autonomous Commerce Cockpit' : 'Smart Shopping & Savings'}
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links (Icon-focused with horizontal spacing on large screens, compact vertically) */}
        <nav className="hidden lg:flex items-center gap-2 xl:gap-3.5 bg-slate-100/80 dark:bg-[#060b14]/80 px-2.5 py-1 rounded-xl border border-slate-200/70 dark:border-white/10 shadow-inner">
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
                prefetch={link.href === '/history' ? false : undefined}
                aria-label={link.label}
                className={`group relative flex items-center justify-center px-3 py-1.5 sm:px-3.5 xl:px-4.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-white dark:bg-[#0e172a] text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-cyan-500/30 shadow-xs shadow-black/5 dark:shadow-cyan-950/30 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-4 h-4 sm:w-4.5 sm:h-4.5 xl:w-5 xl:h-5 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'}`} />
                
                {/* Floating Tooltip (title attribute removed to eliminate double hover tooltips) */}
                <span className="absolute -bottom-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-slate-900/95 dark:bg-slate-100/95 backdrop-blur-md text-white dark:text-slate-900 text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50 border border-white/10 dark:border-black/10">
                  {link.label}
                </span>

                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3.5 h-[2px] bg-cyan-500 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Section: Auth Button, DevModeToggle, ThemeToggle, Mobile Hamburger */}
        <div className="flex items-center gap-2 sm:gap-2.5 xl:gap-3.5">
          {/* PayPal Auth Action Button / Read-Only Tracking Indicator */}
          {isTrackingMode ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 font-bold text-xs sm:text-sm font-mono shadow-xs">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Tracking Mode</span>
              <span className="sm:hidden">Tracking</span>
            </div>
          ) : !isLoggedIn ? (
            <button
              type="button"
              onClick={() => loginWithPayPal()}
              className="group relative flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-700 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-cyan-500/20 transition-all cursor-pointer active:scale-95"
              aria-label="Login with PayPal"
            >
              <LogIn className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              <span className="hidden sm:inline xl:hidden">Login</span>
              <span className="hidden xl:inline">Login with PayPal</span>
              {/* Floating Tooltip for compact screens */}
              <span className="xl:hidden absolute -bottom-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-slate-900/95 dark:bg-slate-100/95 backdrop-blur-md text-white dark:text-slate-900 text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50 border border-white/10 dark:border-black/10">
                Login with PayPal
              </span>
            </button>
          ) : !isAuthorized ? (
            <button
              type="button"
              onClick={() => authorizePayment()}
              className="group relative flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-amber-600/20 transition-all cursor-pointer active:scale-95 animate-pulse"
              aria-label="Authorize Payment"
            >
              <CreditCard className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              <span className="hidden xl:inline">Authorize Payment</span>
              <span className="xl:hidden absolute -bottom-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-slate-900/95 dark:bg-slate-100/95 backdrop-blur-md text-white dark:text-slate-900 text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50 border border-white/10 dark:border-black/10">
                Authorize Payment
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={openProfileSidebar}
              className="group relative flex items-center gap-2 p-1.5 sm:p-2 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 hover:bg-slate-200/80 dark:bg-white/5 dark:hover:bg-white/10 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-xs active:scale-95"
              aria-label="User Profile"
            >
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center text-xs font-black">
                {user.name.charAt(0)}
              </div>
              <span className="hidden xl:inline max-w-[95px] truncate">{user.name.split(' ')[0]}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              
              <span className="absolute -bottom-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-slate-900/95 dark:bg-slate-100/95 backdrop-blur-md text-white dark:text-slate-900 text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50 border border-white/10 dark:border-black/10">
                {user.name} ({user.isAuthorized ? 'Authorized' : 'Unconfirmed'})
              </span>
            </button>
          )}

          {/* Global Cart Button with Live Badge */}
          <button
            type="button"
            onClick={openCart}
            className="group relative flex items-center justify-center p-2 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 hover:bg-slate-200/80 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-all cursor-pointer shadow-xs active:scale-95"
            aria-label="Open Multi-Store Cart"
            title="Open Multi-Store Cart"
          >
            <ShoppingBag className="w-4 h-4 sm:w-4.5 sm:h-4.5 group-hover:scale-110 transition-transform text-cyan-600 dark:text-cyan-400" />
            {totalItemsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-mono font-bold text-[10px] flex items-center justify-center shadow-md animate-pulse">
                {totalItemsCount}
              </span>
            )}
            <span className="sr-only">Shopping Cart ({totalItemsCount} items)</span>
          </button>

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
        <div className="lg:hidden border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#070d1a]/95 backdrop-blur-2xl px-4 py-4 space-y-3 animate-fade-in-up">
          {/* User Profile Summary in Mobile Drawer */}
          {isLoggedIn && user ? (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0c1424] border border-slate-200 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center text-xs font-black shrink-0">
                    {user.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{user.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openProfileSidebar();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 text-[11px] font-bold"
                >
                  Profile
                </button>
              </div>

              {!isAuthorized && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    authorizePayment();
                  }}
                  className="w-full py-2 rounded-lg bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Authorize Payment</span>
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                loginWithPayPal();
              }}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login with PayPal</span>
            </button>
          )}

          {/* Mobile Cart Trigger */}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              openCart();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs font-bold text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-4 h-4 text-cyan-500" />
              <span>Smart Multi-Store Cart</span>
            </div>
            {totalItemsCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-mono text-[10px] font-bold">
                {totalItemsCount} item{totalItemsCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 font-mono">Empty</span>
            )}
          </button>

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
                prefetch={link.href === '/history' ? false : undefined}
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
