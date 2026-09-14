import { NAME_FLAGS, pack, tierOf } from './pack.mjs';

/**
 * The round policy on a hand-built proposal: tiers by evidence, gates before tiers, the budget
 * and the class cap, D never while A–C hold anything, look-twice waits for a person, and the
 * forecast to saturation.
 */
function candidate(
  test: string,
  unit: string,
  seconds: number,
  why: Partial<{
    mutationObserved: boolean;
    sameClassCarrier: boolean;
    fullCarriers: number;
    exactDuplicateOf: string | null;
  }>,
  reason: string | null = null,
  tier = 'CONFIRMED',
) {
  return {
    test,
    unit,
    tier,
    reason,
    seconds,
    subsumedBy: ['keeper'],
    why: {
      mutationObserved: true,
      sameClassCarrier: true,
      fullCarriers: 1,
      exactDuplicateOf: null,
      ...why,
    },
    redundancy: { redundantSeconds: seconds },
  };
}

const report = () => ({
  repo: 'test',
  commit: 'c',
  unitTests: { X: 10, Y: 2, Z: 4 },
  summary: { prTierSeconds: { before: 100 } },
  candidates: [
    candidate('X :: a twin', 'X', 3, { exactDuplicateOf: 'X :: keeper' }),
    candidate('X :: two carriers', 'X', 2, { fullCarriers: 2 }),
    candidate('X :: one carrier', 'X', 1, {}),
    candidate('X :: another twin', 'X', 1, { exactDuplicateOf: 'X :: keeper' }),
    candidate('X :: a third twin', 'X', 1, { exactDuplicateOf: 'X :: keeper' }),
    candidate('X :: four twin', 'X', 1, { exactDuplicateOf: 'X :: keeper' }),
    candidate('X :: five twin', 'X', 1, { exactDuplicateOf: 'X :: keeper' }),
    candidate('X :: six twin', 'X', 1, { exactDuplicateOf: 'X :: keeper' }),
    candidate('Y :: quiet', 'Y', 1, {}, 'kills-nothing'),
    candidate('Z :: regression for issue-42', 'Z', 5, { exactDuplicateOf: 'Z :: keeper' }),
    candidate('Z :: far away', 'Z', 1, { sameClassCarrier: false }),
    candidate(
      'Z :: blind',
      'Z',
      1,
      { mutationObserved: false },
      'not-mutation-observed',
      'SUSPECTED',
    ),
  ],
});

describe('round pack', () => {
  it('tiers by evidence after the gates', () => {
    const r = report();
    const t = (name: string) => tierOf(r.candidates.find((c) => c.test === name)!);
    expect(t('X :: a twin')).toEqual({ tier: 'A', gate: null });
    expect(t('X :: two carriers')).toEqual({ tier: 'B', gate: null });
    expect(t('X :: one carrier')).toEqual({ tier: 'C', gate: null });
    expect(t('Y :: quiet')).toEqual({ tier: 'D', gate: null });
    expect(t('Z :: regression for issue-42')).toEqual({ tier: null, gate: 'look-twice' });
    expect(t('Z :: far away')).toEqual({ tier: null, gate: 'no-carrier-in-class' });
    expect(t('Z :: blind')).toEqual({ tier: null, gate: 'not-confirmed' });
    expect(NAME_FLAGS.test('handles a null session')).toBe(true);
    expect(NAME_FLAGS.test('stores the session')).toBe(false);
  });

  it('spends the budget from A down, caps a class, never takes D while A–C hold anything', () => {
    const p = pack(report(), { budgetShare: 0.1, budgetTests: 300, classCap: 0.5 });
    // budget 10 s; X may lose at most 5 of 10; A first (6 twins, 3+1+1+1+1+1 s), then B, then C
    expect(p.budget.seconds).toBe(10);
    expect(p.taken.map((x) => x.tier)).toEqual(['A', 'A', 'A', 'A', 'A']);
    expect(p.classCapped).toBeGreaterThan(0);
    expect(p.tiers['D'].taken).toBe(0);
    expect(p.provisional).toBe(true);
    expect(p.lookTwice.map((x) => x.test)).toEqual(['Z :: regression for issue-42']);
    expect(p.saturated).toBe(false);
    expect(p.forecast.roundsToSaturationAtThisBudget).toBeGreaterThanOrEqual(1);
  });

  it('is saturated when A–C are empty, and only then takes D', () => {
    const r = report();
    r.candidates = r.candidates.filter(
      (c) => c.reason === 'kills-nothing' || c.tier !== 'CONFIRMED',
    );
    const p = pack(r, { budgetShare: 0.5 });
    expect(p.saturated).toBe(true);
    expect(p.taken.map((x) => x.tier)).toEqual(['D']);
  });

  it('a cleared name-flag passes, a frozen tier is skipped, a nondeterministic test is gated', () => {
    const r = report();
    const p = pack(r, {
      budgetShare: 1,
      classCap: 1,
      cleared: new Set(['Z :: regression for issue-42']),
      frozen: new Set(['A']),
      deterministic: new Map([['X :: two carriers', false]]),
    });
    expect(p.taken.some((x) => x.test === 'Z :: regression for issue-42')).toBe(false); // frozen A
    expect(p.tiers['A'].available).toBe(7);
    expect(p.taken.map((x) => x.tier)).toEqual(['C']); // B's only member was nondeterministic
    expect(p.gates.excluded['nondeterministic']).toBe(1);
    expect(p.provisional).toBe(false);
  });
});
