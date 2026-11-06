'use client';

import { useRef, useState, useEffect } from 'react';

export function useCyberAudio() {
  const audioCtxMain = useRef<AudioContext | null>(null);
  const droneOscillator = useRef<OscillatorNode | null>(null);
  const droneGain = useRef<GainNode | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    return () => {
      if (droneOscillator.current) {
        try {
          droneOscillator.current.stop();
          droneOscillator.current.disconnect();
        } catch {
          // ignore teardown error
        }
      }
      if (audioCtxMain.current && audioCtxMain.current.state !== 'closed') {
        try {
          audioCtxMain.current.close();
        } catch {
          // ignore close error
        }
      }
    };
  }, []);

  const initAudio = () => {
    if (typeof window === 'undefined') return;

    if (!audioCtxMain.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof window.AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        audioCtxMain.current = new AudioCtx();
      }
    }

    if (audioCtxMain.current && audioCtxMain.current.state === 'suspended') {
      audioCtxMain.current.resume();
    }

    if (audioCtxMain.current && !droneOscillator.current) {
      try {
        droneOscillator.current = audioCtxMain.current.createOscillator();
        droneGain.current = audioCtxMain.current.createGain();

        droneOscillator.current.type = 'sawtooth';
        droneOscillator.current.frequency.setValueAtTime(55, audioCtxMain.current.currentTime); // Low A

        droneGain.current.gain.setValueAtTime(0, audioCtxMain.current.currentTime);
        droneGain.current.gain.linearRampToValueAtTime(0.04, audioCtxMain.current.currentTime + 2);

        const filter = audioCtxMain.current.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;

        droneOscillator.current.connect(filter);
        filter.connect(droneGain.current);
        droneGain.current.connect(audioCtxMain.current.destination);

        droneOscillator.current.start();
      } catch (err) {
        console.warn('AudioContext initialization deferred:', err);
      }
    }

    setIsInitialized(true);
  };

  const playClick = () => {
    if (!isInitialized || !audioCtxMain.current) return;
    try {
      const osc = audioCtxMain.current.createOscillator();
      const gain = audioCtxMain.current.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800 + Math.random() * 400, audioCtxMain.current.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, audioCtxMain.current.currentTime + 0.05);

      gain.gain.setValueAtTime(0.05, audioCtxMain.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxMain.current.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(audioCtxMain.current.destination);
      osc.start();
      osc.stop(audioCtxMain.current.currentTime + 0.05);
    } catch {
      // ignore playback error
    }
  };

  const playBeam = () => {
    if (!isInitialized || !audioCtxMain.current) return;
    try {
      const osc = audioCtxMain.current.createOscillator();
      const gain = audioCtxMain.current.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, audioCtxMain.current.currentTime);
      osc.frequency.linearRampToValueAtTime(60, audioCtxMain.current.currentTime + 1.2);

      gain.gain.setValueAtTime(0.25, audioCtxMain.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxMain.current.currentTime + 1.2);

      osc.connect(gain);
      gain.connect(audioCtxMain.current.destination);
      osc.start();
      osc.stop(audioCtxMain.current.currentTime + 1.2);
    } catch {
      // ignore playback error
    }
  };

  const playSuccess = () => {
    if (!isInitialized || !audioCtxMain.current) return;
    try {
      const osc = audioCtxMain.current.createOscillator();
      const gain = audioCtxMain.current.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, audioCtxMain.current.currentTime);
      osc.frequency.setValueAtTime(659.25, audioCtxMain.current.currentTime + 0.08); // E5
      osc.frequency.setValueAtTime(880, audioCtxMain.current.currentTime + 0.16); // A5

      gain.gain.setValueAtTime(0.12, audioCtxMain.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxMain.current.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(audioCtxMain.current.destination);
      osc.start();
      osc.stop(audioCtxMain.current.currentTime + 0.5);
    } catch {
      // ignore playback error
    }
  };

  const setScrollVelocity = (velocity: number) => {
    if (!isInitialized || !droneOscillator.current || !audioCtxMain.current) return;
    try {
      const clamped = Math.min(Math.abs(velocity), 100);
      const targetFreq = 55 + clamped * 1.5;
      droneOscillator.current.frequency.setTargetAtTime(
        targetFreq,
        audioCtxMain.current.currentTime,
        0.1
      );
    } catch {
      // ignore frequency error
    }
  };

  return { initAudio, isInitialized, playClick, playBeam, playSuccess, setScrollVelocity };
}
