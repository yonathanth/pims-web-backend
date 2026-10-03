import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ExpiryScannerService } from './expiry-scanner.service';
import { NotificationsController } from './notifications.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RequestContextService } from '../common/request-context.service';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    ExpiryScannerService,
    RequestContextService,
  ],
  exports: [NotificationsService, ExpiryScannerService],
})
export class NotificationsModule {}
