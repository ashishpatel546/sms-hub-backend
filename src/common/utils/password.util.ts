import { randomInt } from 'crypto';

// Not a secret — a fixed alphabet used to generate one-off passwords at
// request time. Excludes visually ambiguous characters (0/O, 1/l/I) since
// this is read and retyped by a human relaying it over a secure channel.
//
// Mirrors `src/modules/admin/password.util.ts` in sms-backend deliberately:
// an operator resetting a hub password and a school password on the same
// afternoon should get credentials that look and behave identically.
const RANDOM_ALPHANUMERIC_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZ' + 'abcdefghijkmnpqrstuvwxyz' + '23456789';

export function generateTemporaryPassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out +=
      RANDOM_ALPHANUMERIC_ALPHABET[
        randomInt(RANDOM_ALPHANUMERIC_ALPHABET.length)
      ];
  }
  return out;
}
