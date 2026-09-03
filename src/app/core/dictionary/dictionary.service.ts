import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DictionaryControllerService as GeneratedDictionaryService } from '../../api/api/dictionary-controller.api';
import type { DictionaryEntry } from '../../api/model/dictionary-entry';

/**
 * Thin wrapper over the generated `DictionaryService` (admin lookup-value
 * editor at /admin/dictionary). Entries are `{key, value, languageCode,
 * category}` translation rows; BE authorizes ADMIN on the mutating endpoints.
 */
@Injectable({ providedIn: 'root' })
export class DictionaryApiService {
  private readonly api = inject(GeneratedDictionaryService);

  categories(): Observable<Array<string>> {
    // Generated type is Set<string> (Java Set on the wire is a JSON array);
    // normalize to an array for consumers.
    return this.api.getAllCategories().pipe(map((set) => Array.from(set)));
  }

  entries(): Observable<Array<DictionaryEntry>> {
    return this.api.getAllEntries();
  }

  create(entry: DictionaryEntry): Observable<DictionaryEntry> {
    return this.api.createEntry({ dictionaryEntry: entry });
  }

  delete(id: string): Observable<void> {
    return this.api.deleteEntry({ id });
  }
}
