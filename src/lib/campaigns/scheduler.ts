import { SendWindowConfig, isWithinSendWindow } from '../engine/cadence';

/**
 * Calculates the next allowable send timestamp for a sequence step
 * adhering to step delays, send days, working hours, and timezone.
 */
export function calculateStepSendTimestamp(
  baseDate: Date,
  delayDays: number,
  config: SendWindowConfig
): Date {
  const targetDate = new Date(baseDate.getTime() + delayDays * 86400 * 1000);

  // If initial step (delay 0), verify if currently in window
  if (delayDays === 0) {
    const windowCheck = isWithinSendWindow(config, targetDate);
    if (windowCheck.allowed) {
      return targetDate;
    }
  }

  // Adjust date forward until it lands on an allowed send day and within send window
  let safetyCounter = 0;
  while (safetyCounter < 14) {
    const check = isWithinSendWindow(config, targetDate);
    if (check.allowed) {
      return targetDate;
    }
    // Advance by 1 hour
    targetDate.setTime(targetDate.getTime() + 3600 * 1000);
    safetyCounter++;
  }

  return targetDate;
}
