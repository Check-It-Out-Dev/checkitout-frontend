/**
 * Typed test-data builders — the single fixture source for every layer
 * (docs/testing/LAYERED-TEST-ARCHITECTURE.md). Jest service specs,
 * component specs, sandbox visual fixtures and BDD payloads all import
 * from here; DTO shapes live in exactly one place.
 */
export { mergeDto, type DeepPartial } from './merge';
export { buildPage, type PageEnvelope } from './page.builder';
export { buildOpportunity, buildOpportunityStatus } from './opportunity.builder';
export { buildApplication } from './applied-opportunity.builder';
export { buildCompanyUser, buildInfluencerUser } from './user.builder';
export { buildNotification } from './notification.builder';
export { buildAddress } from './address.builder';
