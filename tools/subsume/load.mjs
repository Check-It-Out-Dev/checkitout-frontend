/**
 * Readers for the four artefacts (tools/subsume/README.md) into one in-memory matrix that the
 * rest of the analysis works on. Two producers, one shape:
 *
 *   matrix.tests   Map<testId, { id, spec, seconds, flaky, probes:Set<probeKey>, kills:Set<mutantId>, units:Set<unit> }>
 *   matrix.probes  Map<probeKey, { unit, member, lines:number[]|null, branch:boolean }>
 *   matrix.mutants Map<mutantId, { unit, line, status, killers:Set<testId> }>
 *   matrix.scope   Set<unit>  — units (files or classes) the kill matrix says anything about
 *
 * A probe key is `<unit>|s|<id>`, `<unit>|f|<id>`, `<unit>|b|<id>|<path>` for Jest and
 * `<fqcn>|<index>` for JUnit. A unit is a source file (Jest) or a class (JUnit); a member is a
 * function id (Jest) or `name+descriptor` (JUnit). Lines are exact for JUnit and null for Jest.
 */
import { readFileSync } from 'node:fs';

export function newMatrix(repo) {
  return { repo, tests: new Map(), probes: new Map(), mutants: new Map(), scope: new Set() };
}

export function readJsonl(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function test(matrix, id, spec, seconds) {
  let t = matrix.tests.get(id);
  if (!t) {
    t = {
      id,
      spec,
      seconds: seconds ?? null,
      flaky: false,
      probes: new Set(),
      kills: new Set(),
      covers: new Set(), // mutants the kill matrix ran this test against, killed or not
      units: new Set(),
    };
    matrix.tests.set(id, t);
  }
  return t;
}

function probe(matrix, key, unit, member, lines, branch) {
  if (!matrix.probes.has(key)) matrix.probes.set(key, { unit, member, lines, branch });
}

export function markFlaky(matrix, ids) {
  for (const id of ids) {
    const t = matrix.tests.get(id);
    if (t) t.flaky = true;
  }
}

const PSEUDO = /^(\(plan setup\)|\(plan teardown\)|.* :: \(module load\))$/;
export const isPseudo = (id) => PSEUDO.test(id);

/**
 * A kill matrix from a run that stopped at the first killer — Stryker without `disableBail`, PIT
 * without `fullMutationMatrix` — names one test per mutant, and every other test kills nothing.
 * "Its kills are carried by the kept tests" is then true of every test and means nothing. Such a
 * file is refused, not warned about: the proposal is wrong from the first line, and a gate fed with
 * it would be green for the wrong reason.
 */
export function assertFullMatrix(kind, report, path) {
  const ok = kind === 'stryker' ? report.config?.disableBail === true : report.fullMatrix === true;
  if (!ok)
    throw new Error(
      `${path}: not a full kill matrix (${
        kind === 'stryker'
          ? 'Stryker ran without disableBail: true'
          : 'PIT ran without fullMutationMatrix=true, or the file predates the fullMatrix field'
      }); kill-subsumption would be vacuous. Regenerate it and run again.`,
    );
}

// ── Jest ──────────────────────────────────────────────────────────────────────────────────────

/** Which function of `maps.fnMap` contains a transpiled line; the member for I1's per-function view. */
function fnAt(fnMap, line) {
  let best = null;
  for (const [id, fn] of Object.entries(fnMap ?? {})) {
    const s = fn.loc?.start?.line ?? fn.decl?.start?.line;
    const e = fn.loc?.end?.line ?? s;
    if (s != null && line >= s && line <= e && (best === null || s >= best.s)) best = { id, s };
  }
  return best ? `fn:${best.id}` : 'fn:(top level)';
}

export function loadJest({ probes, maps, mutation, flaky }) {
  const m = newMatrix('frontend');
  const fileMaps = maps ? JSON.parse(readFileSync(maps, 'utf8')) : {};
  for (const rec of readJsonl(probes)) {
    if (rec.final) continue;
    const t = test(m, rec.test, rec.spec, rec.seconds);
    for (const [file, h] of Object.entries(rec.hits)) {
      const fm = fileMaps[file] ?? {};
      t.units.add(file);
      for (const id of h.s) {
        const k = `${file}|s|${id}`;
        t.probes.add(k);
        probe(m, k, file, fnAt(fm.fnMap, fm.statementMap?.[id]?.start?.line ?? -1), null, false);
      }
      for (const id of h.f) {
        const k = `${file}|f|${id}`;
        t.probes.add(k);
        probe(m, k, file, `fn:${id}`, null, false);
      }
      for (const [id, path] of h.b) {
        const k = `${file}|b|${id}|${path}`;
        t.probes.add(k);
        probe(m, k, file, fnAt(fm.fnMap, fm.branchMap?.[id]?.loc?.start?.line ?? -1), null, true);
      }
    }
  }
  if (mutation) {
    const r = JSON.parse(readFileSync(mutation, 'utf8'));
    assertFullMatrix('stryker', r, mutation);
    const byId = new Map();
    for (const [file, tf] of Object.entries(r.testFiles ?? {})) {
      for (const tt of tf.tests ?? [])
        byId.set(String(tt.id), `${file.replace(/\\/g, '/')} :: ${tt.name}`);
    }
    for (const [file, fv] of Object.entries(r.files)) {
      const unit = file.replace(/\\/g, '/');
      m.scope.add(unit);
      for (const mu of fv.mutants) {
        const name = (x) => byId.get(String(x)) ?? `stryker-test:${x}`;
        const killers = new Set((mu.killedBy ?? []).map(name));
        const coverers = new Set((mu.coveredBy ?? []).map(name));
        const id = `${unit}#${mu.id}`;
        m.mutants.set(id, {
          unit,
          line: mu.location?.start?.line ?? null,
          status: mu.status,
          killers,
          coverers,
        });
        for (const k of killers) {
          const t = m.tests.get(k);
          if (t) t.kills.add(id);
        }
        for (const c of coverers) {
          const t = m.tests.get(c);
          if (t) t.covers.add(id);
        }
      }
    }
  }
  if (flaky) markFlaky(m, JSON.parse(readFileSync(flaky, 'utf8')).tests ?? []);
  return m;
}

// ── JUnit ─────────────────────────────────────────────────────────────────────────────────────

export function unpack(base64) {
  const bytes = Buffer.from(base64, 'base64');
  const bits = [];
  for (let i = 0; i < bytes.length * 8; i++) if (bytes[i >> 3] & (1 << (i & 7))) bits.push(i);
  return bits;
}

export function loadJava({ probes, classes, kills, flaky }) {
  const m = newMatrix('backend');
  const cls = classes ? JSON.parse(readFileSync(classes, 'utf8')) : {};
  for (const rec of readJsonl(probes)) {
    if (rec.final) continue;
    const t = test(m, rec.test, rec.spec, rec.seconds);
    for (const [fqcn, b64] of Object.entries(rec.hits)) {
      t.units.add(fqcn);
      const map = cls[fqcn]?.probes ?? [];
      for (const i of unpack(b64)) {
        const k = `${fqcn}|${i}`;
        t.probes.add(k);
        const p = map[i];
        probe(
          m,
          k,
          fqcn,
          p?.method || '(unmapped)',
          p ? p.lines : null,
          !!p && p.branchLines.length > 0,
        );
      }
    }
  }
  if (kills) {
    const r = JSON.parse(readFileSync(kills, 'utf8'));
    assertFullMatrix('pit', r, kills);
    for (const [id, mu] of Object.entries(r.mutants)) {
      m.scope.add(mu.class);
      const killers = new Set(mu.killedBy);
      const coverers = new Set(mu.coveredBy ?? []);
      m.mutants.set(id, { unit: mu.class, line: mu.line, status: mu.status, killers, coverers });
      for (const k of killers) {
        const t = m.tests.get(k);
        if (t) t.kills.add(id);
      }
      for (const c of coverers) {
        const t = m.tests.get(c);
        if (t) t.covers.add(id);
      }
    }
  }
  if (flaky) markFlaky(m, JSON.parse(readFileSync(flaky, 'utf8')).tests ?? []);
  return m;
}

/** Tests that count for the analysis: real tests, not the pseudo-records. */
export function realTests(matrix) {
  return [...matrix.tests.values()].filter((t) => !isPseudo(t.id));
}
