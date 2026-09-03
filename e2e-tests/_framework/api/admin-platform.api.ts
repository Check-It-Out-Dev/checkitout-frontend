import type { APIRequestContext, APIResponse } from '@playwright/test';
import { ApiHttp, type ApiResult } from './http-client';
import type { TestSession } from './test-session';

import type { AddressDtoIn } from '../../../src/app/api/model/address-dto-in';
import type { AddressDtoOut } from '../../../src/app/api/model/address-dto-out';
import type { AdminTicketResponseDtoIn } from '../../../src/app/api/model/admin-ticket-response-dto-in';
import type { CityDto } from '../../../src/app/api/model/city-dto';
import type { ConsentDefinitionDtoIn } from '../../../src/app/api/model/consent-definition-dto-in';
import type { ConsentDefinitionDtoOut } from '../../../src/app/api/model/consent-definition-dto-out';
import type { ContentTypeDto } from '../../../src/app/api/model/content-type-dto';
import type { CurrencyDto } from '../../../src/app/api/model/currency-dto';
import type { DeletionEligibilityDto } from '../../../src/app/api/model/deletion-eligibility-dto';
import type { FaqCategoryDtoIn } from '../../../src/app/api/model/faq-category-dto-in';
import type { FaqCategoryDtoOut } from '../../../src/app/api/model/faq-category-dto-out';
import type { FaqDtoIn } from '../../../src/app/api/model/faq-dto-in';
import type { FaqDtoOut } from '../../../src/app/api/model/faq-dto-out';
import type { PageSupportTicketDtoOut } from '../../../src/app/api/model/page-support-ticket-dto-out';
import type { ServiceTypeDto } from '../../../src/app/api/model/service-type-dto';
import type { SupportTicketDtoIn } from '../../../src/app/api/model/support-ticket-dto-in';
import type { SupportTicketDtoOut } from '../../../src/app/api/model/support-ticket-dto-out';
import type { TicketResponseDtoIn } from '../../../src/app/api/model/ticket-response-dto-in';
import type { TicketResponseDtoOut } from '../../../src/app/api/model/ticket-response-dto-out';
import type { TicketStatus } from '../../../src/app/api/model/ticket-status';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';
import type { UserPreferencesDtoOut } from '../../../src/app/api/model/user-preferences-dto-out';

/**
 * Layer 1 — Admin platform-management domain service, for the BE
 * admin-platform-management.feature oracle (support tickets, FAQ CRUD +
 * display order, reference data, consent-definition admin, GeoIP admin,
 * GDPR location ops, upload statistics, per-user preferences/premium/
 * addresses/deletion-eligibility), mirroring the BE glue
 * (AdminPlatformManagementSteps.java):
 *
 *   - tickets      → POST /support/ticket (public), GET /support/ticket[?filters],
 *                    GET /support/ticket/{id}, PATCH /support/ticket/{id}/status?status=,
 *                    POST /support/ticket/{id}/admin-response (sendEmail:false, glue parity),
 *                    POST /support/ticket/response?reference&email (public customer reply)
 *   - FAQ          → POST/PUT /support/faq[…], DELETE /support/faq/{id}/soft,
 *                    PATCH /support/faq/{id}/display-order/{order} (+ categories twin)
 *   - reference    → POST/GET/PUT/PATCH/DELETE on /city /currency /content-type /service-type
 *   - consent      → GET+POST /admin/consent/definitions, GET /admin/consent/users/{id}
 *                    [+ /history/{type}]; DELETE /admin/consent/definitions/{id} is
 *                    deliberately kept even though the greenfield ConsentAdminController
 *                    exposes no DELETE handler — the 404 it draws is inside the BE
 *                    source's own "successful or not found" tolerance (cleanup parity)
 *   - geoip        → POST /admin/geoip/test-travel?fromIp&toIp&minutes (query params,
 *                    generated TestImpossibleTravelRequestParams)
 *   - per-user ops → PATCH /users/{id}/premium?premium=, GET /users/{id}/deletion-eligibility,
 *                    GET+PATCH /user-preferences/user/{id}, /address/user/{id} family
 *
 * Plus `requestGet/Post/Patch/Delete` raw-path probes for the BE feature's many
 * literal `"Admin" requests GET "/…"` monitoring lines (uploads stats, GDPR
 * compliance, enum metadata, rate-limit metrics, 2FA status) — the path IS the
 * scenario datum there, so the probe stays generic by design.
 *
 * Typed on the generated models so a BE contract change breaks this oracle at
 * compile time. Constructed from a TestSession (not a bare ApiHttp) because
 * the DELETE verbs go through the raw APIRequestContext (ApiHttp exposes none).
 */
export class AdminPlatformApi {
  private readonly http: ApiHttp;
  private readonly raw: APIRequestContext;

  constructor(session: TestSession) {
    this.http = session.api;
    this.raw = session.raw;
  }

  /** Build an ApiResult from a raw APIResponse (same shape ApiHttp returns). */
  private async toResult<T = unknown>(res: APIResponse): Promise<ApiResult<T>> {
    const body = await res.text();
    let json: T;
    try {
      json = (body ? JSON.parse(body) : {}) as T;
    } catch {
      json = {} as T;
    }
    return { status: res.status(), ok: res.ok(), headers: res.headers(), body, json };
  }

  // ── Generic raw-path probes (the feature's literal "requests VERB /path" lines) ──

  requestGet(path: string): Promise<ApiResult<unknown>> {
    return this.http.get(path);
  }

  requestPost(path: string): Promise<ApiResult<unknown>> {
    return this.http.post(path);
  }

  requestPatch(path: string): Promise<ApiResult<unknown>> {
    return this.http.patch(path);
  }

  async requestDelete(path: string): Promise<ApiResult<unknown>> {
    return this.toResult(await this.raw.delete(`/api${path}`));
  }

  // ── Support tickets ─────────────────────────────────────────────────────────

  /** POST /support/ticket — public creation endpoint (works anonymously too). */
  createTicket(dto: SupportTicketDtoIn): Promise<ApiResult<SupportTicketDtoOut>> {
    return this.http.post<SupportTicketDtoOut>('/support/ticket', dto);
  }

  /**
   * GET /support/ticket — ADMIN listing. Pinned to sort=id,desc&size=200 so the
   * created-ticket containment check stays deterministic on the PERSISTENT dev
   * DB (tickets have no delete endpoint and accumulate across runs; the BE
   * suite ran against a per-run database).
   */
  listTickets(): Promise<ApiResult<PageSupportTicketDtoOut>> {
    return this.http.get<PageSupportTicketDtoOut>('/support/ticket', {
      page: 0,
      size: 200,
      sort: 'id,desc',
    });
  }

  /** GET /support/ticket/{id} — ADMIN single-ticket view. */
  getTicket(id: number): Promise<ApiResult<SupportTicketDtoOut>> {
    return this.http.get<SupportTicketDtoOut>(`/support/ticket/${id}`);
  }

  /**
   * PATCH /support/ticket/{id}/status?status= — the ticket state machine.
   * Returns 409 CONFLICT on an invalid transition (the scenario's terminal-state
   * probes assert exactly that).
   */
  updateTicketStatus(id: number, status: TicketStatus): Promise<ApiResult<SupportTicketDtoOut>> {
    return this.http.patch<SupportTicketDtoOut>(`/support/ticket/${id}/status`, undefined, {
      status,
    });
  }

  /**
   * POST /support/ticket/{id}/admin-response. sendEmail:false mirrors the BE
   * glue ("Don't send real emails in E2E tests"); the IN_PROGRESS →
   * WAITING_FOR_CUSTOMER auto-transition under test is service logic,
   * independent of the email side-effect.
   */
  addAdminResponse(id: number, content: string): Promise<ApiResult<TicketResponseDtoOut>> {
    const dto: AdminTicketResponseDtoIn = { content, sendEmail: false };
    return this.http.post<TicketResponseDtoOut>(`/support/ticket/${id}/admin-response`, dto);
  }

  /** POST /support/ticket/response?reference&email — public customer reply. */
  addCustomerResponse(
    reference: string,
    email: string,
    content: string,
  ): Promise<ApiResult<TicketResponseDtoOut>> {
    const dto: TicketResponseDtoIn = { content };
    return this.http.post<TicketResponseDtoOut>('/support/ticket/response', dto, {
      reference,
      email,
    });
  }

  // ── FAQ + categories ────────────────────────────────────────────────────────

  createFaqCategory(dto: FaqCategoryDtoIn): Promise<ApiResult<FaqCategoryDtoOut>> {
    return this.http.post<FaqCategoryDtoOut>('/support/faq/categories', dto);
  }

  createFaq(dto: FaqDtoIn): Promise<ApiResult<FaqDtoOut>> {
    return this.http.post<FaqDtoOut>('/support/faq', dto);
  }

  updateFaq(id: number, dto: FaqDtoIn): Promise<ApiResult<FaqDtoOut>> {
    return this.http.put<FaqDtoOut>(`/support/faq/${id}`, dto);
  }

  /** DELETE /support/faq/{id}/soft — soft delete (204). */
  async softDeleteFaq(id: number): Promise<ApiResult<unknown>> {
    return this.toResult(await this.raw.delete(`/api/support/faq/${id}/soft`));
  }

  /** DELETE /support/faq/categories/{id}/soft — soft delete (204). */
  async softDeleteFaqCategory(id: number): Promise<ApiResult<unknown>> {
    return this.toResult(await this.raw.delete(`/api/support/faq/categories/${id}/soft`));
  }

  /** PATCH /support/faq/{id}/display-order/{order} — order rides in the path. */
  setFaqDisplayOrder(id: number, order: number): Promise<ApiResult<FaqDtoOut>> {
    return this.http.patch<FaqDtoOut>(`/support/faq/${id}/display-order/${order}`);
  }

  /** PATCH /support/faq/categories/{id}/display-order/{order}. */
  setFaqCategoryDisplayOrder(id: number, order: number): Promise<ApiResult<FaqCategoryDtoOut>> {
    return this.http.patch<FaqCategoryDtoOut>(
      `/support/faq/categories/${id}/display-order/${order}`,
    );
  }

  // ── Per-user admin operations ───────────────────────────────────────────────

  /** PATCH /users/{id}/premium?premium= (generated SetPremiumStatusRequestParams). */
  setPremium(userId: number, premium: boolean): Promise<ApiResult<UserDtoOut>> {
    return this.http.patch<UserDtoOut>(`/users/${userId}/premium`, undefined, { premium });
  }

  /** GET /users/{id}/deletion-eligibility. */
  deletionEligibility(userId: number): Promise<ApiResult<DeletionEligibilityDto>> {
    return this.http.get<DeletionEligibilityDto>(`/users/${userId}/deletion-eligibility`);
  }

  /** GET /user-preferences/user/{userId}. */
  preferencesForUser(userId: number): Promise<ApiResult<UserPreferencesDtoOut>> {
    return this.http.get<UserPreferencesDtoOut>(`/user-preferences/user/${userId}`);
  }

  /**
   * PATCH /user-preferences/user/{userId} with a RAW key/value map — the
   * validation oracle must be able to send off-contract bodies (unknown
   * fields, illegal enum values) to prove the BE rejects them; the glue's
   * "true"/"false" → boolean coercion happens in the step layer.
   */
  patchPreferencesForUser(
    userId: number,
    body: Record<string, unknown>,
  ): Promise<ApiResult<UserPreferencesDtoOut>> {
    return this.http.patch<UserPreferencesDtoOut>(`/user-preferences/user/${userId}`, body);
  }

  /** GET /address/user/{userId} — wire response is a JSON array (profile.api parity). */
  addressesForUser(userId: number): Promise<ApiResult<AddressDtoOut[]>> {
    return this.http.get<AddressDtoOut[]>(`/address/user/${userId}`);
  }

  /** GET /address/user/{userId}/primary — 404 when the user has no primary. */
  primaryAddressForUser(userId: number): Promise<ApiResult<AddressDtoOut>> {
    return this.http.get<AddressDtoOut>(`/address/user/${userId}/primary`);
  }

  /** POST /address/user/{userId} — admin creates an address on a target user. */
  createAddressForUser(userId: number, dto: AddressDtoIn): Promise<ApiResult<AddressDtoOut>> {
    return this.http.post<AddressDtoOut>(`/address/user/${userId}`, dto);
  }

  /** Sparse PATCH /address/{id}. */
  patchAddress(addressId: number, patch: Partial<AddressDtoIn>): Promise<ApiResult<AddressDtoOut>> {
    return this.http.patch<AddressDtoOut>(`/address/${addressId}`, patch);
  }

  async deleteAddress(addressId: number): Promise<ApiResult<unknown>> {
    return this.toResult(await this.raw.delete(`/api/address/${addressId}`));
  }

  // ── Reference data: city / currency / content-type / service-type ──────────

  createCity(dto: CityDto): Promise<ApiResult<CityDto>> {
    return this.http.post<CityDto>('/city', dto);
  }

  getCity(id: number): Promise<ApiResult<CityDto>> {
    return this.http.get<CityDto>(`/city/${id}`);
  }

  updateCity(id: number, dto: CityDto): Promise<ApiResult<CityDto>> {
    return this.http.put<CityDto>(`/city/${id}`, dto);
  }

  patchCity(id: number, patch: Partial<CityDto>): Promise<ApiResult<CityDto>> {
    return this.http.patch<CityDto>(`/city/${id}`, patch);
  }

  async deleteCity(id: number): Promise<ApiResult<unknown>> {
    return this.toResult(await this.raw.delete(`/api/city/${id}`));
  }

  createCurrency(dto: CurrencyDto): Promise<ApiResult<CurrencyDto>> {
    return this.http.post<CurrencyDto>('/currency', dto);
  }

  /** PUT /currency/{id} — the BE glue updates with a full body (merged in the step). */
  updateCurrency(id: number, dto: CurrencyDto): Promise<ApiResult<CurrencyDto>> {
    return this.http.put<CurrencyDto>(`/currency/${id}`, dto);
  }

  async deleteCurrency(id: number): Promise<ApiResult<unknown>> {
    return this.toResult(await this.raw.delete(`/api/currency/${id}`));
  }

  createContentType(dto: ContentTypeDto): Promise<ApiResult<ContentTypeDto>> {
    return this.http.post<ContentTypeDto>('/content-type', dto);
  }

  updateContentType(id: number, dto: ContentTypeDto): Promise<ApiResult<ContentTypeDto>> {
    return this.http.put<ContentTypeDto>(`/content-type/${id}`, dto);
  }

  async deleteContentType(id: number): Promise<ApiResult<unknown>> {
    return this.toResult(await this.raw.delete(`/api/content-type/${id}`));
  }

  createServiceType(dto: ServiceTypeDto): Promise<ApiResult<ServiceTypeDto>> {
    return this.http.post<ServiceTypeDto>('/service-type', dto);
  }

  updateServiceType(id: number, dto: ServiceTypeDto): Promise<ApiResult<ServiceTypeDto>> {
    return this.http.put<ServiceTypeDto>(`/service-type/${id}`, dto);
  }

  async deleteServiceType(id: number): Promise<ApiResult<unknown>> {
    return this.toResult(await this.raw.delete(`/api/service-type/${id}`));
  }

  // ── Consent-definition admin ────────────────────────────────────────────────

  createConsentDefinition(
    dto: ConsentDefinitionDtoIn,
  ): Promise<ApiResult<ConsentDefinitionDtoOut>> {
    return this.http.post<ConsentDefinitionDtoOut>('/admin/consent/definitions', dto);
  }

  /**
   * DELETE /admin/consent/definitions/{id} — cleanup parity with the BE glue.
   * The greenfield ConsentAdminController exposes NO delete handler, so this
   * draws a 404; the feature's "successful or not found" assertion (copied
   * from the BE source) tolerates exactly that.
   */
  async deleteConsentDefinition(id: number): Promise<ApiResult<unknown>> {
    return this.toResult(await this.raw.delete(`/api/admin/consent/definitions/${id}`));
  }

  /** GET /admin/consent/users/{userId} — current consents of one user. */
  userConsents(userId: number): Promise<ApiResult<unknown>> {
    return this.http.get(`/admin/consent/users/${userId}`);
  }

  /** GET /admin/consent/users/{userId}/history/{consentType} (path-param style). */
  consentHistory(userId: number, consentType: string): Promise<ApiResult<unknown>> {
    return this.http.get(
      `/admin/consent/users/${userId}/history/${encodeURIComponent(consentType)}`,
    );
  }

  // ── GeoIP admin + monitoring ────────────────────────────────────────────────

  /**
   * POST /admin/geoip/test-travel?fromIp&toIp&minutes — all three ride as query
   * params (generated TestImpossibleTravelRequestParams). Sent unvalidated so
   * the oracle can prove the BE 400s malformed IPs / negative minutes.
   */
  testTravel(fromIp: string, toIp: string, minutes: number): Promise<ApiResult<unknown>> {
    return this.http.post('/admin/geoip/test-travel', undefined, { fromIp, toIp, minutes });
  }

  /** GET /admin/uploads/user/{userId} — per-user upload statistics. */
  uploadsForUser(userId: number): Promise<ApiResult<unknown>> {
    return this.http.get(`/admin/uploads/user/${userId}`);
  }

  /** GET /gdpr/location/retention/user/{userId}. */
  gdprRetentionForUser(userId: number): Promise<ApiResult<unknown>> {
    return this.http.get(`/gdpr/location/retention/user/${userId}`);
  }

  /** GET /gdpr/location/export/user/{userId}. */
  gdprExportForUser(userId: number): Promise<ApiResult<unknown>> {
    return this.http.get(`/gdpr/location/export/user/${userId}`);
  }
}
