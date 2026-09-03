import { groupedDecimal, groupedNumber } from './number-format';

describe('groupedNumber', () => {
  it('groups with a space for Polish (comma would read as a decimal separator)', () => {
    // ICU may use NBSP (U+00A0) or narrow NBSP (U+202F) as the PL group separator.
    expect(groupedNumber('pl', 12800)).toMatch(/^12[\s  ]800$/);
  });

  it('groups with a comma for English', () => {
    expect(groupedNumber('en', 12800)).toBe('12,800');
  });
});

describe('groupedDecimal', () => {
  it('uses a comma decimal separator + two fraction digits for Polish', () => {
    expect(groupedDecimal('pl', 0)).toBe('0,00');
    expect(groupedDecimal('pl', 29)).toBe('29,00');
  });

  it('uses a dot decimal separator for English', () => {
    expect(groupedDecimal('en', 0)).toBe('0.00');
    expect(groupedDecimal('en', 99.5)).toBe('99.50');
  });
});
