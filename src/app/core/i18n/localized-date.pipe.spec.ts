import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import { LocalizedDatePipe, formatLocalizedDate } from './localized-date.pipe';

describe('LocalizedDatePipe', () => {
  let lang = 'pl';
  const transloco = { getActiveLang: () => lang };

  beforeEach(() => {
    lang = 'pl';
    TestBed.configureTestingModule({
      providers: [LocalizedDatePipe, { provide: TranslocoService, useValue: transloco }],
    });
  });

  it('prints Polish month names on the Polish surface', () => {
    const pipe = TestBed.inject(LocalizedDatePipe);
    expect(pipe.transform('2026-06-22T10:00:00Z', 'mediumDate')).toMatch(/22 cze 2026/);
  });

  it('prints English month names once the language flips (impure: no new input needed)', () => {
    const pipe = TestBed.inject(LocalizedDatePipe);
    expect(pipe.transform('2026-01-10T12:00:00Z', 'mediumDate')).toMatch(/10 sty 2026/);
    lang = 'en';
    expect(pipe.transform('2026-01-10T12:00:00Z', 'mediumDate')).toBe('Jan 10, 2026');
  });

  it('medium adds a 24-hour clock in Polish and a 12-hour one in English', () => {
    expect(formatLocalizedDate('2026-06-24T10:05:00', 'medium', 'pl')).toMatch(
      /24 cze 2026,? 10:05/,
    );
    expect(formatLocalizedDate('2026-06-24T15:05:00', 'medium', 'en')).toMatch(
      /Jun 24, 2026,? 3:05 PM/,
    );
  });

  it('is empty for nothing and passes unparseable input through', () => {
    const pipe = TestBed.inject(LocalizedDatePipe);
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('not a date')).toBe('not a date');
  });
});
