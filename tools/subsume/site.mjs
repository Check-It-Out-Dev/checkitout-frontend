#!/usr/bin/env node
/**
 * The governance page: one HTML file a person can read, drawn from the run's own reports and
 * nothing else — the proposal (subsume-report.json), the pack (pack.json), the subsumption diagram
 * (diagram.md) and, on a round page, the ledger and the gains diagram. Published to Pages beside the
 * gzipped artefacts the jobs consume, so the numbers people read and the numbers machines read are
 * the same file's neighbours.
 *
 *   node tools/subsume/site.mjs --repo frontend|backend --run <id> --report subsume-report.json
 *        --pack pack.json --diagram diagram.md [--ledger governance-ledger.json --gains gains.md]
 *        [--links "label=url,label=url"] --out site/subsume/<id>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const n = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const mermaidBlock = (md) => md?.match(/```mermaid\n([\s\S]*?)\n```/)?.[1] ?? null;

export function page({ repo, run, report, pack, diagram, ledger, gains, links = [] }) {
  const s = report?.summary ?? {};
  const m = report?.metrics ?? {};
  const t = pack?.tiers ?? {};
  const title = `Test governance · ${repo} · run ${run}`;
  const rows = [];
  const kv = (k, v, note = '') =>
    rows.push(
      `<tr><th scope="row">${esc(k)}</th><td class="num">${v}</td><td class="note">${esc(note)}</td></tr>`,
    );
  kv('Tests in the pull-request tier', n(s.tests), 'the population the proposal judged');
  kv(
    'CONFIRMED · SUSPECTED',
    `${n(s.confirmed)} · ${n(s.suspected)}`,
    'both instruments agree · coverage only, never acted on',
  );
  if (s.prTierSeconds)
    kv(
      'Tier seconds, before → after the exact cover',
      `${s.prTierSeconds.before} s → ${s.prTierSeconds.after} s`,
      'sum of the tests’ own seconds',
    );
  if (m.dominatorScore != null)
    kv(
      'Dominator mutation score',
      `${m.dominatorScore.before ?? m.dominatorScore} %`,
      'killed dominators over dominators plus unkilled mutants — the de-inflated score',
    );
  if (m.redundancyShare != null)
    kv(
      'Redundancy share of tier time',
      `${Math.round(m.redundancyShare * 1000) / 10} %`,
      'each test against the rest; not what can leave together',
    );
  if (m.removableTogether)
    kv(
      'Removable together',
      `${n(m.removableTogether.tests)} tests · ${m.removableTogether.seconds} s`,
      'the confirmed cover’s complement',
    );
  if (report?.solver)
    kv(
      'Cover',
      `${esc(report.solver.method)} · ${esc(report.solver.status)} · gap ${report.solver.gapPct ?? 0} %`,
      'the cheapest set that keeps every probe and kill, with its certificate',
    );
  const tierRows = ['A', 'B', 'C', 'D']
    .filter((k) => t[k])
    .map(
      (k) =>
        `<tr><th scope="row">${k}</th><td class="num">${n(t[k].taken)}</td><td class="num">${n(t[k].available)}</td><td class="num">${t[k].seconds ?? '—'} s</td></tr>`,
    )
    .join('');
  const look = (pack?.lookTwice ?? [])
    .slice(0, 60)
    .map((c) => `<li><code>${esc(c.test)}</code></li>`)
    .join('');
  const dia = mermaidBlock(diagram);
  const gainsDia = mermaidBlock(gains);
  const linkRow = links.map(([l, u]) => `<a href="${esc(u)}">${esc(l)}</a>`).join(' · ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; --ink: #1c211e; --ink-2: #4b534e; --ink-3: #7b847e; --paper: #f4f5f2; --paper-2: #eaece6; --rule: #d3d8d1; --accent: #1f5f4a; }
  @media (prefers-color-scheme: dark) { :root { --ink: #e5e8e2; --ink-2: #b4bcb5; --ink-3: #8a938c; --paper: #151917; --paper-2: #1d2320; --rule: #333b36; --accent: #7fc4a6; } }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.55 "Atkinson Hyperlegible", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding-block: 2rem 4rem; padding-inline: clamp(16px, 5vw, 48px); }
  main { max-width: 76ch; margin: 0 auto; }
  h1 { font: 600 1.9rem/1.2 Georgia, "Iowan Old Style", serif; margin: 0 0 0.4rem; text-wrap: balance; }
  h2 { font: 600 1.25rem/1.25 Georgia, serif; margin: 2.2rem 0 0.6rem; padding-top: 0.8rem; border-top: 1px solid var(--rule); }
  .eyebrow { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-3); font-weight: 700; margin: 0 0 0.4rem; }
  .lede { color: var(--ink-2); margin: 0.4rem 0 1rem; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
  thead th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); }
  tbody th { font-weight: 600; }
  td.num { text-align: right; white-space: nowrap; }
  td.note { color: var(--ink-3); font-size: 0.9rem; }
  .wrap { overflow-x: auto; }
  pre.mermaid { background: var(--paper-2); padding: 0.8rem; border-radius: 4px; overflow-x: auto; }
  code { font-family: "JetBrains Mono", Consolas, monospace; font-size: 0.82em; background: var(--paper-2); padding: 0.05em 0.3em; border-radius: 3px; }
  ul { padding-left: 1.2rem; } li { margin: 0.2rem 0; overflow-wrap: anywhere; }
  .verdict { font-weight: 700; }
  a { color: var(--accent); }
  footer { margin-top: 3rem; color: var(--ink-3); font-size: 0.85rem; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">▮ Invariants — replay plane · no model · I1–I5</p>
  <h1>${esc(title)}</h1>
  <p class="lede">What the proposal run measured, what the pack would take this round, and who carries whom. Every number on this page is read from the run’s reports; the gzipped artefacts beside it are what the pull-request jobs consume.${linkRow ? ` ${linkRow}.` : ''}</p>

  ${
    ledger
      ? `<h2>The round’s ledger</h2><p class="verdict">Verdict: ${esc(ledger.verdict)}${ledger.incomplete?.length ? ` — missing: ${esc(ledger.incomplete.join(', '))}` : ''}</p>
  <div class="wrap"><table><thead><tr><th>Measure</th><th>Before</th><th>After</th></tr></thead><tbody>
  <tr><th scope="row">Tests in the tier</th><td class="num">${n(ledger.before?.tests)}</td><td class="num">${n(ledger.after?.tests)}</td></tr>
  <tr><th scope="row">Tier seconds (per-test sum${ledger.before?.sameMachine ? ', same machine' : ''})</th><td class="num">${ledger.before?.seconds ?? '—'} s</td><td class="num">${ledger.after?.seconds ?? '—'} s</td></tr>
  <tr><th scope="row">Mutation score</th><td class="num">${ledger.mutation?.scoreBefore ?? '—'} %</td><td class="num">${ledger.mutation?.scoreAfter ?? '—'} %</td></tr>
  <tr><th scope="row">Kills lost to the round · to the machine</th><td class="num" colspan="2">${n(ledger.mutation?.lost?.length)} · ${n(ledger.mutation?.lostByEnvironment?.length)}</td></tr>
  </tbody></table></div>
  ${gainsDia ? `<pre class="mermaid">${esc(gainsDia)}</pre>` : ''}`
      : ''
  }

  <h2>The proposal</h2>
  <div class="wrap"><table><tbody>${rows.join('')}</tbody></table></div>

  <h2>The pack, surest tier first</h2>
  <div class="wrap"><table><thead><tr><th>Tier</th><th>Taken</th><th>Available</th><th>Seconds</th></tr></thead><tbody>${tierRows}</tbody></table></div>
  <p class="lede">A: an exact duplicate of a kept test in the same class · B: two or more carriers · C: one carrier · D: kills nothing, never taken while A–C are non-empty. ${pack?.gates?.determinism ? `Determinism ${esc(pack.gates.determinism)}.` : ''} ${pack?.forecast ? `${n(pack.forecast.roundsToSaturationAtThisBudget)} more round(s) to saturation at this budget.` : ''}</p>

  ${dia ? `<h2>Who carries whom</h2><pre class="mermaid">${esc(dia)}</pre><p class="lede">Dashed leaves the pull-request tier; the edge says what the carrier also reaches. At most six classes and four rows each are drawn; the rest are in the report.</p>` : ''}

  ${look ? `<h2>Look twice (${n(pack.lookTwice.length)}) — waiting for a person</h2><p class="lede">Their names carry a scenario word; nothing happens to them until <code>docs/testing/governance/cleared.json</code> says so.</p><ul>${look}</ul>` : ''}

  <footer>Generated by <code>tools/subsume/site.mjs</code> from the run’s reports. The method: the frontend’s <code>tools/subsume/README.md</code> and <code>docs/testing/ai-in-the-loop.md</code>.</footer>
</main>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: true, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'neutral' });</script>
</body>
</html>
`;
}

const isMain = Boolean(process.argv[1]) && /site\.mjs$/.test(process.argv[1].split(sep).join('/'));
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const json = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  const text = (p) => (p && existsSync(p) ? readFileSync(p, 'utf8') : null);
  const links = (arg('links', '') || '')
    .split(',')
    .filter(Boolean)
    .map((x) => x.split('=').map((y) => y.trim()));
  const html = page({
    repo: arg('repo', 'frontend'),
    run: arg('run', 'local'),
    report: json(arg('report')),
    pack: json(arg('pack')),
    diagram: text(arg('diagram')),
    ledger: json(arg('ledger')),
    gains: text(arg('gains')),
    links,
  });
  const out = arg('out', 'site/subsume/local');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.html'), html);
  console.log(`site: ${out}/index.html`);
}
