import { SURVEY_CHAPTERS, chapterByKey } from './chapter-registry';

describe('SURVEY_CHAPTERS registry', () => {
  it('holds five chapters with contiguous 1-based reading order', () => {
    expect(SURVEY_CHAPTERS).toHaveLength(5);
    const orders = SURVEY_CHAPTERS.map((c) => c.order).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5]);
  });

  it('has unique keys and route paths', () => {
    expect(new Set(SURVEY_CHAPTERS.map((c) => c.key)).size).toBe(5);
    expect(new Set(SURVEY_CHAPTERS.map((c) => c.path)).size).toBe(5);
  });

  it('chapterByKey resolves every registered chapter', () => {
    for (const c of SURVEY_CHAPTERS) {
      expect(chapterByKey(c.key)).toBe(c);
    }
  });
});
