import { diff, snapshot, type Snapshot } from './probe-diff';

/**
 * The probe hook (jest-probes.ts) is only as honest as this diff: a counter that did not move
 * must never be reported, one that moved must always be, and a branch path is reported per
 * path, not per branch. Each case below is a shape istanbul actually produces.
 */
describe('probe-diff', () => {
  const file = '/repo/src/app/x.ts';
  const base: Snapshot = {
    [file]: { s: { 0: 1, 1: 0, 2: 3 }, f: { 0: 1 }, b: { 0: [1, 0], 1: [0, 0] } },
  };

  it('reports nothing when no counter moved', () => {
    expect(diff(base, snapshot(base))).toEqual({});
  });

  it('reports exactly the counters that increased, per kind', () => {
    const after: Snapshot = {
      [file]: { s: { 0: 1, 1: 2, 2: 4 }, f: { 0: 1 }, b: { 0: [1, 1], 1: [0, 0] } },
    };
    expect(diff(base, after)).toEqual({ [file]: { s: [1, 2], f: [], b: [[0, 1]] } });
  });

  it('treats a file absent from the previous snapshot as all-zero', () => {
    const after: Snapshot = { ...base, '/repo/src/app/y.ts': { s: { 0: 1 }, f: {}, b: {} } };
    expect(diff(base, after)['/repo/src/app/y.ts']).toEqual({ s: [0], f: [], b: [] });
  });

  it('reports every branch path separately', () => {
    const after: Snapshot = {
      [file]: { s: { 0: 1, 1: 0, 2: 3 }, f: { 0: 1 }, b: { 0: [2, 1], 1: [1, 1] } },
    };
    expect(diff(base, after)[file].b).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it('sorts statement ids numerically, not lexically', () => {
    const before: Snapshot = { [file]: { s: { 2: 0, 10: 0, 1: 0 }, f: {}, b: {} } };
    const after: Snapshot = { [file]: { s: { 2: 1, 10: 1, 1: 1 }, f: {}, b: {} } };
    expect(diff(before, after)[file].s).toEqual([1, 2, 10]);
  });

  it('snapshot copies, so later counter movement does not rewrite history', () => {
    const live = { [file]: { s: { 0: 0 }, f: {}, b: { 0: [0] } } };
    const snap = snapshot(live);
    live[file].s[0] = 5;
    live[file].b[0][0] = 5;
    expect(snap[file].s[0]).toBe(0);
    expect(snap[file].b[0][0]).toBe(0);
  });

  it('tolerates an undefined or partial coverage object', () => {
    expect(snapshot(undefined)).toEqual({});
    expect(snapshot({ [file]: { s: { 0: 1 } } })).toEqual({
      [file]: { s: { 0: 1 }, f: {}, b: {} },
    });
  });
});
