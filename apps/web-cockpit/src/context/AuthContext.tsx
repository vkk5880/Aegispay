'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useUiMode } from './UiModeContext';
import { webLogger as logger } from '@/lib/logger';

export interface UserProfile {
  name: string;
  email: string;
  avatarUrl?: string;
  isAuthorized: boolean;
  vaultSetupTokenId?: string;
  mandateId?: string;
  spentCents?: number;
  authorizedAt?: number;
}

export interface AuthContextType {
  user: UserProfile | null;
  isLoggedIn: boolean;
  isAuthorized: boolean;
  loginWithPayPal: (account?: { name?: string; email?: string }) => Promise<void>;
  authorizePayment: () => Promise<void>;
  logout: () => void;
  isProfileSidebarOpen: boolean;
  setIsProfileSidebarOpen: (open: boolean) => void;
  openProfileSidebar: () => void;
  closeProfileSidebar: () => void;

  // Authorization Persistence & Spend Tracking
  spentCents: number;
  recordPurchaseSpend: (amountCents: number) => void;
  resetSessionSpend: () => void;
}

export const DEFAULT_SANDBOX_USER: UserProfile = {
  name: 'PayPal Sandbox Buyer',
  email: 'sb-buyer@business.example.com',
  isAuthorized: false,
  spentCents: 0,
};

const STORAGE_KEY = 'aegispay_user_session';

const defaultAuthContext: AuthContextType = {
  user: null,
  isLoggedIn: false,
  isAuthorized: false,
  loginWithPayPal: async () => {},
  authorizePayment: async () => {},
  logout: () => {},
  isProfileSidebarOpen: false,
  setIsProfileSidebarOpen: () => {},
  openProfileSidebar: () => {},
  closeProfileSidebar: () => {},

  spentCents: 0,
  recordPurchaseSpend: () => {},
  resetSessionSpend: () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { showTechnicalDetails } = useUiMode();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [spentCents, setSpentCentsState] = useState<number>(0);
  const [isProfileSidebarOpen, setIsProfileSidebarOpen] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  // Load saved session on initial mount
  useEffect(() => {
    try {
      // Clean up legacy mock/test-user storage artifacts
      localStorage.removeItem('aegispay_test_user_enabled');
      localStorage.removeItem('aegispay_test_user_session');
      localStorage.removeItem('aegispay_mock_test_mode');

      const savedRaw = localStorage.getItem(STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed && typeof parsed.name === 'string') {
          setUser(parsed);
          setSpentCentsState(typeof parsed.spentCents === 'number' ? parsed.spentCents : 0);
          logger.info('[AuthContext:SessionRestored]', {
            name: parsed.name,
            email: parsed.email,
            isAuthorized: parsed.isAuthorized,
            spentCents: parsed.spentCents || 0,
          });
        }
      }
    } catch (e) {
      logger.warn('[AuthContext:Init] Failed to load session from storage', {
        error: String(e),
      });
    }
    setMounted(true);
  }, []);

  const loginWithPayPal = useCallback(
    async (account?: { name?: string; email?: string }) => {
      logger.info('[AuthContext:Login] Initiating PayPal Sandbox Login', { account });
      const loggedInUser: UserProfile = {
        name: account?.name || DEFAULT_SANDBOX_USER.name,
        email: account?.email || DEFAULT_SANDBOX_USER.email,
        isAuthorized: false,
        spentCents: 0,
      };

      setUser(loggedInUser);
      setSpentCentsState(0);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedInUser));
      } catch {}

      logger.info('[AuthContext:Login] User logged in with PayPal Sandbox', {
        name: loggedInUser.name,
        email: loggedInUser.email,
      });
    },
    []
  );

  const authorizePayment = useCallback(async () => {
    logger.info('[AuthContext:Authorize] Authorizing PayPal Sandbox Vault v3 Spend Allowance');
    const currentUser = user || DEFAULT_SANDBOX_USER;

    const authorizedUser: UserProfile = {
      ...currentUser,
      isAuthorized: true,
      vaultSetupTokenId: `vault_tok_sandbox_${Date.now()}`,
      mandateId: `vch_sandbox_mandate_${Date.now()}`,
      authorizedAt: Date.now(),
      spentCents: currentUser.spentCents || 0,
    };

    setUser(authorizedUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authorizedUser));
    } catch {}

    logger.info('[AuthContext:Authorize] PayPal Sandbox Payment authorized and saved to account', {
      name: authorizedUser.name,
      vaultSetupTokenId: authorizedUser.vaultSetupTokenId,
      mandateId: authorizedUser.mandateId,
    });
  }, [user]);

  const recordPurchaseSpend = useCallback((amountCents: number) => {
    setSpentCentsState((prev) => {
      const nextSpent = prev + amountCents;
      setUser((current) => {
        if (!current) return current;
        const updated = { ...current, spentCents: nextSpent };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {}
        return updated;
      });
      return nextSpent;
    });
  }, []);

  const resetSessionSpend = useCallback(() => {
    setSpentCentsState(0);
    setUser((current) => {
      if (!current) return current;
      const updated = { ...current, spentCents: 0 };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const logout = useCallback(() => {
    logger.info('[AuthContext:Logout] User logging out of PayPal account');
    setUser(null);
    setSpentCentsState(0);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const openProfileSidebar = useCallback(() => {
    setIsProfileSidebarOpen(true);
  }, []);

  const closeProfileSidebar = useCallback(() => {
    setIsProfileSidebarOpen(false);
  }, []);

  const isLoggedIn = !!user;
  // Security invariant: Authorization is ONLY valid if the user IS currently logged in!
  const isAuthorized = isLoggedIn && Boolean(user?.isAuthorized);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn,
        isAuthorized,
        loginWithPayPal,
        authorizePayment,
        logout,
        isProfileSidebarOpen,
        setIsProfileSidebarOpen,
        openProfileSidebar,
        closeProfileSidebar,

        spentCents,
        recordPurchaseSpend,
        resetSessionSpend,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  return context || defaultAuthContext;
}
