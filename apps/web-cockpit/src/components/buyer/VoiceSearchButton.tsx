'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

export interface VoiceSearchButtonProps {
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Hands-free Voice Search Button for conversational product discovery.
 * Strictly adheres to GUARDRAIL 2:
 * Wraps in `typeof window !== 'undefined'`, verifies 'SpeechRecognition' or 'webkitSpeechRecognition',
 * and provides a graceful fallback preventing SSR crashes or browser incompatibility failures.
 */
export const VoiceSearchButton: React.FC<VoiceSearchButtonProps> = ({
  onTranscript,
  disabled = false,
  className = '',
}) => {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // GUARDRAIL 2: SSR & Browser Compatibility Check
    if (typeof window === 'undefined') {
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSupported(true);
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          setIsListening(false);
          const transcript = event.results?.[0]?.[0]?.transcript;
          if (transcript && typeof transcript === 'string') {
            onTranscript(transcript.trim());
          }
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      } catch {
        setIsSupported(false);
      }
    } else {
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Cleanup ignore
        }
      }
    };
  }, [onTranscript]);

  const toggleListening = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isSupported || disabled) return;

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        setIsListening(false);
      }
    } else {
      try {
        recognitionRef.current?.start();
      } catch {
        setIsListening(false);
      }
    }
  };

  // Graceful fallback for unsupported environments or SSR
  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        title="Voice search is not supported in this browser"
        aria-label="Voice search not available"
        className={`p-2 rounded-lg text-slate-500 cursor-not-allowed opacity-40 transition-colors ${className}`}
      >
        <MicOff className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      aria-label={isListening ? 'Listening for search query... Click to stop' : 'Search by voice'}
      title={isListening ? 'Listening... speak your product search' : 'Search by voice'}
      className={`relative p-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
        isListening
          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse'
          : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      {isListening ? (
        <span className="relative flex items-center justify-center">
          <Mic className="w-4 h-4 text-rose-400" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-ping" />
        </span>
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  );
};
