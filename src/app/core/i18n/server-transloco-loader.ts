import { Injectable } from '@angular/core';
import type { Translation, TranslocoLoader } from '@ngneat/transloco';
import { Observable, of } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import pl from '../../../assets/i18n/pl.json';

/**
 * Server-side Transloco loader (iter-107 prerender arc). The browser
 * loader fetches `assets/i18n/<lang>.json` over HttpClient — on the
 * prerender server there is no origin to fetch from, the request fails
 * silently and the page serializes with EMPTY strings (observed in the
 * first prerender build). Bundling the JSON statically makes the
 * translation synchronously available, so the server HTML carries the
 * real Polish copy and hydration has nothing to swap.
 */
@Injectable()
export class ServerTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    return of((lang === 'pl' ? pl : en) as Translation);
  }
}
