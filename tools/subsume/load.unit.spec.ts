import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertFullMatrix, loadJava, loadJest } from './load.mjs';

/**
 * The loaders refuse a kill matrix from a run that stopped at the first killer. With one killer
 * per mutant every other test kills nothing, so kill-subsumption holds of every test vacuously;
 * a proposal on such a file confirmed twenty frontend tests that kill nothing at all.
 */
function dir() {
  return mkdtempSync(join(tmpdir(), 'subsume-load-'));
}

function probesFile(d: string, spec: string) {
  const p = join(d, 'probes.jsonl');
  writeFileSync(
    p,
    JSON.stringify({
      test: `${spec} :: t`,
      spec,
      seconds: 0.1,
      hits: { 'src/a.ts': { s: [1], f: [], b: [] } },
    }) + '\n',
  );
  return p;
}

describe('load: full-matrix provenance', () => {
  it('refuses a Stryker report whose config bailed at the first killer', () => {
    const d = dir();
    const mutation = join(d, 'mutation.json');
    writeFileSync(
      mutation,
      JSON.stringify({
        schemaVersion: '1.0',
        config: { disableBail: false },
        files: {},
        testFiles: {},
      }),
    );
    expect(() =>
      loadJest({ probes: probesFile(d, 'src/a.spec.ts'), maps: null, mutation, flaky: null }),
    ).toThrow(/disableBail/);
  });

  it('accepts a Stryker report that ran with disableBail', () => {
    const d = dir();
    const mutation = join(d, 'mutation.json');
    writeFileSync(
      mutation,
      JSON.stringify({
        schemaVersion: '1.0',
        config: { disableBail: true },
        files: {
          'src/a.ts': {
            mutants: [
              { id: '1', status: 'Killed', killedBy: ['0'], location: { start: { line: 1 } } },
            ],
          },
        },
        testFiles: { 'src/a.spec.ts': { tests: [{ id: '0', name: 't' }] } },
      }),
    );
    const m = loadJest({
      probes: probesFile(d, 'src/a.spec.ts'),
      maps: null,
      mutation,
      flaky: null,
    });
    expect(m.mutants.size).toBe(1);
    expect(m.tests.get('src/a.spec.ts :: t')?.kills.has('src/a.ts#1')).toBe(true);
  });

  it('refuses a PIT kills.json without the fullMatrix mark, and reads one with it', () => {
    const d = dir();
    const kills = join(d, 'kills.json');
    const mutant = {
      class: 'com.x.A',
      line: 1,
      status: 'KILLED',
      killedBy: ['[engine:junit-jupiter]/[class:com.x.ATest]/[method:t()]'],
    };
    writeFileSync(kills, JSON.stringify({ schema: 1, mutants: { 'com.x.A|1': mutant } }));
    const probes = join(d, 'probes.jsonl');
    writeFileSync(
      probes,
      JSON.stringify({ test: mutant.killedBy[0], spec: 'com.x.ATest', seconds: 0.1, hits: {} }) +
        '\n',
    );
    expect(() => loadJava({ probes, classes: null, kills, flaky: null })).toThrow(
      /fullMutationMatrix/,
    );
    writeFileSync(
      kills,
      JSON.stringify({ schema: 1, fullMatrix: true, mutants: { 'com.x.A|1': mutant } }),
    );
    const m = loadJava({ probes, classes: null, kills, flaky: null });
    expect(m.tests.get(mutant.killedBy[0])?.kills.has('com.x.A|1')).toBe(true);
  });

  it('names the file and the cause in the refusal', () => {
    expect(() => assertFullMatrix('stryker', { config: {} }, 'x.json')).toThrow(
      /x\.json.*disableBail/,
    );
    expect(() => assertFullMatrix('pit', {}, 'k.json')).toThrow(/k\.json.*fullMutationMatrix/);
  });
});
