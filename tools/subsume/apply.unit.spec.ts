import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyPack, parseJUnitId, tagJavaMethod, wrapJestTest } from './apply.mjs';

/**
 * Demotion is an edit a person could make by hand, done exactly and only where the id says: the
 * right nested class when two share a method name, a tag once and never twice, the import added
 * once; the right `it` when two describes share a test name, dynamic names refused. The round
 * file is written; a dry run writes nothing.
 */
const JAVA = `package com.x;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;

class TopTest {

    @Nested
    class Outer {

        @Nested
        class Inner {
            @Test
            @DisplayName("inner m")
            void m() {
                assert "{".length() == 1;
            }
        }

        @Test
        void m() {
        }

        @ParameterizedTest
        @ValueSource(strings = {"a", "b"})
        void p(String s) {
        }
    }

    @Test
    void m() {
    }
}
`;

const SPEC = `describe('X', () => {
  describe('Y', () => {
    it('does z', () => {
      expect(1).toBe(1);
    });
    it(\`does \${'z'}\`, () => {});
  });
  it('does z', () => {});
  it.skip('does w', () => {});
});
`;

describe('apply: JUnit', () => {
  it('parses the platform id', () => {
    expect(
      parseJUnitId(
        '[engine:junit-jupiter]/[class:com.x.TopTest]/[nested-class:Outer]/[nested-class:Inner]/[method:m()]',
      ),
    ).toMatchObject({
      file: 'src/test/java/com/x/TopTest.java',
      chain: ['Outer', 'Inner'],
      method: 'm',
      invocation: null,
    });
    expect(
      parseJUnitId(
        '[engine:junit-jupiter]/[class:com.x.T]/[method:p(java.lang.String)]/[test-template-invocation:#2]',
      ),
    ).toMatchObject({ invocation: 2, params: 'java.lang.String' });
    expect(parseJUnitId('nonsense')).toBeNull();
  });

  it('tags the method in the right nested class, adds the import once, never tags twice', () => {
    const r1 = tagJavaMethod(JAVA, ['Outer', 'Inner'], 'm', 'TopTest#keeper() (round 1)');
    expect(r1.applied).toBe(true);
    const lines: string[] = r1.source.split('\n');
    const tagAt = lines.findIndex((l: string) => l.includes('@Tag("subsumed")'));
    expect(lines[tagAt - 1].trim()).toBe('// subsumed-by: TopTest#keeper() (round 1)');
    expect(lines[tagAt + 1].trim()).toBe('@Test');
    expect(lines[tagAt + 2].trim()).toBe('@DisplayName("inner m")');
    expect(lines[tagAt + 3].trim()).toBe('void m() {');
    expect(lines[tagAt].startsWith('            ')).toBe(true); // the method's indentation
    expect(r1.source.match(/^import org\.junit\.jupiter\.api\.Tag;/gm)).toHaveLength(1);
    // the outer m() and the top-level m() are untouched
    expect(r1.source.match(/@Tag\("subsumed"\)/g)).toHaveLength(1);
    const r2 = tagJavaMethod(r1.source, ['Outer', 'Inner'], 'm', 'again');
    expect(r2).toMatchObject({ applied: false, reason: 'already' });
    const r3 = tagJavaMethod(r1.source, ['Outer'], 'm', 'TopTest#keeper() (round 1)');
    expect(r3.applied).toBe(true);
    expect(r3.source.match(/@Tag\("subsumed"\)/g)).toHaveLength(2);
    expect(r3.source.match(/^import org\.junit\.jupiter\.api\.Tag;/gm)).toHaveLength(1);
    expect(tagJavaMethod(JAVA, ['Nowhere'], 'm', 'x')).toMatchObject({
      applied: false,
      reason: 'not-found',
    });
  });
});

describe('apply: Jest', () => {
  it('wraps the right it, refuses a dynamic name, and is idempotent', () => {
    const r = wrapJestTest(SPEC, 'X Y does z', 'y.spec.ts :: X Y keeps z (round 1)');
    expect(r.applied).toBe(true);
    expect(r.source).toContain(
      "    // subsumed-by: y.spec.ts :: X Y keeps z (round 1)\n    subsumed(it)('does z', () => {",
    );
    expect(r.source.match(/subsumed\(it\)/g)).toHaveLength(1);
    expect(r.source).toContain("\n  it('does z', () => {});"); // the outer one untouched
    expect(wrapJestTest(r.source, 'X Y does z', 'again')).toMatchObject({
      applied: false,
      reason: 'already',
    });
    expect(wrapJestTest(SPEC, 'X Y does z', 'x')).toMatchObject({ applied: true });
    expect(wrapJestTest(SPEC, 'X does w', 'x')).toMatchObject({
      applied: false,
      reason: 'not-a-plain-it',
    });
    expect(wrapJestTest(SPEC, 'X nope', 'x')).toMatchObject({
      applied: false,
      reason: 'not-found',
    });
  });
});

describe('apply: the pack', () => {
  it('edits files, skips parameterised invocations, writes the round file — and not on a dry run', () => {
    const root = mkdtempSync(join(tmpdir(), 'apply-'));
    mkdirSync(join(root, 'src', 'test', 'java', 'com', 'x'), { recursive: true });
    writeFileSync(join(root, 'src', 'test', 'java', 'com', 'x', 'TopTest.java'), JAVA);
    const pack = {
      commit: 'p',
      provisional: false,
      tiers: { A: { taken: 1 } },
      taken: [
        {
          test: '[engine:junit-jupiter]/[class:com.x.TopTest]/[nested-class:Outer]/[method:m()]',
          tier: 'A',
          carriers: ['[engine:junit-jupiter]/[class:com.x.TopTest]/[method:m()]'],
          exactDuplicateOf: '[engine:junit-jupiter]/[class:com.x.TopTest]/[method:m()]',
        },
        {
          test: '[engine:junit-jupiter]/[class:com.x.TopTest]/[nested-class:Outer]/[method:p(java.lang.String)]/[test-template-invocation:#1]',
          tier: 'C',
          carriers: [],
          exactDuplicateOf: null,
        },
        {
          test: '[engine:junit-jupiter]/[class:com.x.Missing]/[method:m()]',
          tier: 'C',
          carriers: [],
          exactDuplicateOf: null,
        },
      ],
    };
    const dry = applyPack(pack, {
      repo: 'backend',
      root,
      round: 2,
      runId: 'r',
      baseCommit: 'b',
      dryRun: true,
    });
    expect(dry.applied).toHaveLength(1);
    expect(
      readFileSync(join(root, 'src', 'test', 'java', 'com', 'x', 'TopTest.java'), 'utf8'),
    ).toBe(JAVA);
    const r = applyPack(pack, { repo: 'backend', root, round: 2, runId: 'r', baseCommit: 'b' });
    expect(r.applied).toEqual([
      '[engine:junit-jupiter]/[class:com.x.TopTest]/[nested-class:Outer]/[method:m()]',
    ]);
    expect(r.notApplied.map((n) => n.reason).sort()).toEqual(['file-missing', 'parameterized']);
    const edited = readFileSync(
      join(root, 'src', 'test', 'java', 'com', 'x', 'TopTest.java'),
      'utf8',
    );
    expect(edited).toContain('// subsumed-by: TopTest#m() (round 2)');
    const round = JSON.parse(
      readFileSync(join(root, 'docs', 'testing', 'governance', 'round.json'), 'utf8'),
    );
    expect(round).toMatchObject({
      repo: 'backend',
      round: 2,
      runId: 'r',
      baseCommit: 'b',
      proposalCommit: 'p',
      provisional: false,
    });
    expect(round.demoted).toHaveLength(1);
  });
});
