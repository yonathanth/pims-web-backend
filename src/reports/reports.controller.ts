import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportGenerationService } from './services/report-generation.service';
import { PdfGenerationService } from './services/pdf-generation.service';
import { ExcelGenerationService } from './services/excel-generation.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { InventoryReportFiltersDto } from './dto/inventory-report-filters.dto';
import { SalesReportFiltersDto } from './dto/sales-report-filters.dto';
import { ExpiryReportFiltersDto } from './dto/expiry-report-filters.dto';
import { PurchaseReportFiltersDto } from './dto/purchase-report-filters.dto';
import { GenericReportFiltersDto } from './dto/generic-report-filters.dto';
import { ReportType, ReportFormat } from './types/report.types';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportGenerationService: ReportGenerationService,
    private readonly pdfGenerationService: PdfGenerationService,
    private readonly excelGenerationService: ExcelGenerationService,
  ) {}

  @Get('inventory')
  @ApiOperation({ summary: 'Generate inventory report data' })
  @ApiResponse({
    status: 200,
    description: 'Inventory report data generated successfully',
  })
  async generateInventoryReport(@Query() filters: InventoryReportFiltersDto) {
    try {
      return await this.reportGenerationService.generateInventoryReport(
        filters,
      );
    } catch (error) {
      throw new HttpException(
        `Failed to generate inventory report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('sales')
  @ApiOperation({ summary: 'Generate sales report data' })
  @ApiResponse({
    status: 200,
    description: 'Sales report data generated successfully',
  })
  async generateSalesReport(@Query() filters: SalesReportFiltersDto) {
    try {
      return await this.reportGenerationService.generateSalesReport(filters);
    } catch (error) {
      throw new HttpException(
        `Failed to generate sales report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('expiry')
  @ApiOperation({ summary: 'Generate expiry report data' })
  @ApiResponse({
    status: 200,
    description: 'Expiry report data generated successfully',
  })
  async generateExpiryReport(@Query() filters: ExpiryReportFiltersDto) {
    try {
      return await this.reportGenerationService.generateExpiryReport(filters);
    } catch (error) {
      throw new HttpException(
        `Failed to generate expiry report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('purchase')
  @ApiOperation({ summary: 'Generate purchase report data' })
  @ApiResponse({
    status: 200,
    description: 'Purchase report data generated successfully',
  })
  async generatePurchaseReport(@Query() filters: PurchaseReportFiltersDto) {
    try {
      return await this.reportGenerationService.generatePurchaseReport(filters);
    } catch (error) {
      throw new HttpException(
        `Failed to generate purchase report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('export/:type/:format')
  @ApiOperation({ summary: 'Export report as PDF or Excel file' })
  @ApiParam({
    name: 'type',
    enum: ReportType,
    description: 'Type of report to export',
  })
  @ApiParam({
    name: 'format',
    enum: ReportFormat,
    description: 'Export format (PDF or Excel)',
  })
  @ApiResponse({
    status: 200,
    description: 'Report file generated and sent successfully',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async exportReport(
    @Param('type') type: ReportType,
    @Param('format') format: ReportFormat,
    @Query() filters: GenericReportFiltersDto,
    @Res() res: Response,
  ) {
    try {
      console.log('Export Report - Starting:', { type, format, filters });
      // Generate report data
      let reportData;
      switch (type) {
        case ReportType.INVENTORY:
          reportData =
            await this.reportGenerationService.generateInventoryReport(filters);
          break;
        case ReportType.SALES:
          reportData =
            await this.reportGenerationService.generateSalesReport(filters);
          break;
        case ReportType.EXPIRY:
          reportData =
            await this.reportGenerationService.generateExpiryReport(filters);
          break;
        case ReportType.PURCHASE:
          reportData =
            await this.reportGenerationService.generatePurchaseReport(filters);
          break;
        default:
          throw new HttpException(
            'Invalid report type',
            HttpStatus.BAD_REQUEST,
          );
      }

      console.log('Export Report - Report data generated:', {
        reportType: reportData.reportType,
        dataLength: reportData.data?.length || 0,
      });

      // Generate file based on format
      let fileBuffer: Buffer;
      let contentType: string;
      let filename: string;

      if (format === ReportFormat.PDF) {
        console.log('Export Report - Generating PDF...');
        fileBuffer = await this.pdfGenerationService.generatePDF(reportData);
        contentType = 'application/pdf';
        filename = `${type}_report_${Date.now()}.pdf`;
      } else if (format === ReportFormat.EXCEL) {
        fileBuffer =
          await this.excelGenerationService.generateExcel(reportData);
        contentType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `${type}_report_${Date.now()}.xlsx`;
      } else {
        throw new HttpException(
          'Invalid export format',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Set response headers
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.setHeader('Content-Length', fileBuffer.length);

      // Send file
      res.send(fileBuffer);
    } catch (error) {
      console.error('Export Report - Error occurred:', error);
      throw new HttpException(
        `Failed to export report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('test-pdf')
  @ApiOperation({ summary: 'Test PDF generation with mock data' })
  @ApiResponse({
    status: 200,
    description: 'Test PDF file',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async testPDF(@Res() res: Response) {
    try {
      console.log('Test PDF - Starting...');

      // Create mock report data
      const mockReportData = {
        reportType: 'Test Report',
        filters: {},
        data: [
          {
            id: 1,
            drugName: 'Test Drug',
            sku: 'TEST001',
            batchNumber: 'B000001',
            expiryDate: '2024-12-31',
            quantity: 100,
            location: 'Test Location',
            unitPrice: 10.5,
            lastRestock: '2024-01-01',
            supplier: 'Test Supplier',
            category: 'Test Category',
            status: 'Current Stock',
          },
        ],
        headers: [
          { key: 'drugName', header: 'Drug Name' },
          { key: 'sku', header: 'SKU' },
          { key: 'quantity', header: 'Quantity' },
        ],
        summary: {
          totalRecords: 1,
          totalItems: 1,
          totalQuantity: 100,
          totalValue: 1050,
        },
      };

      console.log('Test PDF - Mock data created, generating PDF...');
      const fileBuffer =
        await this.pdfGenerationService.generatePDF(mockReportData);

      console.log(
        'Test PDF - PDF generated successfully, size:',
        fileBuffer.length,
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="test_report.pdf"',
      );
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    } catch (error) {
      console.error('Test PDF - Error occurred:', error);
      throw new HttpException(
        `Failed to generate test PDF: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('preview/:type')
  @ApiOperation({ summary: 'Preview report data without generating file' })
  @ApiParam({
    name: 'type',
    enum: ReportType,
    description: 'Type of report to preview',
  })
  @ApiResponse({
    status: 200,
    description: 'Report preview data generated successfully',
  })
  async previewReport(
    @Param('type') type: ReportType,
    @Query() filters: GenericReportFiltersDto,
  ) {
    try {
      switch (type) {
        case ReportType.INVENTORY:
          return await this.reportGenerationService.generateInventoryReportPreview(
            filters,
          );
        case ReportType.SALES:
          return await this.reportGenerationService.generateSalesReportPreview(
            filters,
          );
        case ReportType.EXPIRY:
          return await this.reportGenerationService.generateExpiryReportPreview(
            filters,
          );
        case ReportType.PURCHASE:
          return await this.reportGenerationService.generatePurchaseReportPreview(
            filters,
          );
        default:
          throw new HttpException(
            'Invalid report type',
            HttpStatus.BAD_REQUEST,
          );
      }
    } catch (error) {
      throw new HttpException(
        `Failed to preview report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
