import { ApiHttp, type ApiResult } from './http-client';

/**
 * Layer 1 — notifications domain service (oracle tier).
 *
 * Read side of the in-app notification feed plus the admin PATCH that toggles
 * a user's notification preferences (the BE Cucumber notification suites stage
 * preferences this way before asserting deliveries).
 */
export class NotificationsApi {
  constructor(private readonly http: ApiHttp) {}

  unreadCount(): Promise<ApiResult<{ count?: number; unreadCount?: number }>> {
    return this.http.get('/notifications/unread/count');
  }

  list(page = 0, size = 10): Promise<ApiResult<{ content?: Array<{ type?: string }> }>> {
    return this.http.get('/notifications', { page, size });
  }

  /** ADMIN: enable every notification channel for the target user (mirrors the BE glue). */
  async enableAllPreferences(userId: number): Promise<ApiResult<unknown>> {
    return this.http.patch(`/user-preferences/user/${userId}`, {
      notificationPartnershipEnabled: true,
      notificationSupportEnabled: true,
      notificationSystemEnabled: true,
      notificationEmailEnabled: true,
      notificationEmailPartnershipEnabled: true,
      notificationEmailSupportEnabled: true,
    });
  }
}
