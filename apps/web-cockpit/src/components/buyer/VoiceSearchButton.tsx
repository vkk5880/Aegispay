'use client';

import React from 'react';
import { AudioPromptButton } from './AudioPromptButton';

export interface VoiceSearchButtonProps {
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Hands-free Voice Search Button for conversational product discovery.
 * Strictly adheres to GUARDRAIL 2:
 * Wraps in `typeof window !== 'undefined'`, supports both native Web Speech API
 * and MediaRecorder + Google Gemini Multimodal Audio API fallback.
 */
export const VoiceSearchButton: React.FC<VoiceSearchButtonProps> = ({
  onTranscript,
  disabled = false,
  className = '',
}) => {
  return (
    <AudioPromptButton
      onTranscript={onTranscript}
      disabled={disabled}
      className={className}
    />
  );
};
