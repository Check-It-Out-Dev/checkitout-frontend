import { readLangChoice, storeLangChoice } from './lang-preference';

describe('lang-preference', () => {
  afterEach(() => localStorage.removeItem('cio-lang'));

  it('round-trips an explicit choice', () => {
    expect(readLangChoice()).toBeNull();
    storeLangChoice('en');
    expect(readLangChoice()).toBe('en');
    storeLangChoice('pl');
    expect(readLangChoice()).toBe('pl');
  });

  it('rejects junk values (defensive against manual localStorage edits)', () => {
    localStorage.setItem('cio-lang', 'de');
    expect(readLangChoice()).toBeNull();
  });

  it('never throws when storage is denied', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const spyGet = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => storeLangChoice('en')).not.toThrow();
    expect(readLangChoice()).toBeNull();
    spy.mockRestore();
    spyGet.mockRestore();
  });
});
