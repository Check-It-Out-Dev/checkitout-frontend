/**
 * L0 contract: NotificationCenterService ↔ generated models. Compile-time
 * only; see opportunities.contract.ts.
 *
 * Signal-facade note: this wrapper subscribes internally and exposes
 * signals, so its public methods return void — the generated-model
 * surface worth pinning is the DTO params (an `any` widening or a
 * codegen DTO move must fail typecheck here, naming the method). No
 * Observable import: nothing on this class returns one.
 */
import type { NotificationCenterService } from '../../app/core/notifications/notification-center.service';
import type { NotificationDtoOut } from '../../app/api/model/notification-dto-out';
import type { Equal, Expect } from '../type-assert';

type _markAsRead = Expect<
  Equal<NotificationCenterService['markAsRead'], (notification: NotificationDtoOut) => void>
>;

type _archive = Expect<
  Equal<NotificationCenterService['archive'], (notification: NotificationDtoOut) => void>
>;

// Referenced so `noUnusedLocals` (if ever enabled here) stays quiet while
// the assertions remain purely type-level.
export type NotificationsContract = [_markAsRead, _archive];
