import { ApiHttp, type ApiResult } from './http-client';

/**
 * Layer 1 — Polish-registry (KRS/CEIDG/GUS) domain service.
 *
 * Production endpoints for the company-verification flow (lookup by NIP →
 * confirm → get/refresh company data) plus the /test/registry stubs that
 * script the upstream registries — the BE's e2e profile fakes KRS/GUS
 * responses per-NIP so the flow is deterministic without external calls.
 * Contract mirrors the BE Cucumber glue (RegistrySteps.java).
 */
export class RegistryApi {
  constructor(private readonly http: ApiHttp) {}

  // ── Production flow ─────────────────────────────────────────────────────────

  lookup(nip: string): Promise<ApiResult<Record<string, unknown>>> {
    return this.http.post('/registry/lookup', { nip });
  }

  confirm(nip: string): Promise<ApiResult<Record<string, unknown>>> {
    return this.http.post('/registry/confirm', { nip });
  }

  companyData(): Promise<ApiResult<Record<string, unknown> | null>> {
    return this.http.get('/registry/company-data');
  }

  refresh(): Promise<ApiResult<Record<string, unknown>>> {
    return this.http.post('/registry/refresh');
  }

  // ── /test/registry stubs + staging ──────────────────────────────────────────

  /** Reset registry stubs AND clear the lookup cache (both, like the BE glue). */
  async resetStubs(): Promise<void> {
    const reset = await this.http.post('/test/registry/reset');
    if (!reset.ok) throw new Error(`registry reset failed: HTTP ${reset.status}`);
    const cache = await this.http.post('/test/registry/clear-cache');
    if (!cache.ok) throw new Error(`registry clear-cache failed: HTTP ${cache.status}`);
  }

  async configureKrsCompany(nip: string): Promise<void> {
    const r = await this.http.post('/test/registry/configure-krs-company', { nip });
    if (!r.ok) throw new Error(`configure-krs-company failed: HTTP ${r.status}`);
  }

  async configureJdgCompany(nip: string): Promise<void> {
    const r = await this.http.post('/test/registry/configure-jdg-company', { nip });
    if (!r.ok) throw new Error(`configure-jdg-company failed: HTTP ${r.status}`);
  }

  async configureGusNotFound(nip: string): Promise<void> {
    const r = await this.http.post('/test/registry/configure-gus-not-found', { nip });
    if (!r.ok) throw new Error(`configure-gus-not-found failed: HTTP ${r.status}`);
  }

  async configureInactiveCompany(nip: string): Promise<void> {
    const r = await this.http.post('/test/registry/configure-inactive-company', { nip });
    if (!r.ok) throw new Error(`configure-inactive-company failed: HTTP ${r.status}`);
  }

  /** Registry-scoped emailVerified toggle (PG-side; keyed by firebaseUid). */
  async setEmailVerified(firebaseUid: string, verified: boolean): Promise<void> {
    const r = await this.http.post('/test/registry/set-email-verified', { firebaseUid, verified });
    if (!r.ok) throw new Error(`registry set-email-verified failed: HTTP ${r.status}`);
  }

  /** Create/find a bare user (no session) — returns its firebaseUid. */
  async ensureUser(email: string, role: string): Promise<string> {
    const r = await this.http.post<{ firebaseUid?: string }>('/test/auth/ensure-user', {
      email,
      role,
    });
    if (!r.ok) throw new Error(`ensure-user failed: HTTP ${r.status}`);
    const uid = r.json.firebaseUid;
    if (!uid) throw new Error(`ensure-user returned no firebaseUid: ${r.body.slice(0, 160)}`);
    return uid;
  }

  /** Attach company data with the given NIP to a user (duplicate-NIP staging). */
  async createCompanyData(firebaseUid: string, nip: string): Promise<void> {
    const r = await this.http.post('/test/registry/create-company-data', { firebaseUid, nip });
    if (!r.ok) throw new Error(`create-company-data failed: HTTP ${r.status}`);
  }
}
