#!/usr/bin/env node
/**
 * Generates the self-signed certificate the dev-server serves HTTPS with
 * (`angular.json` → `sslKey` / `sslCert`), if it is not already there.
 *
 * The pair is NOT committed. It protects nothing — it exists so the browser
 * speaks https to localhost, which the app needs for secure cookies — but a
 * private key in a public repository reads as a leak no matter how worthless
 * the key is, and secret scanners are right to flag it. Generating one takes
 * a second and gives every clone its own.
 *
 * Runs automatically from `prestart`, so `npm start`, the wizard and the
 * Playwright tiers all get a certificate without anyone remembering to.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = join(ROOT, 'server.key');
const CRT = join(ROOT, 'server.crt');

if (existsSync(KEY) && existsSync(CRT)) {
  process.exit(0);
}

const { generate } = await import('selfsigned');

// Ten years: this is a local development certificate, and an expiry surprise
// mid-session is a worse failure mode than a long-lived localhost key.
// (selfsigned 5.x resolves a promise; earlier majors returned the object.)
const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
  keySize: 2048,
  days: 3650,
  algorithm: 'sha256',
  extensions: [
    { name: 'basicConstraints', cA: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
      ],
    },
  ],
});

writeFileSync(KEY, pems.private);
writeFileSync(CRT, pems.cert);
console.log('dev-cert: generated server.key + server.crt (self-signed, localhost only)');
