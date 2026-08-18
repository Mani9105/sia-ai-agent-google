export interface CampaignValidationInput {
  name: string;
  dailyLimit: number;
  workspaceDailyLimit: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  sendDays: number[];
  timezone: string;
  steps: Array<{
    stepNumber: number;
    delayDays: number;
    subjectTemplate?: string | null;
    bodyTemplate?: string | null;
  }>;
  activeAccountsCount: number;
}

export interface CampaignValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a campaign configuration deterministically before allowing activation to 'running' state.
 */
export function validateCampaignForActivation(input: CampaignValidationInput): CampaignValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Name
  if (!input.name || input.name.trim().length === 0) {
    errors.push('Campaign name cannot be empty.');
  }

  // 2. Daily limits
  if (input.dailyLimit <= 0) {
    errors.push('Campaign daily limit must be greater than 0.');
  }
  if (input.dailyLimit > input.workspaceDailyLimit) {
    errors.push(`Campaign daily limit (${input.dailyLimit}) cannot exceed workspace daily limit (${input.workspaceDailyLimit}).`);
  }

  // 3. Sequence steps
  if (!input.steps || input.steps.length === 0) {
    errors.push('Campaign must contain at least one sequence step.');
  } else {
    input.steps.forEach((step, idx) => {
      if (!step.subjectTemplate || step.subjectTemplate.trim().length === 0) {
        errors.push(`Step ${step.stepNumber || idx + 1} is missing a subject line template.`);
      }
      if (!step.bodyTemplate || step.bodyTemplate.trim().length === 0) {
        errors.push(`Step ${step.stepNumber || idx + 1} is missing a body template.`);
      }
      if (step.delayDays < 0) {
        errors.push(`Step ${step.stepNumber || idx + 1} has an invalid negative delay.`);
      }
    });
  }

  // 4. Send window
  if (!input.sendWindowStart || !input.sendWindowEnd) {
    errors.push('Campaign must have both a send window start and end time configured.');
  } else if (input.sendWindowStart >= input.sendWindowEnd) {
    errors.push(`Send window start (${input.sendWindowStart}) must be earlier than end time (${input.sendWindowEnd}).`);
  }

  // 5. Send days
  if (!input.sendDays || input.sendDays.length === 0) {
    errors.push('Campaign must have at least one allowed sending day configured.');
  } else if (input.sendDays.some((d) => d < 1 || d > 7)) {
    errors.push('Send days must be integers between 1 (Monday) and 7 (Sunday).');
  }

  // 6. Timezone validity
  try {
    Intl.DateTimeFormat(undefined, { timeZone: input.timezone || 'UTC' });
  } catch {
    errors.push(`Invalid IANA timezone string: '${input.timezone}'`);
  }

  // 7. Active Accounts
  if (input.activeAccountsCount <= 0) {
    errors.push('Workspace has no active email accounts. Connect an inbox before activating campaign.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
