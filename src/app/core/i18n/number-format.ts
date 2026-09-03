/**
 * Locale-aware integer grouping keyed on the ACTIVE Transloco language —
 * "12 800" in Polish, "12,800" in English. Angular's DecimalPipe follows the
 * build-time LOCALE_ID, not the runtime language switch, so PL users would
 * see comma grouping (which reads as a decimal separator in Polish). Used
 * anywhere a raw count renders inside translated copy.
 */
export function groupedNumber(activeLang: string, n: number): string {
  return new Intl.NumberFormat(activeLang === 'pl' ? 'pl-PL' : 'en-US').format(n);
}

/**
 * Locale-aware fixed-decimal formatting — "0,00" in Polish, "0.00" in
 * English. Same reason as {@link groupedNumber}: Angular's `number` pipe
 * follows the build-time locale, so a PLN price rendered through it shows a
 * dot decimal separator on the Polish surface, which is wrong for pl-PL.
 */
export function groupedDecimal(activeLang: string, n: number, fractionDigits = 2): string {
  return new Intl.NumberFormat(activeLang === 'pl' ? 'pl-PL' : 'en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}
