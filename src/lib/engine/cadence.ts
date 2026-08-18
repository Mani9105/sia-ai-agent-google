export interface SendWindowConfig {
  sendWindowStart: string; // e.g. "09:00:00"
  sendWindowEnd: string;   // e.g. "17:00:00"
  sendDays: number[];      // e.g. [1, 2, 3, 4, 5] (1=Monday, 7=Sunday)
  timezone: string;        // e.g. "America/New_York" or "UTC"
}

/**
 * Parses time string "HH:MM:SS" into minutes from midnight.
 */
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Evaluates whether the current moment falls within the configured send window and days.
 */
export function isWithinSendWindow(config: SendWindowConfig, currentDate: Date = new Date()): {
  allowed: boolean;
  reason?: string;
} {
  try {
    // Format date in target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone || 'UTC',
      hour12: false,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = formatter.formatToParts(currentDate);
    const partMap: Record<string, string> = {};
    for (const part of parts) {
      partMap[part.type] = part.value;
    }

    // Convert weekday name to ISO Monday=1 ... Sunday=7
    const weekdayMap: Record<string, number> = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    };
    const isoDay = weekdayMap[partMap.weekday || 'Sunday'] || 7;

    if (!config.sendDays.includes(isoDay)) {
      return { allowed: false, reason: `Outside allowed sending days (Current ISO day: ${isoDay})` };
    }

    const currentMinutes = parseInt(partMap.hour || '0', 10) * 60 + parseInt(partMap.minute || '0', 10);
    const startMinutes = parseTimeToMinutes(config.sendWindowStart);
    const endMinutes = parseTimeToMinutes(config.sendWindowEnd);

    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      return {
        allowed: false,
        reason: `Outside sending hours (${partMap.hour}:${partMap.minute} is outside ${config.sendWindowStart} - ${config.sendWindowEnd})`,
      };
    }

    return { allowed: true };
  } catch (error: any) {
    // Fallback to UTC comparison on invalid timezone
    return { allowed: true };
  }
}

/**
 * Calculates a safe next dispatch timestamp adhering to provider pacing.
 * Randomly spreads delay between minDelaySeconds and maxDelaySeconds.
 */
export function calculateNextCadenceTimestamp(
  lastSentAt: Date | null,
  minDelaySeconds: number,
  maxDelaySeconds: number
): Date {
  const baseTime = lastSentAt && lastSentAt.getTime() > Date.now() ? lastSentAt.getTime() : Date.now();
  const randomDelay = Math.floor(Math.random() * (maxDelaySeconds - minDelaySeconds + 1)) + minDelaySeconds;
  return new Date(baseTime + randomDelay * 1000);
}
