import { 
  GeminiPersonalizationOutput, 
  GeminiAdvisorySpamCheck, 
  GeminiReplyClassificationOutput, 
  ReplyIntentCategory, 
  SuggestedReplyAction 
} from '../../types/domain';

export const MAX_SUBJECT_LENGTH = 120;
export const MAX_BODY_LENGTH = 4000;
export const VALID_REPLY_CATEGORIES: ReplyIntentCategory[] = [
  'interested',
  'not_interested',
  'out_of_office',
  'unsubscribe_request',
  'wrong_person',
  'more_information_needed',
  'follow_up_later',
  'unknown',
];

export const VALID_SUGGESTED_ACTIONS: SuggestedReplyAction[] = [
  'auto_stop_and_notify',
  'auto_unsubscribe',
  'reschedule_followup',
  'ignore_ooo',
  'manual_review',
];

/**
 * Validates untrusted model output for cold email personalization.
 * Enforces field presence, type safety, and maximum length limits.
 */
export function validatePersonalizationOutput(raw: any): {
  valid: boolean;
  data?: GeminiPersonalizationOutput;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Model output must be a non-null JSON object.' };
  }

  if (typeof raw.subject !== 'string' || raw.subject.trim().length === 0) {
    return { valid: false, error: 'Model output missing required non-empty string: subject.' };
  }

  if (typeof raw.body_text !== 'string' || raw.body_text.trim().length === 0) {
    return { valid: false, error: 'Model output missing required non-empty string: body_text.' };
  }

  const subject = raw.subject.trim();
  const bodyText = raw.body_text.trim();
  const bodyHtml = typeof raw.body_html === 'string' && raw.body_html.trim().length > 0 
    ? raw.body_html.trim() 
    : `<p>${bodyText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
  const reasoning = typeof raw.personalization_reasoning === 'string' 
    ? raw.personalization_reasoning.trim().slice(0, 500) 
    : 'Automated personalization generated.';

  if (subject.length > MAX_SUBJECT_LENGTH) {
    return { valid: false, error: `Generated subject exceeds maximum length of ${MAX_SUBJECT_LENGTH} characters.` };
  }

  if (bodyText.length > MAX_BODY_LENGTH) {
    return { valid: false, error: `Generated body text exceeds maximum length of ${MAX_BODY_LENGTH} characters.` };
  }

  return {
    valid: true,
    data: {
      subject,
      bodyText,
      bodyHtml,
      personalizationReasoning: reasoning,
    },
  };
}

/**
 * Validates untrusted model output for advisory spam and deliverability scoring.
 */
export function validateSpamAuditOutput(raw: any): {
  valid: boolean;
  data?: GeminiAdvisorySpamCheck;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Spam audit output must be a non-null JSON object.' };
  }

  const rawScore = Number(raw.spam_risk_score);
  const spamRiskScore = isNaN(rawScore) ? 0.5 : Math.min(1.0, Math.max(0.0, rawScore));

  const rawReadability = Number(raw.readability_score);
  const readabilityScore = isNaN(rawReadability) ? 70 : Math.min(100, Math.max(0, rawReadability));

  const flaggedKeywords = Array.isArray(raw.flagged_keywords)
    ? raw.flagged_keywords.filter((k: any) => typeof k === 'string').slice(0, 20)
    : [];

  const recommendations = Array.isArray(raw.advisory_recommendations)
    ? raw.advisory_recommendations.filter((r: any) => typeof r === 'string').slice(0, 10)
    : [];

  return {
    valid: true,
    data: {
      spamRiskScore,
      flaggedKeywords,
      readabilityScore,
      advisoryRecommendations: recommendations,
    },
  };
}

/**
 * Validates untrusted model output for inbound reply classification.
 */
export function validateReplyClassificationOutput(raw: any): {
  valid: boolean;
  data?: GeminiReplyClassificationOutput;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Reply classification output must be a non-null JSON object.' };
  }

  const category = (raw.category || 'unknown').toLowerCase().trim() as ReplyIntentCategory;
  if (!VALID_REPLY_CATEGORIES.includes(category)) {
    return { valid: false, error: `Invalid category '${raw.category}' not in allowed category enum.` };
  }

  const rawConfidence = Number(raw.confidence);
  const confidence = isNaN(rawConfidence) ? 0.0 : Math.min(1.0, Math.max(0.0, rawConfidence));

  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 300) : 'Inbound reply analyzed.';
  
  const actionRequired = (raw.action_required || 'manual_review').toLowerCase().trim() as SuggestedReplyAction;
  const validatedAction = VALID_SUGGESTED_ACTIONS.includes(actionRequired) ? actionRequired : 'manual_review';

  const extractedReferralEmail = typeof raw.extracted_referral_email === 'string' && raw.extracted_referral_email.includes('@')
    ? raw.extracted_referral_email.trim().toLowerCase().slice(0, 320)
    : null;

  const suggestedReplyDraft = typeof raw.suggested_reply_draft === 'string'
    ? raw.suggested_reply_draft.trim().slice(0, 2000)
    : null;

  return {
    valid: true,
    data: {
      category,
      confidence,
      summary,
      actionRequired: validatedAction,
      extractedReferralEmail,
      suggestedReplyDraft,
    },
  };
}
