import {
  NotificationDtoOutCategoryEnum,
  NotificationDtoOutPriorityEnum,
  type NotificationDtoOut,
} from '../../app/api/model/notification-dto-out';
import { NotificationType } from '../../app/api/model/notification-type';
import { mergeDto, type DeepPartial } from './merge';

/**
 * Unread partnership notification — the shape the bell + panel render.
 * `icon` is a Material Icons ligature name: any NEW name used here must
 * exist in the shipped subset (gate G13 `check:icon-subset` scans src/).
 */
export function buildNotification(overrides?: DeepPartial<NotificationDtoOut>): NotificationDtoOut {
  return mergeDto<NotificationDtoOut>(
    {
      id: 7001,
      type: NotificationType.APPLICATION_RECEIVED,
      category: NotificationDtoOutCategoryEnum.PARTNERSHIP,
      priority: NotificationDtoOutPriorityEnum.MEDIUM,
      icon: 'campaign',
      title: 'Nowe zgłoszenie do kampanii',
      message: 'Marta Vlogs zgłosiła się do „Letnia kampania specjałów kawowych".',
      actionUrl: '/applied-opportunities/9001',
      actionLabel: 'Zobacz zgłoszenie',
      isRead: false,
      createdAt: '2026-09-01T14:06:00',
      appliedOpportunityId: 9001,
    },
    overrides,
  );
}
