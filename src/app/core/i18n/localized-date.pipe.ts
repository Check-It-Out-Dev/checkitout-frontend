import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@ngneat/transloco';

/** The three presets the templates use — mirrors Angular's `date` names. */
export type LocalizedDateStyle = 'mediumDate' | 'medium' | 'short';

const LOCALES: Record<string, string> = { pl: 'pl-PL', en: 'en-US' };

const OPTIONS: Record<LocalizedDateStyle, Intl.DateTimeFormatOptions> = {
  mediumDate: { day: 'numeric', month: 'short', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  short: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
};

/**
 * Locale-aware date formatting keyed on the ACTIVE Transloco language —
 * "10 wrz 2026" on the Polish surface, "Sep 10, 2026" on the English one.
 * Angular's `date` pipe follows the build-time LOCALE_ID (en-US), which
 * printed English month names and 12-hour clocks on every Polish list
 * page. Same rule as {@link groupedNumber}.
 *
 * Impure on purpose: the output depends on the language signal, not only
 * on the input; a tiny memo keeps the re-evaluation free.
 */
@Pipe({ name: 'localizedDate', pure: false })
export class LocalizedDatePipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService);
  private memo: { key: string; out: string } | null = null;

  transform(
    value: string | number | Date | null | undefined,
    style: LocalizedDateStyle = 'mediumDate',
  ): string {
    if (value === null || value === undefined || value === '') return '';
    const lang = this.transloco.getActiveLang();
    const key = `${lang}|${style}|${value instanceof Date ? value.getTime() : String(value)}`;
    if (this.memo?.key === key) return this.memo.out;
    const out = formatLocalizedDate(value, style, lang);
    this.memo = { key, out };
    return out;
  }
}

/** Pure helper — usable from components that build strings outside templates. */
export function formatLocalizedDate(
  value: string | number | Date,
  style: LocalizedDateStyle,
  lang: string,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const locale = LOCALES[lang] ?? LOCALES['pl'];
  const english = lang === 'en';
  const options: Intl.DateTimeFormatOptions = {
    ...OPTIONS[style],
    // 12-hour clock without a leading zero in English ("3:05 PM"); Polish
    // keeps the zero-padded 24-hour clock ("15:05").
    ...(english && style === 'medium' ? { hour: 'numeric' } : {}),
    hour12: english && style !== 'short',
  };
  return new Intl.DateTimeFormat(locale, options).format(date);
}
