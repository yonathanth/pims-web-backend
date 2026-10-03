import { ExpiryOrderService } from './expiry-order.service';
import { SalePushService } from './sale-push.service';
import { GeneralConfigsModule } from '../general-configs/general-configs.module';
import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuditLogModule, NotificationsModule, GeneralConfigsModule],
  controllers: [SalesController],
  providers: [SalesService, ExpiryOrderService, SalePushService],
  exports: [SalesService, ExpiryOrderService],
})
export class SalesModule {}
