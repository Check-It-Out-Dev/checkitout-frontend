/** Jest config for Angular 17 standalone components.
 *  Uses jest-preset-angular for HTML/SCSS resolution + Zone.js test patches.
 *  Matches every *.spec.ts under src/ + Stage-5b trace-library *.unit.spec.ts. */
module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    // Stage-5b trace library — pure TS unit tests for canonicalize + diff.
    // Suffix .unit.spec.ts deliberately avoids matching Playwright integration
    // specs in the same tree (those are *.integration.spec.ts).
    '<rootDir>/e2e-tests/integration/_trace/**/*.unit.spec.ts',
    // T1 — TOTP helper for admin-2FA scenarios (RFC 6238). Same `.unit.spec.ts`
    // convention so Playwright runner ignores it.
    '<rootDir>/e2e-tests/_framework/**/*.unit.spec.ts',
    // The process map — what each sandbox tour claims, phase by phase. It has
    // to stay in step with the scenario registry, and that is a pure-TS check
    // with no browser in it, so it belongs in the fast gate rather than in the
    // tier that needs a served build.
    '<rootDir>/e2e-tests/perf/**/*.unit.spec.ts',
  ],
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.(ts|js|html|svg)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$',
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$|@angular|rxjs|@ngneat|flat)'],
};
