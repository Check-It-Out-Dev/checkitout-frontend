/**
 * L0 contract: DictionaryApiService ↔ generated models. Compile-time only;
 * see opportunities.contract.ts. `categories()` (Observable<Array<string>>)
 * and `delete()` (Observable<void>) carry no generated types and are
 * deliberately not pinned.
 */
import type { Observable } from 'rxjs';
import type { DictionaryApiService } from '../../app/core/dictionary/dictionary.service';
import type { DictionaryEntry } from '../../app/api/model/dictionary-entry';
import type { Equal, Expect } from '../type-assert';

type _entries = Expect<
  Equal<DictionaryApiService['entries'], () => Observable<Array<DictionaryEntry>>>
>;

type _create = Expect<
  Equal<DictionaryApiService['create'], (entry: DictionaryEntry) => Observable<DictionaryEntry>>
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type DictionaryContract = [_entries, _create];
