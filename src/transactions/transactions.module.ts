import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RequestContextService } from '../common/request-context.service';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [PrismaModule, NotificationsModule, AuditLogModule, SalesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, RequestContextService],
})
export class TransactionsModule {}
