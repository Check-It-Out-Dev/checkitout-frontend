import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Translation, TranslocoLoader } from '@ngneat/transloco';
import { I18N_VERSION } from './i18n-version';

/**
 * Loads translation JSONs from /assets/i18n/{lang}.json. Standalone,
 * dependency-free — Transloco caches the result so this fires once per
 * locale per session.
 *
 * The `?v=` query is a content-hash cache-buster (see i18n-version.ts):
 * the JSONs ship unhashed and long-cached, so without it a returning
 * browser keeps stale translations after a deploy that changes them.
 * index.html preloads pl.json with the SAME query — keep them in sync
 * via tools/i18n-cache-buster.mjs (gate-enforced).
 */
@Injectable({ providedIn: 'root' })
export class HttpTranslocoLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`/assets/i18n/${lang}.json?v=${I18N_VERSION}`);
  }
}
