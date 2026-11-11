import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthProvider, useAuth } from './AuthContext.js';
import { UiModeProvider } from './UiModeContext.js';
import { Navbar } from '../components/Navbar.js';
import { SpendAllowanceHeader } from '../components/buyer/SpendAllowanceHeader.js';
import { UserSettingsDrawer, DEFAULT_USER_SETTINGS } from '../components/buyer/UserSettingsDrawer.js';
import { UserProfileSidebar } from '../components/buyer/UserProfileSidebar.js';

test('AuthContext & Navbar: Renders "Login with PayPal" button when not logged in', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      UiModeProvider,
      null,
      React.createElement(AuthProvider, null, React.createElement(Navbar))
    )
  );

  assert.ok(html.includes('Login with PayPal'), 'Expected navbar to render "Login with PayPal" button');
});

test('SpendAllowanceHeader: Displays "Login with PayPal" button when unconfigured and unauthenticated', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      UiModeProvider,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(SpendAllowanceHeader, {
          maxBudgetCents: 50000,
          spentCents: 0,
          isConfigured: false,
          onOpenSettings: () => {},
          onConnectPayPal: () => {},
        })
      )
    )
  );

  assert.ok(html.includes('Login with PayPal'), 'Expected spend header to display "Login with PayPal"');
  assert.ok(html.includes('Login with PayPal to Enable Smart Shopping'));
});

test('UserSettingsDrawer: Renders User Profile section, guest status, and Test User toggle in non-production mode', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      UiModeProvider,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(UserSettingsDrawer, {
          isOpen: true,
          onClose: () => {},
          settings: DEFAULT_USER_SETTINGS,
          onSave: () => {},
        })
      )
    )
  );

  assert.ok(html.includes('Guest Buyer'), 'Expected guest buyer header in settings drawer');
  assert.ok(html.includes('Login with PayPal'), 'Expected Login with PayPal button');
  assert.ok(html.includes('Enable Test User'), 'Expected Enable Test User toggle in non-production mode');
});

test('UserProfileSidebar: Renders structure with profile, status, and instructions', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      UiModeProvider,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(UserProfileSidebar, { isOpen: true, onOpenSettings: () => {} })
      )
    )
  );

  assert.ok(html.includes('User Profile &amp; PayPal Account') || html.includes('User Profile & PayPal Account'));
  assert.ok(html.includes('Enable Test User'));
  assert.ok(html.includes('Login with PayPal'));
});
