import { Module } from '@nestjs/common';
import { UnitTypesService } from './unit-types.service';
import { UnitTypesController } from './unit-types.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RequestContextService } from '../common/request-context.service';

@Module({
  imports: [PrismaModule, AuditLogModule],
  providers: [UnitTypesService, RequestContextService],
  controllers: [UnitTypesController],
  exports: [UnitTypesService],
})
export class UnitTypesModule {}

