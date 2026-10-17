// FinanceOS is a single-user personal app for now: one account, created by the owner in the
// Supabase dashboard (public sign-up is disabled there). Supabase Auth identifies users by
// e-mail, so a plain username like "wanrley" maps to "wanrley@financeos.local".
// A full e-mail typed in the login field is used as is.
export const LOGIN_EMAIL_DOMAIN = "financeos.local";

export function loginToEmail(login: string): string | null {
  const value = login.trim().toLowerCase();
  if (value.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
  return /^[a-z0-9._-]{3,40}$/.test(value) ? `${value}@${LOGIN_EMAIL_DOMAIN}` : null;
}
