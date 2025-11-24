import { ApiProperty } from '@nestjs/swagger';
import {
  NotificationType,
  NotificationSeverity,
} from './create-notification.dto';

export class NotificationCountsDto {
  @ApiProperty({ description: 'Total notifications' })
  total: number;

  @ApiProperty({ description: 'Unread notifications' })
  unread: number;

  @ApiProperty({ description: 'Counts by severity' })
  bySeverity: Record<NotificationSeverity, number>;

  @ApiProperty({ description: 'Counts by type' })
  byType: Record<NotificationType, number>;
}
