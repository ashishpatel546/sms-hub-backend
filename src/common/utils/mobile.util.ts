/**
 * Mirrors `sms-backend/src/common/utils/mobile.util.ts` — hub console
 * accounts can log in by mobile the same way tenant staff/parents already
 * do, and login there does an exact string match. A number saved as
 * "9716 160389" would store fine but never match a login attempt, so every
 * write path must normalise to a bare 10-digit number and reject anything
 * that isn't one.
 */
export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

/**
 * Strips formatting (spaces, dashes, brackets) and the common country/trunk
 * prefixes so `+91 97161-60389`, `097161 60389` and `9716160389` all collapse
 * to the same stored value. Anything else is left as-is on purpose — stray
 * characters must survive so validation can reject them rather than silently
 * "cleaning" a typo into a different number. Non-string input is returned
 * untouched so class-validator can report the real type error.
 */
export function normalizeMobile(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const compact = value.replace(/[\s\-().]/g, '');
  return compact.replace(/^(?:\+?91|0)(?=\d{10}$)/, '');
}

export function isValidMobile(value: unknown): value is string {
  return typeof value === 'string' && INDIAN_MOBILE_REGEX.test(value);
}
