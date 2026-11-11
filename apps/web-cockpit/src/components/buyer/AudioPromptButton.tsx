'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2, Square, AlertCircle } from 'lucide-react';
import { webLogger as logger } from '@/lib/logger';

export interface AudioPromptButtonProps {
  onTranscript: (transcript: string) => void;
  onInterimTranscript?: (interim: string) => void;
  disabled?: boolean;
  className?: string;
  variant?: 'compact' | 'pill' | 'inline';
  placeholder?: string;
}

/**
 * Cyber audio chirp synthesizer for recording start/stop feedback.
 * Uses lightweight Web Audio API oscillators.
 */
function playAudioChirp(type: 'start' | 'stop') {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof window.AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (type === 'start') {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Non-fatal sound effect failure
  }
}

/**
 * AudioPromptButton: Dual-engine voice input system for chat prompt entering.
 * 
 * Engine 1: Open-source / Browser Native Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 *           Provides zero-latency live streaming speech-to-text directly in supported browsers.
 * Engine 2: MediaRecorder + Google Free Gemini Multimodal Audio API (/api/buyer/audio-transcribe)
 *           Captures microphone audio stream and converts to text via Google's free Gemini Flash audio API.
 */
export const AudioPromptButton: React.FC<AudioPromptButtonProps> = ({
  onTranscript,
  onInterimTranscript,
  disabled = false,
  className = '',
  variant = 'compact',
}) => {
  const [hasSpeechRecognition, setHasSpeechRecognition] = useState<boolean>(false);
  const [hasMediaRecorder, setHasMediaRecorder] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Check available audio capabilities on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const canRecord = !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder !== 'undefined'
    );

    setHasSpeechRecognition(!!SpeechRec);
    setHasMediaRecorder(canRecord);

    logger.debug('[AudioPromptButton:Mount] Checked audio capabilities', {
      hasSpeechRecognition: !!SpeechRec,
      hasMediaRecorder: canRecord,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          audioCtxRef.current.close().catch(() => {});
        } catch {}
      }
    };
  }, []);

  // Stop MediaStream tracks
  const stopMediaTracks = useCallback(() => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try {
        audioCtxRef.current.close().catch(() => {});
      } catch {}
      audioCtxRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  /**
   * Start native Web Speech Recognition (Engine 1)
   */
  const startSpeechRecognition = useCallback(() => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return false;

    try {
      const recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
        setErrorMessage(null);
        playAudioChirp('start');
        logger.info('[AudioPromptButton:WebSpeech] Recognition started');
      };

      recognition.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const transcriptPart = item?.[0]?.transcript || '';
          if (item.isFinal) {
            finalText += transcriptPart;
          } else {
            interimText += transcriptPart;
          }
        }

        if (interimText && onInterimTranscript) {
          onInterimTranscript(interimText);
        }

        if (finalText) {
          setIsRecording(false);
          playAudioChirp('stop');
          logger.info('[AudioPromptButton:WebSpeech] Final transcript received', { finalText });
          onTranscript(finalText.trim());
        }
      };

      recognition.onerror = (event: any) => {
        logger.warn('[AudioPromptButton:WebSpeech] Recognition error', {
          error: event?.error,
        });
        setIsRecording(false);
        if (event?.error === 'not-allowed') {
          setErrorMessage('Microphone access blocked. Please allow permissions.');
        } else if (event?.error !== 'no-speech') {
          // If native recognition fails, attempt fallback to MediaRecorder
          startMediaRecorder();
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      return true;
    } catch (err: any) {
      logger.warn('[AudioPromptButton:WebSpeech] Failed initializing SpeechRecognition', {
        error: err?.message,
      });
      return false;
    }
  }, [onInterimTranscript, onTranscript]);

  /**
   * Start MediaRecorder audio capture & Google Gemini multimodal transcription (Engine 2)
   */
  const startMediaRecorder = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage('Audio recording not supported in this browser.');
      return;
    }

    try {
      logger.info('[AudioPromptButton:MediaRecorder] Requesting audio stream');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      // Determine supported MIME type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/wav',
      ];
      let selectedMime = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      const mediaRecorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stopMediaTracks();
        playAudioChirp('stop');

        const recordedBlob = new Blob(audioChunksRef.current, {
          type: selectedMime || 'audio/webm',
        });

        if (recordedBlob.size < 1000) {
          logger.warn('[AudioPromptButton:MediaRecorder] Audio clip too short or empty');
          setIsRecording(false);
          setIsTranscribing(false);
          return;
        }

        setIsRecording(false);
        setIsTranscribing(true);
        logger.info('[AudioPromptButton:MediaRecorder] Audio recorded, uploading to Gemini API', {
          sizeBytes: recordedBlob.size,
          mimeType: recordedBlob.type,
        });

        try {
          const formData = new FormData();
          formData.append('audio', recordedBlob, 'speech.webm');

          const response = await fetch('/api/buyer/audio-transcribe', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
          }

          const data = await response.json();
          if (data.success && data.transcript) {
            logger.info('[AudioPromptButton:Gemini] Transcription successful', {
              transcript: data.transcript,
              engine: data.engine,
            });
            onTranscript(data.transcript);
          } else if (data.error) {
            setErrorMessage(data.error);
          }
        } catch (fetchErr: any) {
          logger.error('[AudioPromptButton:Gemini] Failed transcribing audio via Gemini API', {
            error: fetchErr?.message,
          });
          setErrorMessage('Could not transcribe audio. Please try again or type.');
        } finally {
          setIsTranscribing(false);
        }
      };

      // Set up simple audio volume visualizer
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof window.AudioContext })
            .webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const sourceNode = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          sourceNode.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateLevel = () => {
            if (!audioStreamRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animFrameRef.current = requestAnimationFrame(updateLevel);
          };
          updateLevel();
        }
      } catch {}

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250); // Slice every 250ms
      setIsRecording(true);
      setErrorMessage(null);
      playAudioChirp('start');
      logger.info('[AudioPromptButton:MediaRecorder] Recording started');
    } catch (permErr: any) {
      logger.warn('[AudioPromptButton:MediaRecorder] Microphone permission denied or device error', {
        error: permErr?.name || permErr?.message,
      });
      setIsRecording(false);
      if (permErr?.name === 'NotAllowedError' || permErr?.name === 'PermissionDeniedError') {
        setErrorMessage('Microphone access denied. Please enable in your browser settings.');
      } else {
        setErrorMessage('Microphone not available.');
      }
    }
  }, [stopMediaTracks, onTranscript]);

  /**
   * Main toggle: Start or Stop audio capture
   */
  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled || isTranscribing) return;

    if (isRecording) {
      // Stop recording
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      stopMediaTracks();
      setIsRecording(false);
    } else {
      // Start recording
      setErrorMessage(null);
      // Prefer Web Speech if available, otherwise use MediaRecorder + Google Gemini
      if (hasSpeechRecognition) {
        const started = startSpeechRecognition();
        if (!started) {
          startMediaRecorder();
        }
      } else if (hasMediaRecorder) {
        startMediaRecorder();
      } else {
        setErrorMessage('Voice input is not supported in this browser.');
      }
    }
  };

  const isSupported = hasSpeechRecognition || hasMediaRecorder;

  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        title="Voice audio input is not supported in this browser"
        aria-label="Voice input not supported"
        className={`flex items-center justify-center text-slate-400 opacity-40 cursor-not-allowed select-none ${
          variant === 'pill'
            ? 'px-3 py-1.5 rounded-full text-xs font-semibold gap-1.5 border border-slate-700/40'
            : 'p-2 rounded-xl'
        } ${className}`}
      >
        <MicOff className="w-4 h-4" />
        {variant === 'pill' && <span>Voice</span>}
      </button>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled || isTranscribing}
        aria-label={
          isRecording
            ? 'Stop recording voice prompt'
            : isTranscribing
            ? 'Transcribing audio with Google Gemini...'
            : 'Voice prompt input (Speech or Google Audio API)'
        }
        title={
          isRecording
            ? 'Listening... Click to stop and transcribe'
            : isTranscribing
            ? 'Transcribing speech via Google Gemini audio API...'
            : hasSpeechRecognition
            ? 'Dictate prompt by voice (Open Web Speech)'
            : 'Record audio prompt (Google Gemini Audio API)'
        }
        className={`relative flex items-center justify-center transition-all duration-200 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-95 ${
          variant === 'pill'
            ? 'px-3 py-1.5 rounded-full text-xs font-semibold gap-1.5 border'
            : 'p-2 rounded-xl'
        } ${
          isRecording
            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/60 shadow-[0_0_14px_rgba(244,63,94,0.45)] animate-pulse'
            : isTranscribing
            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
            : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
      >
        {isTranscribing ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            {variant === 'pill' && <span className="text-[11px] font-mono">Transcribing...</span>}
          </span>
        ) : isRecording ? (
          <span className="flex items-center gap-1.5">
            <span className="relative flex items-center justify-center">
              <Square className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
              <span className="absolute -inset-1 rounded-full bg-rose-500/30 animate-ping" />
            </span>
            {/* Visualizer audio wave bars */}
            <span className="flex items-center gap-0.5 h-3">
              <span
                className="w-0.5 bg-rose-400 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(4, (audioLevel / 100) * 12)}px` }}
              />
              <span
                className="w-0.5 bg-rose-400 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(6, (audioLevel / 100) * 14)}px` }}
              />
              <span
                className="w-0.5 bg-rose-400 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(4, (audioLevel / 100) * 10)}px` }}
              />
            </span>
            {variant === 'pill' && <span className="text-[11px] font-mono text-rose-300">Listening</span>}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Mic className="w-4 h-4" />
            {variant === 'pill' && <span>Voice</span>}
          </span>
        )}
      </button>

      {/* Inline Temporary Error Tooltip */}
      {errorMessage && (
        <div
          role="alert"
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-rose-950/90 text-rose-200 border border-rose-500/40 text-[11px] shadow-lg flex items-center gap-1.5 z-50 whitespace-nowrap animate-in fade-in slide-in-from-bottom-1"
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-1 text-rose-400 hover:text-rose-100 font-bold"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
