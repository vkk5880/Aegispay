'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useUiMode } from './UiModeContext';
import { webLogger as logger } from '@/lib/logger';

export interface UserProfile {
  name: string;
  email: string;
  avatarUrl?: string;
  isTestUser: boolean;
  isAuthorized: boolean;
  vaultSetupTokenId?: string;
  mandateId?: string;
}

export interface AuthContextType {
  user: UserProfile | null;
  isLoggedIn: boolean;
  isAuthorized: boolean;
  isTestUserMode: boolean;
  canToggleTestUser: boolean;
  setTestUserMode: (enabled: boolean) => void;
  toggleTestUserMode: () => void;
  loginWithPayPal: () => Promise<void>;
  authorizePayment: () => Promise<void>;
  logout: () => void;
  isProfileSidebarOpen: boolean;
  setIsProfileSidebarOpen: (open: boolean) => void;
  openProfileSidebar: () => void;
  closeProfileSidebar: () => void;
}

const TEST_USER_PROFILE: UserProfile = {
  name: 'Alex Mercer (Test Buyer)',
  email: 'alex.mercer@sandbox.paypal.com',
  isTestUser: true,
  isAuthorized: true,
  vaultSetupTokenId: 'vault_tok_sandbox_test_user_77',
  mandateId: 'vch_test_buyer_authorized',
};

const DEFAULT_LIVE_USER: UserProfile = {
  name: 'Jordan Lee',
  email: 'jordan.lee@example.com',
  isTestUser: false,
  isAuthorized: false,
};

const defaultAuthContext: AuthContextType = {
  user: null,
  isLoggedIn: false,
  isAuthorized: false,
  isTestUserMode: false,
  canToggleTestUser: true,
  setTestUserMode: () => {},
  toggleTestUserMode: () => {},
  loginWithPayPal: async () => {},
  authorizePayment: async () => {},
  logout: () => {},
  isProfileSidebarOpen: false,
  setIsProfileSidebarOpen: () => {},
  openProfileSidebar: () => {},
  closeProfileSidebar: () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isProduction, isDevEnvironment } = useUiMode();
  const canToggleTestUser = !isProduction && isDevEnvironment;

  const [isTestUserMode, setIsTestUserModeState] = useState<boolean>(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isProfileSidebarOpen, setIsProfileSidebarOpen] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  // Initialize from localStorage or default state
  useEffect(() => {
    try {
      if (canToggleTestUser) {
        const savedTestMode = localStorage.getItem('aegispay_test_user_enabled');
        if (savedTestMode === 'true') {
          setIsTestUserModeState(true);
          setUser(TEST_USER_PROFILE);
          logger.info('[AuthContext:Init] Test user mode activated from storage', {
            name: TEST_USER_PROFILE.name,
            email: TEST_USER_PROFILE.email,
          });
          setMounted(true);
          return;
        }
      }

      // Check for saved standard session
      const savedSession = localStorage.getItem('aegispay_user_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed && typeof parsed.name === 'string') {
          setUser(parsed);
          logger.info('[AuthContext:Init] User session restored from storage', {
            name: parsed.name,
            email: parsed.email,
            isAuthorized: parsed.isAuthorized,
          });
        }
      }
    } catch (e) {
      logger.warn('[AuthContext:Init] Failed to parse saved auth storage', { error: String(e) });
    }
    setMounted(true);
  }, [canToggleTestUser]);

  const setTestUserMode = useCallback(
    (enabled: boolean) => {
      if (!canToggleTestUser) {
        logger.warn('[AuthContext:TestMode] Cannot toggle test user in strict production');
        return;
      }
      setIsTestUserModeState(enabled);
      try {
        localStorage.setItem('aegispay_test_user_enabled', String(enabled));
      } catch {}

      if (enabled) {
        setUser(TEST_USER_PROFILE);
        try {
          localStorage.setItem('aegispay_user_session', JSON.stringify(TEST_USER_PROFILE));
        } catch {}
        logger.info('[AuthContext:TestMode] Enabled test user — pre-authorized bypass active', {
          name: TEST_USER_PROFILE.name,
          email: TEST_USER_PROFILE.email,
        });
      } else {
        // Switch back to unauthenticated or standard state
        setUser(null);
        try {
          localStorage.removeItem('aegispay_user_session');
        } catch {}
        logger.info('[AuthContext:TestMode] Disabled test user — operating in clean production-like mode');
      }
    },
    [canToggleTestUser]
  );

  const toggleTestUserMode = useCallback(() => {
    setTestUserMode(!isTestUserMode);
  }, [isTestUserMode, setTestUserMode]);

  const loginWithPayPal = useCallback(async () => {
    logger.info('[AuthContext:Login] Initiating Login with PayPal');
    if (isTestUserMode) {
      setUser(TEST_USER_PROFILE);
      return;
    }

    // Standard Login: Authenticates user identity, but leaves payment un-authorized
    const loggedInUser: UserProfile = {
      ...DEFAULT_LIVE_USER,
      isTestUser: false,
      isAuthorized: false,
    };
    setUser(loggedInUser);
    try {
      localStorage.setItem('aegispay_user_session', JSON.stringify(loggedInUser));
    } catch {}
    logger.info('[AuthContext:Login] User logged in with PayPal', {
      name: loggedInUser.name,
      email: loggedInUser.email,
      isAuthorized: false,
    });
  }, [isTestUserMode]);

  const authorizePayment = useCallback(async () => {
    logger.info('[AuthContext:Authorize] Authorizing PayPal Payment / Spend Allowance');
    if (!user) {
      // If not logged in yet, prompt login first
      await loginWithPayPal();
    }

    const authorizedUser: UserProfile = {
      ...(user || DEFAULT_LIVE_USER),
      isAuthorized: true,
      vaultSetupTokenId: `vault_tok_${Date.now()}`,
      mandateId: `vch_${Date.now()}`,
    };
    setUser(authorizedUser);
    try {
      localStorage.setItem('aegispay_user_session', JSON.stringify(authorizedUser));
    } catch {}
    logger.info('[AuthContext:Authorize] PayPal Payment authorized successfully', {
      name: authorizedUser.name,
      vaultSetupTokenId: authorizedUser.vaultSetupTokenId,
    });
  }, [user, loginWithPayPal]);

  const logout = useCallback(() => {
    logger.info('[AuthContext:Logout] User logging out');
    setUser(null);
    setIsTestUserModeState(false);
    try {
      localStorage.removeItem('aegispay_user_session');
      localStorage.removeItem('aegispay_test_user_enabled');
    } catch {}
  }, []);

  const openProfileSidebar = useCallback(() => {
    setIsProfileSidebarOpen(true);
  }, []);

  const closeProfileSidebar = useCallback(() => {
    setIsProfileSidebarOpen(false);
  }, []);

  const isLoggedIn = !!user;
  const isAuthorized = Boolean(user?.isAuthorized);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn,
        isAuthorized,
        isTestUserMode,
        canToggleTestUser,
        setTestUserMode,
        toggleTestUserMode,
        loginWithPayPal,
        authorizePayment,
        logout,
        isProfileSidebarOpen,
        setIsProfileSidebarOpen,
        openProfileSidebar,
        closeProfileSidebar,
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
