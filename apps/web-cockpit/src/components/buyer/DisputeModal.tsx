'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  UploadCloud,
  FileCheck2,
  AlertCircle,
  X,
  FileText,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

export const MAX_EVIDENCE_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number];

export interface EvidenceFileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateEvidenceFile(file: {
  name: string;
  size: number;
  type: string;
}): EvidenceFileValidationResult {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (file.size <= 0) {
    return { valid: false, error: 'File appears to be empty' };
  }

  if (file.size > MAX_EVIDENCE_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 10MB maximum limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
    };
  }

  const normalizedType = file.type?.toLowerCase().trim();
  const isMimeAllowed = ALLOWED_EVIDENCE_MIME_TYPES.includes(
    normalizedType as AllowedMimeType
  );

  // Fallback extension check if MIME is empty or application/octet-stream
  const ext = file.name.split('.').pop()?.toLowerCase();
  const isExtAllowed = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext || '');

  if (!isMimeAllowed && !isExtAllowed) {
    return {
      valid: false,
      error: `Unsupported file type (${file.type || ext}). Allowed formats: JPEG, PNG, WEBP, PDF`,
    };
  }

  return { valid: true };
}

export interface DisputeEvidenceSubmitPayload {
  disputeId: string;
  reason: string;
  description: string;
  fileName?: string;
  fileSizeBytes?: number;
  fileMimeType?: string;
  fileBase64?: string;
}

export interface DisputeModalProps {
  isOpen: boolean;
  disputeId: string;
  orderId?: string;
  disputeAmountCents?: number;
  defaultReason?: string;
  onClose: () => void;
  onSubmitEvidence: (
    payload: DisputeEvidenceSubmitPayload
  ) => Promise<void> | void;
}

export function DisputeModal({
  isOpen,
  disputeId,
  orderId,
  disputeAmountCents,
  defaultReason = 'MERCHANDISE_NOT_AS_DESCRIBED',
  onClose,
  onSubmitEvidence,
}: DisputeModalProps) {
  const [reason, setReason] = useState<string>(defaultReason);
  const [description, setDescription] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Background scroll lock
  useEffect(() => {
    if (!isOpen) return;

    if (typeof document !== 'undefined') {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Focus trap and Escape key dismiss
  useEffect(() => {
    if (!isOpen) return;

    if (typeof document !== 'undefined') {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
          return;
        }

        if (e.key === 'Tab' && modalRef.current) {
          const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );

          if (focusableElements.length === 0) return;

          const first = focusableElements[0];
          const last = focusableElements[focusableElements.length - 1];

          if (e.shiftKey) {
            if (
              document.activeElement === first ||
              !modalRef.current.contains(document.activeElement)
            ) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (
              document.activeElement === last ||
              !modalRef.current.contains(document.activeElement)
            ) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      const focusTimer = setTimeout(() => {
        if (modalRef.current) {
          const firstFocusable = modalRef.current.querySelector<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled])'
          );
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            modalRef.current.focus();
          }
        }
      }, 0);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        clearTimeout(focusTimer);
        if (
          previousActiveElementRef.current &&
          typeof previousActiveElementRef.current.focus === 'function'
        ) {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setSelectedFile(null);
      setFileValidationError(null);
      return;
    }

    const validation = validateEvidenceFile({
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (!validation.valid) {
      setFileValidationError(validation.error || 'Invalid evidence file');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFileValidationError(null);
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFile) {
      const validation = validateEvidenceFile({
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
      });
      if (!validation.valid) {
        setFileValidationError(validation.error || 'Invalid file');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let base64Payload: string | undefined = undefined;

      if (selectedFile && typeof FileReader !== 'undefined') {
        base64Payload = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Strip data URL prefix if present
            const commaIndex = result.indexOf(',');
            resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
          };
          reader.onerror = () => reject(new Error('Failed to read evidence file'));
          reader.readAsDataURL(selectedFile);
        });
      }

      await onSubmitEvidence({
        disputeId,
        reason,
        description,
        fileName: selectedFile?.name,
        fileSizeBytes: selectedFile?.size,
        fileMimeType: selectedFile?.type,
        fileBase64: base64Payload,
      });

      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setFileValidationError(err?.message || 'Failed to submit dispute evidence');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in">
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-xl rounded-3xl bg-white dark:bg-[#080e1b] border-2 border-rose-400 dark:border-rose-500/50 shadow-2xl overflow-hidden relative focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispute-modal-title"
      >
        {/* Header Bar */}
        <div className="h-2 w-full bg-gradient-to-r from-rose-500 via-amber-500 to-indigo-500" />

        <div className="p-6 sm:p-7 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-500/30 text-rose-700 dark:text-rose-400 shadow-xs">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  PayPal Disputes v1 Evidence
                </span>
                <h2
                  id="dispute-modal-title"
                  className="text-lg font-black text-slate-900 dark:text-white tracking-tight mt-1"
                >
                  Submit Dispute Evidence Bundle
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close dispute evidence modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Dispute Metadata Strip */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-50 dark:bg-[#050912] p-3 rounded-xl border border-slate-200 dark:border-slate-800/80">
              <div>
                <span className="text-slate-500 block text-[10px]">DISPUTE ID:</span>
                <span className="text-slate-800 dark:text-slate-200 font-bold truncate block">
                  {disputeId}
                </span>
              </div>
              {orderId && (
                <div>
                  <span className="text-slate-500 block text-[10px]">ORDER ID:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-bold truncate block">
                    {orderId}
                  </span>
                </div>
              )}
            </div>

            {/* Reason Selection */}
            <div>
              <label
                htmlFor="dispute-reason-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Dispute Claim Reason
              </label>
              <select
                id="dispute-reason-select"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="MERCHANDISE_NOT_AS_DESCRIBED">
                  MERCHANDISE_NOT_AS_DESCRIBED (Damaged / Missing / Defective)
                </option>
                <option value="MERCHANDISE_OR_SERVICE_NOT_RECEIVED">
                  MERCHANDISE_OR_SERVICE_NOT_RECEIVED (Non-Delivery)
                </option>
                <option value="UNAUTHORISED">UNAUTHORISED (Account Compromise)</option>
                <option value="INCORRECT_TRANSACTION_AMOUNT">
                  INCORRECT_TRANSACTION_AMOUNT (Overcharge)
                </option>
              </select>
            </div>

            {/* Text Narrative */}
            <div>
              <label
                htmlFor="dispute-narrative"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Evidence Statement &amp; Policy Details
              </label>
              <textarea
                id="dispute-narrative"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe parcel condition, defect observations, or tracking discrepancies..."
                className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
              />
            </div>

            {/* File Upload with Drag & Drop styling */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Supporting Evidence Document / Photo (Max 10MB)
              </span>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center transition-colors ${
                  fileValidationError
                    ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/20'
                    : selectedFile
                    ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-slate-300 dark:border-slate-700 hover:border-rose-400 bg-slate-50 dark:bg-slate-900/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-mono">
                    <FileCheck2 className="w-5 h-5 text-emerald-500" />
                    <span className="font-bold truncate max-w-xs">{selectedFile.name}</span>
                    <span className="text-[10px] text-slate-500">
                      ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <UploadCloud className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-500" />
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Click to upload photo, scan, or PDF dossier
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                      Strictly enforced: JPEG, PNG, WEBP, PDF • Under 10MB
                    </p>
                  </div>
                )}
              </div>

              {/* Validation Error Banner */}
              {fileValidationError && (
                <div className="mt-2 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{fileValidationError}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !!fileValidationError}
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-rose-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : submitSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Evidence Transmitted</span>
                  </>
                ) : (
                  <span>Submit Evidence</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
