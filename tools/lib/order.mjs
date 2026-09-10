/**
 * The one ordering these tools sort by, and why it is not `localeCompare`.
 *
 * Everything the tools under `tools/` sort is machine-facing: file paths, test ids, check names,
 * icon names, gate names. Two properties matter for those, and only two:
 *
 *   1. The same input produces the same output on every machine. `tools/lib/visual-sources.mjs`
 *      hashes a sorted file list into a digest that decides whether a visual baseline is stale;
 *      `check-gate-parity` compares two sorted name lists for equality. `localeCompare` is
 *      locale- and ICU-version-dependent, so it can order the same two strings differently on a
 *      developer's Windows box and on an Ubuntu runner -- which would make a digest disagree with
 *      itself across machines and a parity check disagree with itself across Node releases.
 *   2. It agrees with how the rest of the toolchain orders paths. git, POSIX `sort` and
 *      `Array.prototype.sort`'s default all compare code units, so this ordering is the one a
 *      reader already expects when they look at a sorted path list.
 *
 * Sonar's javascript:S2871 asks for a comparator built on `String.localeCompare`, because for text
 * a human reads, locale-aware collation is right ("é" belongs next to "e", not after "z"). None of
 * these lists is text a human reads in sorted order, so that trade goes the other way here. The
 * rule is turned off for `tools/**` in sonar-project.properties, pointing at this file, and stays
 * on everywhere else -- a list shown in the UI must still collate properly.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero or positive, by UTF-16 code unit
 */
export function byCodepoint(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
