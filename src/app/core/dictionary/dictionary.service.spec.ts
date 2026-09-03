import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DictionaryControllerService as GeneratedDictionaryService } from '../../api/api/dictionary-controller.api';
import type { DictionaryEntry } from '../../api/model/dictionary-entry';
import { DictionaryApiService } from './dictionary.service';

describe('DictionaryApiService', () => {
  let service: DictionaryApiService;
  let api: {
    getAllCategories: jest.Mock;
    getAllEntries: jest.Mock;
    createEntry: jest.Mock;
    deleteEntry: jest.Mock;
  };

  beforeEach(() => {
    api = {
      getAllCategories: jest.fn(),
      getAllEntries: jest.fn(),
      createEntry: jest.fn(),
      deleteEntry: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [DictionaryApiService, { provide: GeneratedDictionaryService, useValue: api }],
    });
    service = TestBed.inject(DictionaryApiService);
  });

  it('categories() normalizes the wire Set to an array', () => {
    api.getAllCategories.mockReturnValue(of(new Set(['OPPORTUNITY_CATEGORY', 'SERVICE_TYPE'])));

    let result: string[] | undefined;
    service.categories().subscribe((v) => (result = v));

    expect(result).toEqual(['OPPORTUNITY_CATEGORY', 'SERVICE_TYPE']);
  });

  it('create() wraps the entry in the requestParameters envelope', () => {
    const entry: DictionaryEntry = {
      key: 'compensation.barter',
      value: 'Barter',
      languageCode: 'pl',
      category: 'COMPENSATION_TYPE',
    };
    api.createEntry.mockReturnValue(of(entry));

    service.create(entry).subscribe();

    expect(api.createEntry).toHaveBeenCalledWith({ dictionaryEntry: entry });
  });

  it('delete() forwards the id in the envelope', () => {
    api.deleteEntry.mockReturnValue(of(undefined));

    service.delete('entry-17').subscribe();

    expect(api.deleteEntry).toHaveBeenCalledWith({ id: 'entry-17' });
  });
});
