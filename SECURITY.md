# Security Policy

## Supported Versions

The `v1.x` line is actively maintained. Security patches are backported
for the previous minor release (e.g. when `v1.3` ships, `v1.2.x` still
receives critical fixes for ~3 months). Older lines are best-effort.

| Version    | Supported                    |
| ---------- | ---------------------------- |
| `v1.x`     | ✅ Active                    |
| `v1.{x-1}` | 🟡 Security only (~3 months) |
| `< v1.0`   | ❌ Pre-release; no support   |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please email **security@check-it-out.pl** (fallback:
**norbert_marchewka@checkitout.app**) with:

1. A description of the vulnerability and its impact
2. Steps to reproduce (or a proof-of-concept)
3. The affected versions / commits
4. Your contact details for follow-up

### What to expect

- **Acknowledgement** within 72 hours
- **Initial assessment** within 7 days (severity, scope, remediation timeline)
- **Patch + coordinated disclosure** within 30 days for high/critical findings;
  longer for issues that require deeper architectural changes (we'll keep you
  posted)
- **Credit** in the release notes (unless you prefer to stay anonymous)

### Out of scope

- Issues in dependencies (please report upstream — but feel free to flag
  here if our usage exposes them in a non-obvious way)
- Issues that require physical access to the user's device
- Social-engineering attacks against the platform's users
- Self-XSS / clickjacking on logged-out pages without a clear escalation path
- Findings on outdated `< v1.0` pre-release tags

## Disclosure Philosophy

This is a marketplace platform used by Polish and European startups. The
RODO/GDPR compliance posture means a security gap can directly affect
end-user data. We take that seriously — please give us a reasonable
window to fix before public disclosure, and we'll move as fast as we can.

For non-security bugs, please open a regular GitHub issue.
