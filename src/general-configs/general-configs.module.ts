import { Module } from '@nestjs/common';
import { GeneralConfigsService } from './general-configs.service';
import { GeneralConfigsController } from './general-configs.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RequestContextService } from '../common/request-context.service';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [GeneralConfigsController],
  providers: [GeneralConfigsService, RequestContextService],
  exports: [GeneralConfigsService],
})
export class GeneralConfigsModule {}
