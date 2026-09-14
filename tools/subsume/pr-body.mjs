#!/usr/bin/env node
/**
 * The pull-request body of a governance round — from the round's own files and nowhere else
 * (plan §15 surface 2, §16 step 2). The header says who is speaking; every number is read from
 * round.json, pack.json, governance-ledger.json, invariant-report.json, gains.md or diagram.md,
 * and the writer types none of its own. What was not measured is said to be not measured: the
 * special job re-measures the reduced tier on the pull request whatever this body claims.
 *
 *   node tools/subsume/pr-body.mjs --round docs/testing/governance/round.json --pack pack.json
 *        [--ledger governance-ledger.json] [--invariants invariant-report.json]
 *        [--gains gains.md] [--report subsume-report.json | --diagram diagram.md]
 *        [--artefacts <where the full reports are>] --out reports/subsume
 *
 * With --report the subsumption diagram is drawn from the proposal restricted to the tests the
 * round demoted; --diagram pastes the proposal's own picture and says so.
 *
 * Writes pr-title.txt and pr-body.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { parseJUnitId } from './apply.mjs';
import { diagram as drawDiagram } from './diagram.mjs';
import { summaryLine as invariantLine } from './invariant.mjs';
import { summaryLine as ledgerLine } from './ledger.mjs';

export const HEADER = '▣ Proposer — Claude Code on the box · applies CONFIRMED only · never merges';
export const CLOSING = 'I do not approve or merge; a person does.';

const n = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));

/** A test id as a person reads it: `Class$Nested#method()` or the Jest name after `::`. */
export function shortName(id) {
  const j = parseJUnitId(id);
  if (j) {
    const inv = j.invocation != null ? `[#${j.invocation}]` : '';
    return `${[j.top, ...j.chain].join('$')}#${j.method}()${inv}`;
  }
  const i = id.indexOf(' :: ');
  return i > 0 ? `${id.slice(0, i).split('/').pop()} :: ${id.slice(i + 4)}` : id;
}

/** The first fenced mermaid block of a markdown file, fence included; null when there is none. */
export function mermaidBlock(md) {
  const m = md?.match(/```mermaid\n[\s\S]*?\n```/);
  return m ? m[0] : null;
}

/**
 * @param {{ round: any, pack?: any, ledger?: any, invariants?: any, gains?: string | null,
 *   diagram?: string | null, report?: any, artefacts?: string | null, listCap?: number }} input
 */
export function prBody({
  round,
  pack = null,
  ledger = null,
  invariants = null,
  gains = null,
  diagram = null,
  report = null,
  artefacts = null,
  listCap = 40,
}) {
  const demoted = round.demoted?.length ?? 0;
  const notApplied = round.notApplied ?? [];
  const tiers = round.tiers ?? pack?.tiers ?? null;
  const title =
    `[test-governance] round ${round.round} — ${n(demoted)} tests demoted` +
    (ledger?.before?.seconds != null && ledger?.after?.seconds != null
      ? `, ${ledger.before.seconds} s → ${ledger.after.seconds} s`
      : '');

  const out = [HEADER, ''];
  out.push(
    `**Governance round ${round.round} · ${n(demoted)} tests leave the pull-request tier by tag; the nightly still runs them.**`,
    '',
  );

  // the round, as the tracked file states it
  const link = [
    `run \`${round.runId}\``,
    round.baseCommit ? `base \`${round.baseCommit}\`` : null,
    round.proposalCommit ? `proposal \`${round.proposalCommit}\`` : null,
  ]
    .filter(Boolean)
    .join(', ');
  out.push(`Round file: \`docs/testing/governance/round.json\` (${link}).`);
  if (tiers) {
    const t = ['A', 'B', 'C', 'D']
      .filter((k) => tiers[k])
      .map((k) => `${k} ${n(tiers[k].taken)} of ${n(tiers[k].available)}`)
      .join(' · ');
    out.push(
      `The pack took, surest tier first: ${t}` +
        (pack
          ? ` — ${n(pack.classesTouched)} classes, at most ${Math.round((pack.budget?.classCap ?? 0) * 100)} % of any one`
          : '') +
        (pack?.gates?.determinism ? `; determinism ${pack.gates.determinism}` : '') +
        (round.provisional ? '; **provisional** (one armed run only)' : '') +
        '.',
    );
    if (pack?.forecast)
      out.push(
        `Left at these gates: ${['A', 'B', 'C', 'D']
          .filter((k) => pack.forecast[k])
          .map((k) => `${k} ${n(pack.forecast[k].tests)}`)
          .join(
            ' · ',
          )}; ${pack.saturated ? 'saturated' : `${n(pack.forecast.roundsToSaturationAtThisBudget)} more round(s) to saturation at this budget`}.`,
      );
  }
  out.push('');

  // measured, or said to be not measured
  out.push('## Measured on the reduced tier', '');
  if (ledger) out.push(`**${ledgerLine(ledger)}**`, '');
  else out.push('Not measured on the box; the special job measures it on this pull request.', '');
  if (invariants) out.push(invariantLine(invariants), '');
  if (gains) out.push(gains.trim(), '');
  out.push(
    'The special job re-measures all of it here: the reduced tier armed, the invariants from that run, the tier again in random order, the kill matrix on what remains, the ledger.',
    '',
  );

  // who carries what — drawn from the proposal restricted to what this round demoted, so a row
  // the round declined (a parameterised invocation, a generated name) is not in the picture; the
  // proposal's own diagram only when no report is at hand, and then said to be the proposal's
  const demotedSet = new Set(round.demoted ?? []);
  const drawn = report
    ? drawDiagram({
        ...report,
        candidates: (report.candidates ?? []).filter((c) => demotedSet.has(c.test)),
      })
    : diagram;
  const block = mermaidBlock(drawn);
  if (block) {
    out.push('## What leaves, and who carries it', '', block, '');
    out.push(
      (report
        ? 'Only the tests this round demoted are drawn. '
        : 'The proposal’s diagram — rows the round declined are in it too. ') +
        `Dashed leaves the tier; the edge says what the carrier also reaches. The full table with every id is in the artefacts${artefacts ? ` (${artefacts})` : ''}.`,
      '',
    );
  }

  // the person's lists
  const look = pack?.lookTwice ?? [];
  if (look.length) {
    out.push(
      `## Look twice (${n(look.length)}) — not applied`,
      '',
      'Their names carry a scenario word; they wait for a person in `docs/testing/governance/cleared.json`, whatever the matrices say.',
      '',
    );
    for (const c of look.slice(0, listCap)) out.push(`- \`${shortName(c.test)}\``);
    if (look.length > listCap)
      out.push(`- … and ${n(look.length - listCap)} more in \`pack.json\``);
    out.push('');
  }
  if (notApplied.length) {
    const byReason = new Map();
    for (const x of notApplied)
      byReason.set(x.reason ?? 'unknown', (byReason.get(x.reason ?? 'unknown') ?? 0) + 1);
    out.push(`## Not applied (${n(notApplied.length)})`, '');
    for (const [reason, count] of [...byReason].sort()) out.push(`- ${n(count)} × \`${reason}\``);
    out.push('');
  }

  out.push(CLOSING, '');
  return { title, body: out.join('\n') };
}

const isMain =
  Boolean(process.argv[1]) && /pr-body\.mjs$/.test(process.argv[1].split(sep).join('/'));
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const json = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  const text = (p) => (p && existsSync(p) ? readFileSync(p, 'utf8') : null);
  const round = json(arg('round', 'docs/testing/governance/round.json'));
  if (!round) {
    console.error('pr-body: no round file');
    process.exit(2);
  }
  const { title, body } = prBody({
    round,
    pack: json(arg('pack')),
    ledger: json(arg('ledger')),
    invariants: json(arg('invariants')),
    gains: text(arg('gains')),
    diagram: text(arg('diagram')),
    report: json(arg('report')),
    artefacts: arg('artefacts', null),
  });
  const out = arg('out', 'reports/subsume');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'pr-title.txt'), title + '\n');
  writeFileSync(join(out, 'pr-body.md'), body);
  console.log(title);
  console.log(`pr-body: ${out}/pr-body.md (${body.length} chars)`);
}
