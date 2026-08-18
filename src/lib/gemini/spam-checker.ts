import { buildSpamAuditPrompt } from './prompts';
import { validateSpamAuditOutput } from './schemas';
import { GeminiAdvisorySpamCheck } from '../../types/domain';

export interface SpamAuditRequest {
  subject: string;
  bodyText: string;
  timeoutMs?: number;
}

export interface SpamAuditResult {
  audit: GeminiAdvisorySpamCheck;
  latencyMs: number;
  tokensUsed?: { input: number; output: number };
  modelUsed: string;
  error?: string;
}

/**
 * Performs advisory-only spam and deliverability analysis.
 * Non-blocking advisory telemetry for campaign preview.
 */
export async function auditEmailSpamRisk(request: SpamAuditRequest): Promise<SpamAuditResult> {
  const startTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = 'gemini-1.5-flash';
  const timeoutMs = request.timeoutMs || 8000;

  const fallback: GeminiAdvisorySpamCheck = {
    spamRiskScore: 0.1, // Default neutral-clean
    flaggedKeywords: [],
    readabilityScore: 80,
    advisoryRecommendations: ['Keep emails under 150 words for optimal deliverability.'],
  };

  if (!apiKey) {
    return {
      audit: fallback,
      latencyMs: Date.now() - startTime,
      modelUsed: 'offline_fallback',
      error: 'GEMINI_API_KEY_MISSING',
    };
  }

  const { systemPrompt, userPrompt } = buildSpamAuditPrompt({
    subject: request.subject,
    bodyText: request.bodyText,
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
          temperature: 0.2,
          maxOutputTokens: 512,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        audit: fallback,
        latencyMs: Date.now() - startTime,
        modelUsed: modelName,
        error: `GEMINI_HTTP_${response.status}`,
      };
    }

    const json = await response.json();
    const candidateText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return {
        audit: fallback,
        latencyMs: Date.now() - startTime,
        modelUsed: modelName,
        error: 'EMPTY_RESPONSE',
      };
    }

    const parsed = JSON.parse(candidateText);
    const validation = validateSpamAuditOutput(parsed);

    if (!validation.valid || !validation.data) {
      return {
        audit: fallback,
        latencyMs: Date.now() - startTime,
        modelUsed: modelName,
        error: `SCHEMA_VALIDATION_ERROR: ${validation.error}`,
      };
    }

    const inputTokens = json?.usageMetadata?.promptTokenCount || 0;
    const outputTokens = json?.usageMetadata?.candidatesTokenCount || 0;

    return {
      audit: validation.data,
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: inputTokens, output: outputTokens },
      modelUsed: modelName,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    return {
      audit: fallback,
      latencyMs: Date.now() - startTime,
      modelUsed: modelName,
      error: error.message,
    };
  }
}
