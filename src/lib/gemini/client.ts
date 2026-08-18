import { buildPersonalizationPrompt } from './prompts';
import { validatePersonalizationOutput } from './schemas';
import { renderTemplate, LeadMergeContext } from '../templates/compiler';
import { GeminiPersonalizationOutput } from '../../types/domain';

export interface PersonalizationRequest {
  workspaceId: string;
  lead: LeadMergeContext;
  subjectTemplate: string;
  bodyTemplate: string;
  aiInstructions?: string | null;
  model?: string;
  timeoutMs?: number;
}

export interface PersonalizationResult {
  source: 'ai_generated' | 'deterministic_fallback';
  subject: string;
  bodyText: string;
  bodyHtml: string;
  reasoning: string;
  latencyMs: number;
  tokensUsed?: { input: number; output: number };
  modelUsed: string;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MODEL = 'gemini-1.5-flash';

/**
 * Generates personalized email content using Google Gemini with strict schema validation.
 * Guaranteed to fail closed to deterministic non-AI template rendering on ANY error.
 */
export async function generatePersonalizedEmail(
  request: PersonalizationRequest
): Promise<PersonalizationResult> {
  const startTime = Date.now();
  const modelName = request.model || DEFAULT_MODEL;
  const timeoutMs = request.timeoutMs || DEFAULT_TIMEOUT_MS;

  // Fallback baseline: compiled parameterized template
  const fallback = renderTemplate(
    request.subjectTemplate,
    request.bodyTemplate,
    request.lead
  );

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      source: 'deterministic_fallback',
      subject: fallback.subject,
      bodyText: fallback.bodyText,
      bodyHtml: fallback.bodyHtml,
      reasoning: 'GEMINI_API_KEY is not configured; fell back to parameterized template.',
      latencyMs: Date.now() - startTime,
      modelUsed: 'deterministic_fallback',
      error: 'GEMINI_API_KEY_MISSING',
    };
  }

  const { systemPrompt, userPrompt } = buildPersonalizationPrompt({
    lead: request.lead,
    subjectTemplate: request.subjectTemplate,
    bodyTemplate: request.bodyTemplate,
    aiInstructions: request.aiInstructions,
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
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return {
        source: 'deterministic_fallback',
        subject: fallback.subject,
        bodyText: fallback.bodyText,
        bodyHtml: fallback.bodyHtml,
        reasoning: `Gemini API returned status ${response.status}: ${errText.slice(0, 100)}`,
        latencyMs: Date.now() - startTime,
        modelUsed: modelName,
        error: `GEMINI_HTTP_${response.status}`,
      };
    }

    const json = await response.json();
    const candidateText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return {
        source: 'deterministic_fallback',
        subject: fallback.subject,
        bodyText: fallback.bodyText,
        bodyHtml: fallback.bodyHtml,
        reasoning: 'Gemini candidate response was empty.',
        latencyMs: Date.now() - startTime,
        modelUsed: modelName,
        error: 'EMPTY_CANDIDATE_RESPONSE',
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(candidateText);
    } catch {
      return {
        source: 'deterministic_fallback',
        subject: fallback.subject,
        bodyText: fallback.bodyText,
        bodyHtml: fallback.bodyHtml,
        reasoning: 'Gemini output was malformed JSON.',
        latencyMs: Date.now() - startTime,
        modelUsed: modelName,
        error: 'MALFORMED_JSON_OUTPUT',
      };
    }

    // Strict runtime schema validation
    const validation = validatePersonalizationOutput(parsed);
    if (!validation.valid || !validation.data) {
      return {
        source: 'deterministic_fallback',
        subject: fallback.subject,
        bodyText: fallback.bodyText,
        bodyHtml: fallback.bodyHtml,
        reasoning: `Gemini output failed schema validation: ${validation.error}`,
        latencyMs: Date.now() - startTime,
        modelUsed: modelName,
        error: `SCHEMA_VALIDATION_FAILED: ${validation.error}`,
      };
    }

    const inputTokens = json?.usageMetadata?.promptTokenCount || 0;
    const outputTokens = json?.usageMetadata?.candidatesTokenCount || 0;

    return {
      source: 'ai_generated',
      subject: validation.data.subject,
      bodyText: validation.data.bodyText,
      bodyHtml: validation.data.bodyHtml,
      reasoning: validation.data.personalizationReasoning,
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: inputTokens, output: outputTokens },
      modelUsed: modelName,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    const isTimeout = error.name === 'AbortError';

    return {
      source: 'deterministic_fallback',
      subject: fallback.subject,
      bodyText: fallback.bodyText,
      bodyHtml: fallback.bodyHtml,
      reasoning: isTimeout ? 'Gemini API call timed out.' : `Gemini call failed: ${error.message}`,
      latencyMs: Date.now() - startTime,
      modelUsed: modelName,
      error: isTimeout ? 'TIMEOUT_EXCEEDED' : error.message,
    };
  }
}
