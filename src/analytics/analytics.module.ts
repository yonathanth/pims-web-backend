import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsUploaderService } from './analytics.uploader';
import { AnalyticsPeriodUploaderService } from './analytics-period-uploader.service';
import { PrismaModule } from '../prisma/prisma.module';
import { GeneralConfigsModule } from '../general-configs/general-configs.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [PrismaModule, GeneralConfigsModule, SalesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsUploaderService, AnalyticsPeriodUploaderService],
  exports: [AnalyticsUploaderService, AnalyticsPeriodUploaderService],
})
export class AnalyticsModule {}
