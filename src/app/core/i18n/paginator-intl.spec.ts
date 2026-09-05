import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import { Subject } from 'rxjs';
import { TranslocoPaginatorIntl } from './paginator-intl';

const PL: Record<string, string> = {
  'common.paginator.items_per_page': 'Wierszy na stronie:',
  'common.paginator.next_page': 'Następna strona',
  'common.paginator.previous_page': 'Poprzednia strona',
  'common.paginator.first_page': 'Pierwsza strona',
  'common.paginator.last_page': 'Ostatnia strona',
  'common.paginator.range': '{{start}}–{{end}} z {{total}}',
  'common.paginator.range_empty': '0 z {{total}}',
};
const EN: Record<string, string> = {
  'common.paginator.items_per_page': 'Items per page:',
  'common.paginator.next_page': 'Next page',
  'common.paginator.previous_page': 'Previous page',
  'common.paginator.first_page': 'First page',
  'common.paginator.last_page': 'Last page',
  'common.paginator.range': '{{start}}–{{end}} of {{total}}',
  'common.paginator.range_empty': '0 of {{total}}',
};

describe('TranslocoPaginatorIntl', () => {
  let lang = 'pl';
  const langChanges$ = new Subject<string>();
  const transloco = {
    getActiveLang: () => lang,
    langChanges$,
    translate: (key: string, params: Record<string, string> = {}) => {
      const raw = (lang === 'pl' ? PL : EN)[key] ?? key;
      return raw.replace(/\{\{(\w+)\}\}/g, (_m, p: string) => params[p] ?? '');
    },
  };

  beforeEach(() => {
    lang = 'pl';
    TestBed.configureTestingModule({
      providers: [TranslocoPaginatorIntl, { provide: TranslocoService, useValue: transloco }],
    });
  });

  it('renders Polish labels and a Polish range on the Polish surface', () => {
    const intl = TestBed.inject(TranslocoPaginatorIntl);
    expect(intl.itemsPerPageLabel).toBe('Wierszy na stronie:');
    expect(intl.nextPageLabel).toBe('Następna strona');
    expect(intl.getRangeLabel(0, 12, 3)).toBe('1–3 z 3');
    expect(intl.getRangeLabel(1, 10, 25)).toBe('11–20 z 25');
    expect(intl.getRangeLabel(0, 10, 0)).toBe('0 z 0');
  });

  it('re-resolves labels and signals MatPaginator on a language switch', () => {
    const intl = TestBed.inject(TranslocoPaginatorIntl);
    const changed = jest.fn();
    intl.changes.subscribe(changed);

    lang = 'en';
    langChanges$.next('en');

    expect(changed).toHaveBeenCalledTimes(1);
    expect(intl.itemsPerPageLabel).toBe('Items per page:');
    expect(intl.getRangeLabel(0, 12, 3)).toBe('1–3 of 3');
  });

  it('groups thousands per language in the range label (Polish: narrow no-break space)', () => {
    const intl = TestBed.inject(TranslocoPaginatorIntl);
    expect(intl.getRangeLabel(0, 50, 12800)).toBe('1–50 z 12 800');
  });
});
