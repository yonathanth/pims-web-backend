import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ReportData } from '../types/report.types';

@Injectable()
export class ExcelGenerationService {
  /**
   * Generate Excel from report data
   */
  async generateExcel(reportData: ReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Create main data worksheet
    const dataSheet = workbook.addWorksheet('Report Data');

    // Add title and metadata
    this.addTitleAndMetadata(dataSheet, reportData);

    // Add summary section
    this.addSummarySection(dataSheet, reportData.summary);

    // Add data table
    this.addDataTable(dataSheet, reportData);

    // Create summary worksheet
    const summarySheet = workbook.addWorksheet('Summary');
    this.addSummaryWorksheet(summarySheet, reportData);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private addTitleAndMetadata(
    worksheet: ExcelJS.Worksheet,
    reportData: ReportData,
  ) {
    // Title
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = reportData.reportType;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Generation info
    worksheet.getCell('A2').value = 'Generated:';
    worksheet.getCell('B2').value = new Date().toLocaleString();
    worksheet.getCell('A2').font = { bold: true };

    // Empty row
    worksheet.getRow(3).height = 10;

    // Filters section
    worksheet.getCell('A4').value = 'Filters Applied:';
    worksheet.getCell('A4').font = { bold: true, underline: true };

    let filterRow = 5;
    const filterEntries = Object.entries(reportData.filters).filter(
      ([_, value]) => value,
    );

    if (filterEntries.length === 0) {
      worksheet.getCell(`A${filterRow}`).value = 'No filters applied';
    } else {
      filterEntries.forEach(([key, value]) => {
        const label = this.formatFilterLabel(key);
        worksheet.getCell(`A${filterRow}`).value = label;
        worksheet.getCell(`B${filterRow}`).value = value;
        worksheet.getCell(`A${filterRow}`).font = { bold: true };
        filterRow++;
      });
    }

    // Empty row
    worksheet.getRow(filterRow).height = 10;
  }

  private addSummarySection(worksheet: ExcelJS.Worksheet, summary: any) {
    const startRow = this.findNextEmptyRow(worksheet);

    worksheet.getCell(`A${startRow}`).value = 'Summary:';
    worksheet.getCell(`A${startRow}`).font = { bold: true, underline: true };

    let summaryRow = startRow + 1;
    Object.entries(summary).forEach(([key, value]) => {
      const label = this.formatSummaryLabel(key);
      worksheet.getCell(`A${summaryRow}`).value = label;
      worksheet.getCell(`B${summaryRow}`).value = value as any;
      worksheet.getCell(`A${summaryRow}`).font = { bold: true };
      summaryRow++;
    });

    // Empty row
    worksheet.getRow(summaryRow).height = 10;
  }

  private addDataTable(worksheet: ExcelJS.Worksheet, reportData: ReportData) {
    const { headers, data } = reportData;
    const startRow = this.findNextEmptyRow(worksheet) + 1;

    if (data.length === 0) {
      worksheet.getCell(`A${startRow}`).value =
        'No data available for the selected filters.';
      worksheet.getCell(`A${startRow}`).font = { bold: true, italic: true };
      return;
    }

    // Add headers
    const headerRow = worksheet.getRow(startRow);
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header.header;
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Add data rows
    data.forEach((row, rowIndex) => {
      const dataRow = worksheet.getRow(startRow + 1 + rowIndex);

      headers.forEach((header, colIndex) => {
        const cell = dataRow.getCell(colIndex + 1);
        const value = this.formatCellValue(row[header.key]);
        cell.value = value;

        // Alternate row colors
        if (rowIndex % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8F9FA' },
          };
        }

        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };

        // Center align numeric values
        if (typeof value === 'number') {
          cell.alignment = { horizontal: 'center' };
        }
      });
    });

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      if (column && column.eachCell) {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(Math.max(maxLength + 2, 10), 50);
      }
    });
  }

  private addSummaryWorksheet(
    worksheet: ExcelJS.Worksheet,
    reportData: ReportData,
  ) {
    // Title
    worksheet.mergeCells('A1:B1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `${reportData.reportType} - Summary`;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Summary data
    let row = 3;
    Object.entries(reportData.summary).forEach(([key, value]) => {
      const label = this.formatSummaryLabel(key);
      worksheet.getCell(`A${row}`).value = label;
      worksheet.getCell(`B${row}`).value = value;
      worksheet.getCell(`A${row}`).font = { bold: true };

      // Add borders
      ['A', 'B'].forEach((col) => {
        const cell = worksheet.getCell(`${col}${row}`);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      row++;
    });

    // Auto-fit columns
    worksheet.getColumn('A').width = 30;
    worksheet.getColumn('B').width = 20;
  }

  private findNextEmptyRow(worksheet: ExcelJS.Worksheet): number {
    let row = 1;
    while (
      worksheet.getCell(`A${row}`).value !== null &&
      worksheet.getCell(`A${row}`).value !== undefined
    ) {
      row++;
    }
    return row;
  }

  private formatFilterLabel(key: string): string {
    const labelMap: Record<string, string> = {
      fromDate: 'From Date',
      toDate: 'To Date',
      category: 'Category',
      status: 'Status',
      supplier: 'Supplier',
      drugId: 'Drug ID',
      daysThreshold: 'Days Threshold',
      orderStatus: 'Order Status',
    };
    return labelMap[key] || key.charAt(0).toUpperCase() + key.slice(1);
  }

  private formatSummaryLabel(key: string): string {
    const labelMap: Record<string, string> = {
      totalItems: 'Total Items',
      totalQuantity: 'Total Quantity',
      totalValue: 'Total Value',
      lowStockCount: 'Low Stock Count',
      outOfStockCount: 'Out of Stock Count',
      expiringSoonCount: 'Expiring Soon Count',
      totalTransactions: 'Total Transactions',
      totalQuantitySold: 'Total Quantity Sold',
      totalRevenue: 'Total Revenue',
      averageOrderValue: 'Average Order Value',
      totalBatches: 'Total Batches',
      expiredCount: 'Expired Count',
      totalOrders: 'Total Orders',
      totalQuantityOrdered: 'Total Quantity Ordered',
      totalQuantityReceived: 'Total Quantity Received',
      averageFulfillmentRate: 'Average Fulfillment Rate (%)',
    };
    return labelMap[key] || key.charAt(0).toUpperCase() + key.slice(1);
  }

  private formatCellValue(value: any): any {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      // Return numbers as-is for Excel formatting
      return value;
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value instanceof Date) return value.toLocaleDateString();
    return String(value);
  }
}
