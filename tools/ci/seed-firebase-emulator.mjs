#!/usr/bin/env node
/**
 * Puts the three fixed actors into a running Firebase Auth and Firestore emulator.
 *
 * The backend's own end-to-end tier seeds the emulator from inside its Spring context
 * (`FirebaseEmulatorSeeder`), which is the right place for it: the admin's TOTP secret goes through
 * the application's own cipher, so the ciphertext can never drift from what the application reads.
 * The nightly cannot do that. Here the backend is a published container image and nothing in this
 * repository runs inside it, so the actors have to be created from outside, over the emulator's REST
 * API.
 *
 * What that costs, stated rather than hidden: this seeds Firebase Auth accounts, their custom claims
 * and the influencer's Instagram profile document — everything the frontend's ported scenarios
 * actually touch. It does NOT seed the admin's TOTP secret, because that value is only meaningful
 * once encrypted with the key the application is configured with, and guessing the format here is
 * exactly the duplication the backend's seeder exists to avoid. The step-up scenarios that need it
 * stay in the backend's own tier, where the application seeds itself.
 *
 *   node tools/ci/seed-firebase-emulator.mjs
 *
 * Reads FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST and FIREBASE_PROJECT_ID; the emulator
 * accepts the literal bearer token "owner" for privileged calls.
 */

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const STORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'demo-checkitout';
const PASSWORD = process.env.E2E_SEED_PASSWORD || 'e2e-emulator-password';

// The same three actors the backend's application-e2e configuration names, so a scenario that runs
// in both tiers is talking about the same people.
const ACTORS = [
  { uid: 'E2E_ADMIN_001', email: 'e2e.admin@test.com', role: 'ADMIN' },
  { uid: 'E2E_COMPANY_001', email: 'e2e.company@test.com', role: 'COMPANY' },
  { uid: 'E2E_INFLUENCER_001', email: 'e2e.influencer@test.com', role: 'INFLUENCER' },
];

// What `POST /test/auth/simulate-influencer-oauth` reads out of Firestore instead of calling Meta.
// The values mirror the backend seeder's, so the two tiers assert against the same profile.
const INSTAGRAM_PROFILE = {
  user_id: { stringValue: '17841400000000001' },
  username: { stringValue: 'styleguru' },
  followers_count: { integerValue: '12500' },
  profile_picture_url: { stringValue: 'https://example.test/styleguru.jpg' },
  firebaseUid: { stringValue: 'E2E_INFLUENCER_001' },
};

const authBase = `http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const storeBase = `http://${STORE}/v1/projects/${PROJECT}/databases/(default)/documents`;

async function call(url, body, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** The emulator hub answers as soon as both emulators are listening. */
async function waitForEmulators(seconds = 90) {
  const hub = `http://${AUTH.split(':')[0]}:4400/emulators`;
  for (let i = 0; i < seconds; i++) {
    try {
      const res = await fetch(hub);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`the emulator hub at ${hub} did not answer in ${seconds}s`);
}

async function upsert(actor) {
  // Creating with an explicit localId is the privileged path; if the account survived from an
  // earlier run the create fails and the update below is what matters anyway.
  try {
    await call(`${authBase}/accounts`, {
      localId: actor.uid,
      email: actor.email,
      password: PASSWORD,
      emailVerified: true,
      displayName: actor.role.toLowerCase(),
    });
  } catch (e) {
    if (!/DUPLICATE_LOCAL_ID|EMAIL_EXISTS/.test(String(e))) throw e;
  }
  // The password is the one thing the suite depends on and the one thing a lookup cannot report, so
  // it is set every time rather than trusted. The role travels as a custom claim because
  // TokenExchangeService reads the claim and never trusts the token's body.
  await call(`${authBase}/accounts:update`, {
    localId: actor.uid,
    email: actor.email,
    password: PASSWORD,
    emailVerified: true,
    customAttributes: JSON.stringify({ role: actor.role, activated: true }),
  });
  console.log(`  ${actor.role.padEnd(10)} ${actor.uid} <${actor.email}>`);
}

async function main() {
  console.log(`seeding ${PROJECT} — auth ${AUTH}, firestore ${STORE}`);
  await waitForEmulators();
  for (const actor of ACTORS) await upsert(actor);
  await call(`${storeBase}/instagramUsers/E2E_INFLUENCER_001`, { fields: INSTAGRAM_PROFILE }, 'PATCH');
  console.log('  instagramUsers/E2E_INFLUENCER_001 (styleguru)');
  console.log('seeded');
}

main().catch((e) => {
  console.error(`seeding failed: ${e.message}`);
  process.exit(1);
});
