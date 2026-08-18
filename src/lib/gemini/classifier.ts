import { buildReplyClassificationPrompt } from './prompts';
import { validateReplyClassificationOutput } from './schemas';
import { GeminiReplyClassificationOutput } from '../../types/domain';

export interface ClassifyReplyRequest {
  originalSubject: string;
  originalBodyText: string;
  inboundReplyText: string;
  senderEmail: string;
  timeoutMs?: number;
}

export interface ClassifyReplyResult {
  classification: GeminiReplyClassificationOutput;
  latencyMs: number;
  tokensUsed?: { input: number; output: number };
  modelUsed: string;
  error?: string;
}

/**
 * Classifies inbound reply intent using Google Gemini.
 * Fails safely to 'unknown' with 'manual_review' on any failure.
 */
export async function classifyInboundReply(
  request: ClassifyReplyRequest
): Promise<ClassifyReplyResult> {
  const startTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = 'gemini-1.5-flash';
  const timeoutMs = request.timeoutMs || 8000;

  const fallback: GeminiReplyClassificationOutput = {
    category: 'unknown',
    confidence: 0.0,
    summary: 'Automated classification unavailable; marked for manual review.',
    actionRequired: 'manual_review',
    extractedReferralEmail: null,
    suggestedReplyDraft: null,
  };

  if (!apiKey) {
    return {
      classification: fallback,
      latencyMs: Date.now() - startTime,
      modelUsed: 'offline_fallback',
      error: 'GEMINI_API_KEY_MISSING',
    };
  }

  const { systemPrompt, userPrompt } = buildReplyClassificationPrompt({
    originalSubject: request.originalSubject,
    originalBodyText: request.originalBodyText,
    inboundReplyText: request.inboundReplyText,
    senderEmail: request.senderEmail,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2, // Low temperature for consistent classification
          maxOutputTokens: 512,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        classification: fallback,
        latencyMs: Date.now() - startTime,
        modelUsed: modelName,
        error: `GEMINI_HTTP_${response.status}`,
      };
    }

    const json = await response.json();
    const candidateText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return {
        classification: fallback,
        latencyMs: Date.now() - startTime,
        modelUsed: modelName,
        error: 'EMPTY_RESPONSE',
      };
    }

    const parsed = JSON.parse(candidateText);
    const validation = validateReplyClassificationOutput(parsed);

    if (!validation.valid || !validation.data) {
      return {
        classification: fallback,
        latencyMs: Date.now() - startTime,
        modelUsed: modelName,
        error: `SCHEMA_VALIDATION_ERROR: ${validation.error}`,
      };
    }

    const inputTokens = json?.usageMetadata?.promptTokenCount || 0;
    const outputTokens = json?.usageMetadata?.candidatesTokenCount || 0;

    return {
      classification: validation.data,
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: inputTokens, output: outputTokens },
      modelUsed: modelName,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    return {
      classification: fallback,
      latencyMs: Date.now() - startTime,
      modelUsed: modelName,
      error: error.message,
    };
  }
}
