import { Injectable, inject } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslocoService } from '@ngneat/transloco';
import { groupedNumber } from './number-format';

/**
 * MatPaginator labels keyed on the ACTIVE Transloco language. Material's
 * default intl is English-only ("Items per page", "1 – 3 of 3"), which
 * leaked into every Polish list page. Labels re-resolve on a language
 * switch: `changes` is what MatPaginator subscribes to for re-rendering.
 */
@Injectable()
export class TranslocoPaginatorIntl extends MatPaginatorIntl {
  private readonly transloco = inject(TranslocoService);

  constructor() {
    super();
    this.applyLabels();
    this.transloco.langChanges$.subscribe(() => {
      this.applyLabels();
      this.changes.next();
    });
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    const lang = this.transloco.getActiveLang();
    const total = groupedNumber(lang, Math.max(length, 0));
    if (length === 0 || pageSize === 0) {
      return this.transloco.translate('common.paginator.range_empty', { total });
    }
    const start = page * pageSize;
    const end = start < length ? Math.min(start + pageSize, length) : start + pageSize;
    return this.transloco.translate('common.paginator.range', {
      start: groupedNumber(lang, start + 1),
      end: groupedNumber(lang, end),
      total,
    });
  };

  private applyLabels(): void {
    const t = (key: string) => this.transloco.translate(`common.paginator.${key}`);
    this.itemsPerPageLabel = t('items_per_page');
    this.nextPageLabel = t('next_page');
    this.previousPageLabel = t('previous_page');
    this.firstPageLabel = t('first_page');
    this.lastPageLabel = t('last_page');
  }
}
