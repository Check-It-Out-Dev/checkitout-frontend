/**
 * `_framework/` — shared infrastructure for the scenario tier
 * (`e2e-tests/scenarios/**`).
 *
 * One barrel export so spec files can write
 *
 *     import { ActorRegistry, ACTORS, given, when, then, tags } from '../../_framework';
 *
 * instead of pulling from five files.
 *
 * Conventions: Cucumber-style given/when/then wrappers over Playwright,
 * multi-actor via ActorRegistry, tags mirroring the BE runner suites.
 * See `docs/testing/LAYERED-TEST-ARCHITECTURE.md` for how this tier
 * fits the pyramid.
 */
export * from './actor';
export * from './auth';
export * from './totp';
export { given } from './given';
export { when } from './when';
export { then } from './then';
export { tags } from './tags';
