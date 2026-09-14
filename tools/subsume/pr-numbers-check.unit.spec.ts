import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { numbersIn, unvouched, vouchedBy } from './pr-numbers-check.mjs';

/**
 * I5: every number in the reviewer's comment must be in a report. Names that look like numbers —
 * I1, #30, a date, a hash, a time — are not measurements; a figure a report gives as 5190 may be
 * quoted as 5,190, one at 39.93 as 39.9; anything else is fabricated and named.
 */
describe('pr-numbers-check (I5)', () => {
  it('reads numbers out of prose and leaves names alone', () => {
    const text =
      'I1 PASS on 2,853 methods; #30 merged 2026-09-14 at 17:05 by abc1234def; v1.2.3; 39.93 % → 39.9 %; round 1; ' +
      '```mermaid\n b0["9,999"]\n```\n https://x.y/z/12345 and -4 % of 72.4 s';
    expect(numbersIn(text)).toEqual(['2853', '39.93', '39.9', '4', '72.4']);
  });

  it('vouches for every form of a report number and names what no report gave', () => {
    const d = mkdtempSync(join(tmpdir(), 'i5-'));
    writeFileSync(
      join(d, 'governance-ledger.json'),
      JSON.stringify({
        before: { tests: 10576, seconds: 75.4 },
        after: { tests: 10411 },
        mutation: { scoreBefore: 39.93, lost: [] },
        gains: { secondsPct: -4 },
      }),
    );
    writeFileSync(join(d, 'gains.md'), '```mermaid\n b3["Kills<br/>5,190 killed"]\n```\n');
    const v = vouchedBy(d);
    const good =
      '◇ Reviewer — quotes only\n\n10,576 → 10,411 tests, 75.4 s, −4 %, score 39.93 (39.9), 5,190 kills kept.\n\nI do not approve or merge; a person does.';
    expect(unvouched(good, v)).toEqual([]);
    const bad = good.replace('10,411', '10,400').replace('5,190', '5,200');
    expect(unvouched(bad, v)).toEqual(['10400', '5200']);
  });
});
