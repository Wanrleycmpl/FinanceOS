// Financial dates are calendar days (YYYY-MM-DD) in Brasília time, never timestamps.
export const FINANCE_TIMEZONE = "America/Sao_Paulo";

export function todayInBrazil(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FINANCE_TIMEZONE }).format(now);
}

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && value >= "1900-01-01";
}

/** "2026-10-17" -> "17/10/2026", without going through a timezone. */
export function formatDateBR(value: string): string {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}
