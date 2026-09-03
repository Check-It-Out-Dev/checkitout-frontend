import { Observable, of, throwError } from 'rxjs';
import type { DictionaryEntry } from '../../api/model/dictionary-entry';
import { DictionaryApiService } from '../../core/dictionary/dictionary.service';
import { AdminDictionaryComponent } from '../../feature/admin/dictionary.component';
import type { SandboxFixture } from '../sandbox-registry';

/** Admin dictionary editor fixtures. */

const ENTRIES: DictionaryEntry[] = [
  {
    id: 'd1',
    key: 'service_type.restaurant',
    value: 'Restauracja',
    languageCode: 'pl',
    category: 'service_type',
  },
  {
    id: 'd2',
    key: 'service_type.restaurant',
    value: 'Restaurant',
    languageCode: 'en',
    category: 'service_type',
  },
  {
    id: 'd3',
    key: 'content_type.photo',
    value: 'Zdjęcie',
    languageCode: 'pl',
    category: 'content_type',
  },
  {
    id: 'd4',
    key: 'platform.instagram',
    value: 'Instagram',
    languageCode: 'pl',
    category: 'platform',
  },
];

class StubLoaded {
  entries(): Observable<DictionaryEntry[]> {
    return of(ENTRIES);
  }
  categories(): Observable<string[]> {
    return of(['service_type', 'content_type', 'platform']);
  }
  create(entry: DictionaryEntry): Observable<DictionaryEntry> {
    return of({ ...entry, id: 'new' });
  }
  delete(): Observable<void> {
    return of(undefined);
  }
}

class StubEmpty extends StubLoaded {
  override entries(): Observable<DictionaryEntry[]> {
    return of([]);
  }
  override categories(): Observable<string[]> {
    return of([]);
  }
}

class StubError extends StubLoaded {
  override entries(): Observable<DictionaryEntry[]> {
    return throwError(() => ({ status: 500 }));
  }
}

export const ADMIN_DICTIONARY_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'admin-dictionary-loaded',
    label: 'Admin dictionary · entries across categories + add form',
    component: AdminDictionaryComponent,
    providers: [{ provide: DictionaryApiService, useClass: StubLoaded }],
  },
  {
    id: 'admin-dictionary-empty',
    label: 'Admin dictionary · empty state',
    component: AdminDictionaryComponent,
    providers: [{ provide: DictionaryApiService, useClass: StubEmpty }],
  },
  {
    id: 'admin-dictionary-error',
    label: 'Admin dictionary · error state',
    component: AdminDictionaryComponent,
    providers: [{ provide: DictionaryApiService, useClass: StubError }],
  },
];
