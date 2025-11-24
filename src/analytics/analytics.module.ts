import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsUploaderService } from './analytics.uploader';
import { PrismaModule } from '../prisma/prisma.module';
import { GeneralConfigsModule } from '../general-configs/general-configs.module';

@Module({
  imports: [PrismaModule, GeneralConfigsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsUploaderService],
})
export class AnalyticsModule {}
