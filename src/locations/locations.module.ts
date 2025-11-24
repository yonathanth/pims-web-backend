import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RequestContextService } from '../common/request-context.service';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [LocationsController],
  providers: [LocationsService, RequestContextService],
  exports: [LocationsService],
})
export class LocationsModule {}
