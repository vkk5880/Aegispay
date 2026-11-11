'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

function VaultCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<'verifying' | 'success' | 'cancelled' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    const isCancelled = searchParams.get('cancelled') === 'true';
    const setupTokenId =
      searchParams.get('approval_session_id') ||
      searchParams.get('setup_token_id') ||
      searchParams.get('token');

    if (isCancelled) {
      setStatus('cancelled');
      if (window.opener) {
        window.opener.postMessage({ type: 'PAYPAL_VAULT_CANCELLED' }, window.location.origin);
        setTimeout(() => window.close(), 600);
      }
      return;
    }

    if (!setupTokenId) {
      setStatus('error');
      setErrorMessage('No PayPal approval session ID was returned in the callback URL.');
      if (window.opener) {
        window.opener.postMessage(
          { type: 'PAYPAL_VAULT_ERROR', message: 'No PayPal approval session ID was returned in the callback URL.' },
          window.location.origin
        );
        setTimeout(() => window.close(), 800);
      }
      return;
    }

    // Verify token with backend
    async function verify() {
      try {
        const res = await fetch('/api/auth/paypal/verify-vault-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setupTokenId }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setStatus('success');
          setUserData(data.user);

          // Save session locally
          try {
            const existingRaw = localStorage.getItem('aegispay_user_session');
            const existing = existingRaw ? JSON.parse(existingRaw) : {};
            const merged = {
              ...existing,
              ...data.user,
              isAuthorized: true,
              vaultSetupTokenId: data.setupTokenId,
              paymentTokenId: data.paymentTokenId,
              authorizedAt: Date.now(),
            };
            localStorage.setItem('aegispay_user_session', JSON.stringify(merged));
          } catch {}

          // Notify opener window if in popup
          if (window.opener) {
            window.opener.postMessage(
              {
                type: 'PAYPAL_VAULT_SUCCESS',
                data,
              },
              window.location.origin
            );
            setTimeout(() => {
              window.close();
            }, 600);
          } else {
            // Standalone redirect
            setTimeout(() => {
              router.push('/');
            }, 1500);
          }
        } else {
          setStatus('error');
          setErrorMessage(data.message || 'PayPal Sandbox verification failed.');
          if (window.opener) {
            window.opener.postMessage(
              {
                type: 'PAYPAL_VAULT_ERROR',
                message: data.message || 'PayPal Sandbox verification failed.',
              },
              window.location.origin
            );
            setTimeout(() => {
              window.close();
            }, 800);
          }
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err?.message || 'Network error verifying PayPal session.');
        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'PAYPAL_VAULT_ERROR',
              message: err?.message || 'Network error verifying PayPal session.',
            },
            window.location.origin
          );
          setTimeout(() => {
            window.close();
          }, 800);
        }
      }
    }

    verify();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
          {status === 'verifying' && <Loader2 className="w-8 h-8 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="w-8 h-8 text-emerald-400" />}
          {status === 'cancelled' && <AlertCircle className="w-8 h-8 text-amber-400" />}
          {status === 'error' && <AlertCircle className="w-8 h-8 text-rose-400" />}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-white">
            {status === 'verifying' && 'Verifying PayPal Sandbox Authorization...'}
            {status === 'success' && 'PayPal Sandbox Account Authorized!'}
            {status === 'cancelled' && 'Authorization Cancelled'}
            {status === 'error' && 'Authorization Failed'}
          </h2>
          <p className="text-sm text-slate-400">
            {status === 'verifying' && 'Communicating with PayPal Sandbox Vault API...'}
            {status === 'success' &&
              `Welcome back, ${userData?.name || 'PayPal Buyer'}! Your spend allowance is active.`}
            {status === 'cancelled' && 'You cancelled the PayPal authorization window.'}
            {status === 'error' && errorMessage}
          </p>
        </div>

        {status === 'success' && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
            Vault Setup Token Approved • Synchronizing...
          </div>
        )}

        {status === 'verifying' && (
          <div className="text-xs text-slate-500 font-mono">Please do not close this window...</div>
        )}

        {(status === 'cancelled' || status === 'error') && (
          <button
            type="button"
            onClick={() => {
              if (window.opener) window.close();
              else router.push('/');
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-colors cursor-pointer"
          >
            Close & Return to AegisPay
          </button>
        )}
      </div>
    </div>
  );
}

export default function VaultCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
          <div className="flex items-center gap-3 text-cyan-400 font-mono text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading PayPal Callback Handler...
          </div>
        </div>
      }
    >
      <VaultCallbackContent />
    </Suspense>
  );
}
