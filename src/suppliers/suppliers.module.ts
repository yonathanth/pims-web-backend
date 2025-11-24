import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RequestContextService } from '../common/request-context.service';

@Module({
  imports: [PrismaModule, AuditLogModule],
  providers: [SuppliersService, RequestContextService],
  controllers: [SuppliersController],
  exports: [SuppliersService],
})
export class SuppliersModule {}
