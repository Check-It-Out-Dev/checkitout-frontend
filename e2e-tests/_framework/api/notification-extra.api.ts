import type { MarkAllReadResponse } from '../../../src/app/api/model/mark-all-read-response';
import type { NotificationDtoOut } from '../../../src/app/api/model/notification-dto-out';
import type { UserPreferencesDtoIn } from '../../../src/app/api/model/user-preferences-dto-in';
import type { ApiResult } from './http-client';
import type { TestSession } from './test-session';

/**
 * Layer 1 — notification write-side + staging endpoints the notification
 * oracles need beyond the read-side `NotificationsApi` (which stays untouched;
 * this file only ADDS the missing surface, per the S6 port rules).
 *
 * Constructor takes the whole {@link TestSession} (not just `ApiHttp`) because
 * archive is a DELETE and `ApiHttp` exposes no delete wrapper — the archive
 * call goes through the session's raw `APIRequestContext` (same cookie jar,
 * same `${baseURL}/api` surface) and is folded back into the `ApiResult`
 * shape so steps assert statuses uniformly.
 *
 * Bodies are typed with the GENERATED models (UserPreferencesDtoIn,
 * NotificationDtoOut, MarkAllReadResponse) so a BE contract change breaks
 * this file at compile time.
 */
export class NotificationExtraApi {
  constructor(private readonly session: TestSession) {}

  /** PATCH /notifications/{id}/read — returns the updated notification. */
  markAsRead(id: number): Promise<ApiResult<NotificationDtoOut>> {
    return this.session.api.patch<NotificationDtoOut>(`/notifications/${id}/read`);
  }

  /** POST /notifications/read-all — marks every unread, non-archived one read. */
  markAllAsRead(): Promise<ApiResult<MarkAllReadResponse>> {
    return this.session.api.post<MarkAllReadResponse>('/notifications/read-all');
  }

  /** DELETE /notifications/{id} — archive (soft delete), 204 No Content. */
  async archive(id: number): Promise<ApiResult<void>> {
    const res = await this.session.raw.delete(`/api/notifications/${id}`);
    const body = await res.text();
    return {
      status: res.status(),
      ok: res.ok(),
      headers: res.headers(),
      body,
      json: undefined,
    };
  }

  /**
   * ADMIN: turn OFF the partnership notification channels (in-app + email) for
   * the target user — mirrors the BE glue's "disables partnership notification
   * preferences". The PATCH merges, so the other channels are left untouched.
   */
  disablePartnershipPreferences(userId: number): Promise<ApiResult<unknown>> {
    const dto: UserPreferencesDtoIn = {
      notificationPartnershipEnabled: false,
      notificationEmailPartnershipEnabled: false,
    };
    return this.session.api.patch(`/user-preferences/user/${userId}`, dto);
  }

  /**
   * Staging hook: force an arbitrary accountStatus by email (evicts cache).
   * `TestSession.activate()` only covers ACTIVE; the account-activation oracle
   * needs IN_VALIDATION to arm the confirm-triggered auto-activation path.
   */
  async setAccountStatus(email: string, status: string): Promise<void> {
    const r = await this.session.api.post('/test/auth/set-account-status', { email, status });
    if (!r.ok) throw new Error(`set-account-status ${status} failed: HTTP ${r.status}`);
  }
}
