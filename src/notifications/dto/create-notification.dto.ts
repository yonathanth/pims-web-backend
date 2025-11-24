import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional, IsInt, Min } from 'class-validator';

export enum NotificationType {
  OUT_OF_STOCK = 'out_of_stock',
  LOW_STOCK = 'low_stock',
  EXPIRED = 'expired',
  NEAR_EXPIRY = 'near_expiry',
}

export enum NotificationSeverity {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export class CreateNotificationDto {
  @ApiProperty({
    description: 'Type of notification',
    enum: NotificationType,
  })
  @IsEnum(NotificationType)
  notificationType: NotificationType;

  @ApiProperty({
    description: 'Severity level of notification',
    enum: NotificationSeverity,
  })
  @IsEnum(NotificationSeverity)
  severity: NotificationSeverity;

  @ApiProperty({
    description: 'Notification message',
    example: 'Batch #123 is running low on stock',
  })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    description: 'Entity name (e.g., "Batch")',
    example: 'Batch',
  })
  @IsOptional()
  @IsString()
  entityName?: string;

  @ApiPropertyOptional({
    description: 'Entity ID',
    example: 123,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  entityId?: number;

  @ApiPropertyOptional({
    description: 'Expiration date for the notification',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
