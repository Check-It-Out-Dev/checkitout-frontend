import { mutantId, parseMutations, summarize, toKills } from './pit-matrix.mjs';

/**
 * PIT's XML is parsed without a library on the strength of its fixed shape; this spec is what
 * holds that assumption. The fixture is two real elements from the backend's first full-matrix
 * run (2026-09-14), trimmed to one killer each, plus one uncovered mutant.
 */
const T = (cls: string, nested: string, method: string): string =>
  `com.sm.instagram.platform.unit.service.${cls}.[engine:junit-jupiter]/[class:com.sm.instagram.platform.unit.service.${cls}]/[nested-class:${nested}]/[method:${method}()]`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mutations partial="true">
<mutation detected='true' status='KILLED' numberOfTestsRun='6'><sourceFile>TokenExchangeService.java</sourceFile><mutatedClass>com.sm.instagram.platform.auth.service.TokenExchangeService</mutatedClass><mutatedMethod>addClearCookie</mutatedMethod><methodDescription>(Ljakarta/servlet/http/HttpServletResponse;Ljava/lang/String;)V</methodDescription><lineNumber>1394</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.VoidMethodCallMutator</mutator><indexes><index>77</index></indexes><blocks><block>11</block></blocks><killingTests>${T('TokenExchangeServiceUnitTest', 'ClearPartialSessionCookiesTests', 'shouldClearOnlyPartialSessionCookies')}|${T('TokenExchangeServiceUnitTest', 'ClearSessionCookiesTests', 'shouldClearAllSessionCookies')}</killingTests><succeedingTests></succeedingTests><coveringTests>${T('TokenExchangeServiceUnitTest', 'ClearPartialSessionCookiesTests', 'shouldClearOnlyPartialSessionCookies')}</coveringTests><description>removed call to jakarta/servlet/http/HttpServletResponse::addCookie</description></mutation>
<mutation detected='false' status='SURVIVED' numberOfTestsRun='6'><sourceFile>TokenExchangeService.java</sourceFile><mutatedClass>com.sm.instagram.platform.auth.service.TokenExchangeService</mutatedClass><mutatedMethod>addClearCookie</mutatedMethod><methodDescription>(Ljakarta/servlet/http/HttpServletResponse;Ljava/lang/String;)V</methodDescription><lineNumber>1382</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.NegateConditionalsMutator</mutator><indexes><index>15</index></indexes><blocks><block>1</block></blocks><killingTests></killingTests><succeedingTests>${T('TokenExchangeServiceUnitTest', 'ClearSessionCookiesTests', 'shouldClearAllSessionCookies')}</succeedingTests><coveringTests>${T('TokenExchangeServiceUnitTest', 'ClearSessionCookiesTests', 'shouldClearAllSessionCookies')}</coveringTests><description>negated conditional</description></mutation>
<mutation detected='false' status='NO_COVERAGE' numberOfTestsRun='0'><sourceFile>Foo.java</sourceFile><mutatedClass>com.sm.instagram.platform.util.Foo</mutatedClass><mutatedMethod>bar</mutatedMethod><methodDescription>()V</methodDescription><lineNumber>10</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.EmptyReturnsMutator</mutator><indexes><index>3</index></indexes><blocks><block>0</block></blocks><killingTests></killingTests><succeedingTests></succeedingTests><coveringTests></coveringTests><description>replaced return value with &quot;&quot; for bar</description></mutation>
</mutations>`;

describe('pit-matrix', () => {
  const mutations = parseMutations(xml);

  it('reads every element and its status', () => {
    expect(mutations.map((m) => m.status)).toEqual(['KILLED', 'SURVIVED', 'NO_COVERAGE']);
    expect(mutations[0].line).toBe(1394);
    expect(mutations[0].mutator).toBe('VoidMethodCallMutator');
    expect(mutations[0].method).toBe(
      'addClearCookie(Ljakarta/servlet/http/HttpServletResponse;Ljava/lang/String;)V',
    );
  });

  it('strips the class prefix so a killer is the JUnit unique id the listener records', () => {
    expect(mutations[0].killedBy).toEqual([
      '[engine:junit-jupiter]/[class:com.sm.instagram.platform.unit.service.TokenExchangeServiceUnitTest]/[nested-class:ClearPartialSessionCookiesTests]/[method:shouldClearOnlyPartialSessionCookies()]',
      '[engine:junit-jupiter]/[class:com.sm.instagram.platform.unit.service.TokenExchangeServiceUnitTest]/[nested-class:ClearSessionCookiesTests]/[method:shouldClearAllSessionCookies()]',
    ]);
    expect(mutations[1].killedBy).toEqual([]);
    expect(mutations[1].coveredBy).toHaveLength(1);
  });

  it('decodes XML entities in descriptions', () => {
    expect(mutations[2].description).toBe('replaced return value with "" for bar');
  });

  it('gives a mutant an id that depends on what defines it and nothing else', () => {
    const a = mutantId(mutations[0]);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(mutantId({ ...mutations[0], killedBy: [] })).toBe(a);
    expect(mutantId({ ...mutations[0], line: 1395 })).not.toBe(a);
  });

  it('maps a mutant to its source path and keeps the matrix', () => {
    const kills = toKills(mutations, { root: null, commit: 'abc', tool: 'pitest' });
    const first = (kills.mutants as Record<string, any>)[mutantId(mutations[0])];
    expect(first.file).toBe(
      'src/main/java/com/sm/instagram/platform/auth/service/TokenExchangeService.java',
    );
    expect(first.fileSha).toBeNull();
    expect(first.killedBy).toHaveLength(2);
    expect(summarize(kills)).toEqual({
      mutants: 3,
      byStatus: { KILLED: 1, SURVIVED: 1, NO_COVERAGE: 1 },
      distinctKillers: 2,
      killedWithoutKiller: 0,
      invocationKills: 0,
    });
  });

  it('counts a KILLED mutant with no killer, which the CLI turns into a red exit', () => {
    const broken = [{ ...mutations[0], killedBy: [] }];
    const kills = toKills(broken, { root: null, commit: null, tool: 'pitest' });
    expect(summarize(kills).killedWithoutKiller).toBe(1);
  });
});
