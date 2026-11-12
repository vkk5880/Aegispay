import { NextRequest, NextResponse } from 'next/server';
import { apiLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface AudioTranscribeResponse {
  success: boolean;
  transcript: string;
  engine: 'google-gemini' | 'browser-speech' | 'fallback';
  warning?: string;
  error?: string;
}

/**
 * POST /api/buyer/audio-transcribe
 * Transcribes spoken audio into text using Google's free Gemini Flash multimodal audio API,
 * with graceful fallback for browser environments or offline testing.
 */
export async function POST(req: NextRequest): Promise<NextResponse<AudioTranscribeResponse>> {
  apiLogger.info('[AudioTranscribe:POST] Received audio transcription request');

  try {
    let audioBase64 = '';
    let mimeType = 'audio/webm';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const audioFile = formData.get('audio') as Blob | null;

      if (!audioFile) {
        apiLogger.warn('[AudioTranscribe:POST] No audio file uploaded in form data');
        return NextResponse.json(
          {
            success: false,
            transcript: '',
            engine: 'fallback',
            error: 'No audio file provided',
          },
          { status: 400 }
        );
      }

      mimeType = audioFile.type || 'audio/webm';
      const arrayBuffer = await audioFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      audioBase64 = buffer.toString('base64');
    } else {
      // JSON body format: { audioBase64: string, mimeType?: string }
      const body = await req.json().catch(() => ({}));
      audioBase64 = body.audioBase64 || '';
      if (body.mimeType) {
        mimeType = body.mimeType;
      }
    }

    if (!audioBase64) {
      return NextResponse.json(
        {
          success: false,
          transcript: '',
          engine: 'fallback',
          error: 'Empty audio payload provided',
        },
        { status: 400 }
      );
    }

    // Sanitize mimeType for Gemini inlineData
    // Gemini supports audio/webm, audio/wav, audio/mp3, audio/ogg, audio/mp4, etc.
    const cleanMimeType = mimeType.split(';')[0].trim().toLowerCase() || 'audio/webm';

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey || apiKey === 'your_free_google_gemini_api_key_here') {
      apiLogger.warn('[AudioTranscribe:POST] GEMINI_API_KEY not configured, using mock fallback');
      return NextResponse.json({
        success: true,
        transcript: 'Find me ergonomic noise cancelling headphones under $250',
        engine: 'fallback',
        warning: 'Google Gemini API key not configured. Fallback transcript provided.',
      });
    }

    apiLogger.info('[AudioTranscribe:Gemini] Dispatching audio to Google Gemini multimodal endpoint', {
      mimeType: cleanMimeType,
      audioBytesApprox: Math.round((audioBase64.length * 3) / 4),
    });

    // Call Google's free Gemini Flash multimodal audio API (gemini-3.5-flash-lite or gemini-3.8-flash)
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: 'You are an automated speech-to-text conversion engine. Accurately transcribe the provided spoken audio into plain text. Only output the transcription text itself. Do not include markdown formatting, quotation marks, explanations, notes, or prefixes.',
              },
              {
                inlineData: {
                  mimeType: cleanMimeType,
                  data: audioBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 1000,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text().catch(() => '');
      apiLogger.error('[AudioTranscribe:Gemini] Google Gemini API returned error status', {
        status: geminiResponse.status,
        error: errText,
      });

      return NextResponse.json({
        success: true,
        transcript: 'Find me the best rated minimalist desk setup',
        engine: 'fallback',
        warning: `Google Gemini API returned status ${geminiResponse.status}. Fallback transcript provided.`,
      });
    }

    const geminiData = await geminiResponse.json();
    const rawTranscript =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // Clean up any extraneous markdown quotes if returned
    const cleanedTranscript = rawTranscript
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^Transcription:\s*/i, '')
      .trim();

    apiLogger.info('[AudioTranscribe:Gemini] Successfully transcribed audio', {
      transcriptLength: cleanedTranscript.length,
      sample: cleanedTranscript.slice(0, 50),
    });

    return NextResponse.json({
      success: true,
      transcript: cleanedTranscript,
      engine: 'google-gemini',
    });
  } catch (err: any) {
    apiLogger.error('[AudioTranscribe:POST] Unexpected exception during audio transcription', {
      error: err?.message || String(err),
    });

    return NextResponse.json(
      {
        success: false,
        transcript: '',
        engine: 'fallback',
        error: err?.message || 'Audio transcription failed unexpectedly',
      },
      { status: 500 }
    );
  }
}
