import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { DictionaryEntry } from '../../api/model/dictionary-entry';
import { DictionaryApiService } from '../../core/dictionary/dictionary.service';
import { AdminDictionaryComponent } from './dictionary.component';

const ENTRIES: DictionaryEntry[] = [
  { id: '1', key: 'a.k', value: 'A', languageCode: 'pl', category: 'alpha' },
  { id: '2', key: 'b.k', value: 'B', languageCode: 'en', category: 'beta' },
];

class FakeApi {
  entriesNext: () => Observable<DictionaryEntry[]> = () => of([...ENTRIES]);
  createNext: (e: DictionaryEntry) => Observable<DictionaryEntry> = (e) => of({ ...e, id: 'new' });
  deleted: string[] = [];

  entries(): Observable<DictionaryEntry[]> {
    return this.entriesNext();
  }
  categories(): Observable<string[]> {
    return of(['alpha', 'beta']);
  }
  create(e: DictionaryEntry): Observable<DictionaryEntry> {
    return this.createNext(e);
  }
  delete(id: string): Observable<void> {
    this.deleted.push(id);
    return of(undefined);
  }
}

function create(api: FakeApi): ComponentFixture<AdminDictionaryComponent> {
  TestBed.configureTestingModule({
    imports: [
      AdminDictionaryComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: DictionaryApiService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(AdminDictionaryComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AdminDictionaryComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads entries + categories and filters client-side', fakeAsync(() => {
    const fixture = create(new FakeApi());
    tick();
    const c = fixture.componentInstance;
    expect(c.state()).toBe('loaded');
    expect(c.filtered()).toHaveLength(2);
    c.category.set('alpha');
    expect(c.filtered()).toHaveLength(1);
    expect(c.filtered()[0]?.key).toBe('a.k');
  }));

  it('rejects an incomplete add form without calling the BE', fakeAsync(() => {
    const api = new FakeApi();
    const spy = jest.spyOn(api, 'create');
    const fixture = create(api);
    tick();
    fixture.componentInstance.submit();
    expect(spy).not.toHaveBeenCalled();
  }));

  it('adds a created entry to the top of the list and resets the form', fakeAsync(() => {
    const fixture = create(new FakeApi());
    tick();
    const c = fixture.componentInstance;
    c.form.setValue({ category: 'gamma', key: 'g.k', languageCode: 'pl', value: 'G' });
    c.submit();
    tick();
    expect(c.entries()[0]?.id).toBe('new');
    expect(c.categories()).toContain('gamma');
    expect(c.form.controls.key.value).toBe('');
  }));

  it('surfaces save errors and removes rows on delete', fakeAsync(() => {
    const api = new FakeApi();
    api.createNext = () => throwError(() => ({ status: 400 }));
    const fixture = create(api);
    tick();
    const c = fixture.componentInstance;
    c.form.setValue({ category: 'x', key: 'x.k', languageCode: 'pl', value: 'X' });
    c.submit();
    tick();
    expect(c.saveError()).toBe(true);

    c.remove(ENTRIES[0]!);
    tick();
    expect(api.deleted).toEqual(['1']);
    expect(c.entries().find((e) => e.id === '1')).toBeUndefined();
  }));

  it('lands in empty/error states', fakeAsync(() => {
    const api = new FakeApi();
    api.entriesNext = () => of([]);
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('empty');
    TestBed.resetTestingModule();

    const failing = new FakeApi();
    failing.entriesNext = () => throwError(() => ({ status: 500 }));
    const errored = create(failing);
    tick();
    expect(errored.componentInstance.state()).toBe('error');
  }));
});
