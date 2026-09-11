/** Jest config for Angular 17 standalone components.
 *  Uses jest-preset-angular for HTML/SCSS resolution + Zone.js test patches.
 *  Matches every *.spec.ts under src/ + Stage-5b trace-library *.unit.spec.ts. */
module.exports = {
  preset: 'jest-preset-angular',
  // Stated explicitly rather than left to the preset: Stryker's jest runner reads the resolved
  // config without expanding presets, defaults to the node environment, and every Angular spec
  // then dies with `window is not defined`. Harmless duplication for a normal run.
  testEnvironment: 'jsdom',
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
    // The build and serving tools. They are plain .mjs with no framework in them, and two of them
    // bind a port, so the path-safety logic they share is worth a test in the fast gate rather
    // than a comment claiming it holds.
    '<rootDir>/tools/**/*.unit.spec.ts',
  ],
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  // Coverage is measured over code we WROTE. `src/app/api/**` is the
  // openapi-generator's output — 271 files nobody edits and nobody should be
  // credited or blamed for covering; counting it would move the number without
  // moving the truth. Environments and main/bootstrap files are excluded for
  // the same reason. Off by default (`--coverage` opts in) so the pre-commit
  // gate stays fast.
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/api/**',
    '!src/app/**/*.spec.ts',
    '!src/app/**/index.ts',
    '!src/**/*.d.ts',
  ],
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],
  coverageDirectory: '<rootDir>/coverage',
  // A ratchet, not an aspiration. First measurement (2026-09-12, 1141 tests):
  // statements 76.34, branches 68.21, functions 64.71, lines 77.72. The floor
  // sits two points under each, so an honest refactor does not trip it and a
  // slide does. Raise it when the number rises; never lower it to make a red
  // run green.
  coverageThreshold: {
    global: { statements: 74, branches: 66, functions: 62, lines: 75 },
  },
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
