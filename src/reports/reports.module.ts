import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportGenerationService } from './services/report-generation.service';
import { PdfGenerationService } from './services/pdf-generation.service';
import { ExcelGenerationService } from './services/excel-generation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [
    ReportGenerationService,
    PdfGenerationService,
    ExcelGenerationService,
  ],
  exports: [
    ReportGenerationService,
    PdfGenerationService,
    ExcelGenerationService,
  ],
})
export class ReportsModule {}


