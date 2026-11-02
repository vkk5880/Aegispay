'use client';

import React, { useState, useEffect } from 'react';
import type { SessionMandate } from '@aegispay/shared-types';
import { Lock, ShieldCheck, RefreshCw, Key, Copy, CheckCircle2 } from 'lucide-react';
import { formatCents } from '@/lib/utils';

interface CryptographicMandateSignerProps {
  onMandateGenerated?: (mandate: SessionMandate) => void;
}

export function CryptographicMandateSigner({ onMandateGenerated }: CryptographicMandateSignerProps) {
  const [totalBudgetCents, setTotalBudgetCents] = useState<number>(50000); // $500.00
  const [singleMerchantCapCents, setSingleMerchantCapCents] = useState<number>(25000); // $250.00
  const [allowedCategories, setAllowedCategories] = useState<string[]>([
    'audio',
    'workspace',
    'electronics',
    'peripherals',
  ]);
  const [validityMinutes, setValidityMinutes] = useState<number>(30);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedMandate, setGeneratedMandate] = useState<SessionMandate | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const availableCategories = [
    { id: 'audio', label: 'Audio & Acoustics' },
    { id: 'workspace', label: 'Workspace & Ergonomics' },
    { id: 'electronics', label: 'Electronics & Computing' },
    { id: 'peripherals', label: 'Peripherals & Cables' },
    { id: 'office', label: 'Stationery & Accessories' },
  ];

  // Helper to convert buffer to hex string
  const buf2hex = (buffer: ArrayBuffer): string => {
    return [...new Uint8Array(buffer)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
  };

  const generateAndSignMandate = async () => {
    setIsGenerating(true);
    try {
      // 1. Generate in-browser WebCrypto Ed25519 keypair
      const keyPair = await window.crypto.subtle.generateKey(
        { name: 'Ed25519' },
        true,
        ['sign', 'verify']
      );

      const exportedPublicKey = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
      const publicKeyHex = buf2hex(exportedPublicKey);

      const mandateId = `man_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const expiresAt = new Date(Date.now() + validityMinutes * 60 * 1000);

      const messageObj = {
        mandate_id: mandateId,
        buyer_id: 'usr_sandbox_buyer_01',
        max_total_spend_cents: totalBudgetCents,
        max_single_merchant_cents: singleMerchantCapCents,
        allowed_categories: allowedCategories,
        public_key_hex: publicKeyHex,
      };

      const messageBytes = new TextEncoder().encode(JSON.stringify(messageObj));

      // 2. Sign using WebCrypto Ed25519 private key
      const signatureBuffer = await window.crypto.subtle.sign(
        { name: 'Ed25519' },
        keyPair.privateKey,
        messageBytes
      );
      const signatureHex = buf2hex(signatureBuffer);

      const mandate: SessionMandate = {
        ...messageObj,
        expires_at: expiresAt,
        cumulative_spent_cents: 0,
        ed25519_signature_hex: signatureHex,
        created_at: new Date(),
      };

      setGeneratedMandate(mandate);
      if (onMandateGenerated) {
        onMandateGenerated(mandate);
      }
    } catch (err) {
      console.error('Failed to generate Ed25519 keypair or sign mandate:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    generateAndSignMandate();
  }, []);

  const copyMandateJson = () => {
    if (!generatedMandate) return;
    navigator.clipboard.writeText(JSON.stringify(generatedMandate, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-[#0b1324] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-6 shadow-sm dark:shadow-2xl relative overflow-hidden backdrop-blur-md transition-colors">
      {/* Circuit accent glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#1e293b]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-300 dark:border-cyan-500/30 rounded-xl text-cyan-700 dark:text-cyan-400 shadow-xs">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
              Ed25519 Spend Mandate Signer
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/30">
                WebCrypto FIPS
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Zero-trust budget policy anchored by in-browser cryptographic signatures</p>
          </div>
        </div>
        <button
          onClick={generateAndSignMandate}
          disabled={isGenerating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-50 dark:bg-cyan-600/20 hover:bg-cyan-100 dark:hover:bg-cyan-600/30 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/40 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          Regenerate Keypair
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Controls Column */}
        <div className="space-y-5">
          {/* Total Budget Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Session Total Budget Cap:</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-mono font-bold text-sm">{formatCents(totalBudgetCents)}</span>
            </div>
            <input
              type="range"
              min="10000"
              max="200000"
              step="5000"
              value={totalBudgetCents}
              onChange={(e) => {
                const val = Number(e.target.value);
                setTotalBudgetCents(val);
                if (singleMerchantCapCents > val) {
                  setSingleMerchantCapCents(val);
                }
              }}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>$100.00</span>
              <span>$1,000.00</span>
              <span>$2,000.00</span>
            </div>
          </div>

          {/* Single-Merchant Cap Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Single-Merchant Exposure Cap:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold text-sm">{formatCents(singleMerchantCapCents)}</span>
            </div>
            <input
              type="range"
              min="5000"
              max={totalBudgetCents}
              step="2500"
              value={singleMerchantCapCents}
              onChange={(e) => setSingleMerchantCapCents(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>$50.00</span>
              <span>Half Cap: {formatCents(Math.round(totalBudgetCents / 2))}</span>
              <span>Max: {formatCents(totalBudgetCents)}</span>
            </div>
          </div>

          {/* Allowed Categories Checkboxes */}
          <div className="space-y-2">
            <label className="text-xs text-slate-700 dark:text-slate-300 font-medium block">
              Authorized Category Boundaries (Channel3 Taxonomy):
            </label>
            <div className="grid grid-cols-2 gap-2">
              {availableCategories.map((cat) => (
                <label
                  key={cat.id}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                    allowedCategories.includes(cat.id)
                      ? 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-500/40 text-cyan-800 dark:text-cyan-200 font-medium'
                      : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={allowedCategories.includes(cat.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAllowedCategories([...allowedCategories, cat.id]);
                      } else {
                        setAllowedCategories(allowedCategories.filter((c) => c !== cat.id));
                      }
                    }}
                    className="rounded text-cyan-500 focus:ring-cyan-400"
                  />
                  <span>{cat.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Expiration Picker */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Mandate TTL Duration:</span>
            <div className="flex items-center gap-1.5">
              {[15, 30, 60, 120].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setValidityMinutes(mins)}
                  className={`px-2.5 py-1 text-xs rounded-md border font-mono transition-colors ${
                    validityMinutes === mins
                      ? 'bg-cyan-500 text-white font-bold border-cyan-600 dark:border-cyan-400'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Cryptographic Preview */}
        <div className="flex flex-col justify-between p-4 rounded-xl bg-slate-50 dark:bg-[#060b14] border border-slate-200 dark:border-slate-800/80 font-mono text-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] font-sans font-semibold uppercase flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                Active Cryptographic Mandate
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Ed25519 Valid
              </span>
            </div>

            {generatedMandate ? (
              <div className="space-y-2 text-slate-700 dark:text-slate-300">
                <div>
                  <span className="text-slate-500 block text-[10px]">MANDATE ID:</span>
                  <span className="text-cyan-700 dark:text-cyan-300 font-bold">{generatedMandate.mandate_id}</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px]">PUBLIC KEY HEX (32 BYTES):</span>
                  <div className="truncate text-slate-700 dark:text-slate-400 bg-white dark:bg-slate-900/60 p-1.5 rounded border border-slate-200 dark:border-slate-800 select-all">
                    {generatedMandate.public_key_hex}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px]">ED25519 SIGNATURE HEX (64 BYTES):</span>
                  <div className="truncate text-slate-700 dark:text-slate-400 bg-white dark:bg-slate-900/60 p-1.5 rounded border border-slate-200 dark:border-slate-800 select-all">
                    {generatedMandate.ed25519_signature_hex}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-500 block text-[10px]">MAX SPEND:</span>
                    <span className="text-cyan-700 dark:text-cyan-400 font-bold">{formatCents(generatedMandate.max_total_spend_cents)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">EXPIRES:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">
                      {new Date(generatedMandate.expires_at).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400">Generating initial keypair...</div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Node crypto / WebCrypto compatible</span>
            <button
              onClick={copyMandateJson}
              disabled={!generatedMandate}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-300 text-[10px] transition-colors font-sans font-medium"
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Copied' : 'Copy Mandate JSON'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
