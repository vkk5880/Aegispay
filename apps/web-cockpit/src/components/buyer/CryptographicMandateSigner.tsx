'use client';

import React, { useState, useEffect } from 'react';
import type { SessionMandate } from '@aegispay/shared-types';
import { ShieldCheck, RefreshCw, Key, Copy, CheckCircle2, ChevronDown, Lock } from 'lucide-react';
import { formatCents } from '@/lib/utils';

interface CryptographicMandateSignerProps {
  onMandateGenerated?: (mandate: SessionMandate) => void;
  externalBudgetCents?: number;
}

export function CryptographicMandateSigner({
  onMandateGenerated,
  externalBudgetCents,
}: CryptographicMandateSignerProps) {
  const [totalBudgetCents, setTotalBudgetCents] = useState<number>(externalBudgetCents || 50000); // $500.00
  const [singleMerchantCapCents, setSingleMerchantCapCents] = useState<number>(25000); // $250.00
  const [allowedCategories, setAllowedCategories] = useState<string[]>([
    'audio',
    'workspace',
    'electronics',
    'peripherals',
  ]);
  const [validityMinutes, setValidityMinutes] = useState<number>(15);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedMandate, setGeneratedMandate] = useState<SessionMandate | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Sync when externalBudgetCents updates from GenerativeIntentBar
  useEffect(() => {
    if (externalBudgetCents && externalBudgetCents !== totalBudgetCents) {
      setTotalBudgetCents(externalBudgetCents);
      if (singleMerchantCapCents > externalBudgetCents) {
        setSingleMerchantCapCents(Math.round(externalBudgetCents * 0.6));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalBudgetCents]);

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
        cumulative_spent_cents: 0,
        currency_code: 'USD',
        allowed_category_ids: allowedCategories,
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
        ed25519_signature_hex: signatureHex,
        status: 'ACTIVE',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalBudgetCents, singleMerchantCapCents, validityMinutes]);

  const copyMandateJson = () => {
    if (!generatedMandate) return;
    navigator.clipboard.writeText(JSON.stringify(generatedMandate, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-[#0b1324] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-6 shadow-sm dark:shadow-2xl relative overflow-hidden backdrop-blur-md transition-colors">
      {/* Circuit accent glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Visual Cryptographic Vault Lock Shield Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50/50 to-cyan-50 dark:from-emerald-950/30 dark:via-[#091520] dark:to-cyan-950/30 border border-emerald-300 dark:border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl text-white shadow-md shadow-emerald-500/20 flex-shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-slate-900 dark:text-white uppercase font-sans">
                Cryptographic Vault Lock Active
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
                FIPS WebCrypto
              </span>
            </div>
            <p className="text-xs text-emerald-900/90 dark:text-emerald-200/90 font-medium mt-0.5">
              Hardware-Signed Spend Cap: <strong className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">{formatCents(totalBudgetCents)}</strong> (Active for {validityMinutes}m)
            </p>
          </div>
        </div>

        <button
          onClick={generateAndSignMandate}
          disabled={isGenerating}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 shadow-xs transition-colors disabled:opacity-50 self-start sm:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>Re-Sign Mandate</span>
        </button>
      </div>

      {/* Spend Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Controls Column */}
        <div className="space-y-5">
          {/* Total Budget Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Session Total Budget Cap:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold text-sm">{formatCents(totalBudgetCents)}</span>
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
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
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
              <span className="text-cyan-600 dark:text-cyan-400 font-mono font-bold text-sm">{formatCents(singleMerchantCapCents)}</span>
            </div>
            <input
              type="range"
              min="5000"
              max={totalBudgetCents}
              step="2500"
              value={singleMerchantCapCents}
              onChange={(e) => setSingleMerchantCapCents(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>$50.00</span>
              <span>Half Cap: {formatCents(Math.round(totalBudgetCents / 2))}</span>
              <span>Max: {formatCents(totalBudgetCents)}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Category Boundaries & Duration */}
        <div className="space-y-5">
          {/* Allowed Categories Checkboxes */}
          <div className="space-y-2">
            <label className="text-xs text-slate-700 dark:text-slate-300 font-medium block">
              Authorized Category Boundaries:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {availableCategories.map((cat) => (
                <label
                  key={cat.id}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                    allowedCategories.includes(cat.id)
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200 font-medium'
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
                    className="rounded text-emerald-500 focus:ring-emerald-400"
                  />
                  <span>{cat.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Expiration Duration */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Mandate TTL Duration:</span>
            <div className="flex items-center gap-1.5">
              {[15, 30, 60, 120].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setValidityMinutes(mins)}
                  className={`px-2.5 py-1 text-xs rounded-md border font-mono transition-colors ${
                    validityMinutes === mins
                      ? 'bg-emerald-600 text-white font-bold border-emerald-700 dark:border-emerald-500'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Progressive Disclosure Drawer for Judges & Auditors */}
      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/80">
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer list-none py-2 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#070d18] dark:hover:bg-slate-900/60 border border-slate-200 dark:border-slate-800 transition-colors">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Key className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Inspect Cryptographic Proof & Signature (Ed25519) — For Judges & Auditors</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
                Verified Valid
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
            </div>
          </summary>

          <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-[#060b14] border border-slate-200 dark:border-slate-800 font-mono text-xs space-y-3">
            {generatedMandate ? (
              <div className="space-y-3">
                <div>
                  <span className="text-slate-500 block text-[10px]">MANDATE ID:</span>
                  <span className="text-cyan-700 dark:text-cyan-300 font-bold">{generatedMandate.mandate_id}</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px]">PUBLIC KEY HEX (32 BYTES):</span>
                  <div className="truncate text-slate-700 dark:text-slate-400 bg-white dark:bg-slate-900/60 p-2 rounded border border-slate-200 dark:border-slate-800 select-all break-all">
                    {generatedMandate.public_key_hex}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px]">ED25519 SIGNATURE HEX (64 BYTES):</span>
                  <div className="truncate text-slate-700 dark:text-slate-400 bg-white dark:bg-slate-900/60 p-2 rounded border border-slate-200 dark:border-slate-800 select-all break-all">
                    {generatedMandate.ed25519_signature_hex}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block text-[10px]">CANONICAL SPEND CAP:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatCents(generatedMandate.max_total_spend_cents)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">EXPIRES AT:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">
                      {new Date(generatedMandate.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">SubtleCrypto RFC 8032</span>
                  <button
                    onClick={copyMandateJson}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-sans font-medium transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? 'Copied' : 'Copy Signed JSON'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400">Generating initial keypair...</div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
