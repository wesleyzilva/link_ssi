/**
 * time-checker.js — validates the current BRT time against target market windows.
 *
 * Windows (Brasília Time, BRT = UTC-3):
 *   US_EU  → 10:30–12:30  (US East Coast morning + UK/Germany mid-day)
 *   APAC   → 20:30–22:00  (China/Australia morning + US West Coast late afternoon)
 *
 * checkGlobalTime() is the entry-point called by the Service Worker
 * before initiating any automation sequence.
 */

export const TARGET_WINDOWS = {
  US_EU: 'US_EU',
  APAC: 'APAC',
};

const WINDOWS_CONFIG = {
  [TARGET_WINDOWS.US_EU]: {
    label: 'US East Coast + Europe',
    startHour: 10,
    startMinute: 30,
    endHour: 12,
    endMinute: 30,
    regions: ['US East Coast (NY/Miami)', 'UK', 'Germany', 'Netherlands'],
  },
  [TARGET_WINDOWS.APAC]: {
    label: 'APAC + US West Coast',
    startHour: 20,
    startMinute: 30,
    endHour: 22,
    endMinute: 0,
    regions: ['China', 'Australia', 'Singapore', 'US West Coast (SF/LA)'],
  },
};

/**
 * Returns the current time in BRT (UTC-3) as { hours, minutes }.
 */
function getBRTTime() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const brt = new Date(utcMs - 3 * 60 * 60 * 1000);
  return { hours: brt.getHours(), minutes: brt.getMinutes() };
}

/**
 * Converts hours + minutes to a comparable integer (e.g. 10:30 → 1030).
 */
function toMinutes(hours, minutes) {
  return hours * 60 + minutes;
}

/**
 * Validates whether the current BRT time falls within the specified target window.
 *
 * @param {string} window — one of TARGET_WINDOWS values
 * @returns {Promise<boolean>}
 */
export async function checkGlobalTime(window = TARGET_WINDOWS.US_EU) {
  const config = WINDOWS_CONFIG[window];
  if (!config) {
    console.error(`[TimeChecker] Unknown window: ${window}`);
    return false;
  }

  const { hours, minutes } = getBRTTime();
  const now = toMinutes(hours, minutes);
  const start = toMinutes(config.startHour, config.startMinute);
  const end = toMinutes(config.endHour, config.endMinute);

  const isWithinWindow = now >= start && now <= end;

  console.log(
    `[TimeChecker] BRT ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} — ` +
    `Window "${config.label}" (${config.startHour}:${String(config.startMinute).padStart(2, '0')}–` +
    `${config.endHour}:${String(config.endMinute).padStart(2, '0')}) — ` +
    `${isWithinWindow ? 'OPEN ✓' : 'CLOSED ✗'}`
  );

  return isWithinWindow;
}

/**
 * Returns the full window configuration for display in the popup.
 */
export function getWindowsConfig() {
  return WINDOWS_CONFIG;
}
