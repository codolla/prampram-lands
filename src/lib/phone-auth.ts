/**
 * Phone-as-identifier helpers for authentication.
 *
 * The Secretariat prefers phone-number sign-in over email. To avoid requiring
 * an SMS OTP provider, we map phone numbers to a synthetic email address
 * (`{e164}@phone.local`) that Supabase's email/password auth accepts.
 *
 * - Existing accounts created with a real email continue to work — the login
 *   form accepts either a phone number or an email as the identifier.
 * - When a phone-shaped value is entered, we normalise it (strip spaces,
 *   convert local Ghanaian `0XXXXXXXXX` to `+233XXXXXXXXX`) before mapping.
 */

const GHANA_CC = "+233";

/** Returns true if the input looks like a phone number (digits, + and spaces). */
export function looksLikePhone(input: string): boolean {
  const v = input.trim();
  if (!v) return false;
  if (v.includes("@")) return false;
  // Must contain mostly digits
  const digits = v.replace(/[^\d]/g, "");
  return digits.length >= 7 && /^[+\d][\d\s\-()]*$/.test(v);
}

/** Normalise a Ghanaian phone number to E.164 (+233XXXXXXXXX). */
export function normalisePhone(input: string): string {
  let v = input.trim().replace(/[\s\-()]/g, "");
  if (v.startsWith("+")) return v;
  if (v.startsWith("00")) return "+" + v.slice(2);
  if (v.startsWith("0")) return GHANA_CC + v.slice(1);
  // Bare digits assumed to already be national without leading 0
  return GHANA_CC + v;
}

/** Map a phone identifier to the synthetic email used by Supabase auth. */
export function phoneToAuthEmail(phone: string): string {
  const e164 = normalisePhone(phone);
  // Strip the + so the local-part is purely digits
  return `${e164.replace(/^\+/, "")}@phone.local`;
}

/**
 * Resolve any identifier (phone or email) to the email Supabase expects.
 * Returns both the auth email and the normalised phone (if applicable) so
 * callers can store the phone on the user profile.
 */
export function resolveIdentifier(identifier: string): {
  email: string;
  phone: string | null;
} {
  const v = identifier.trim();
  if (looksLikePhone(v)) {
    const phone = normalisePhone(v);
    return { email: phoneToAuthEmail(phone), phone };
  }
  return { email: v, phone: null };
}