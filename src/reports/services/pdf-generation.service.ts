import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ReportData } from '../types/report.types';

@Injectable()
export class PdfGenerationService {
  /**
   * Generate PDF from report data
   */
  async generatePDF(reportData: ReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margin: 50,
        });

        const buffers: Buffer[] = [];

        doc.on('data', (buffer) => buffers.push(buffer));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Add pharmacy name
        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .text('Liyuwork Pharmacy - Central Ethiopia, Hadiya, Hossana,', { align: 'center' });

        doc.moveDown(0.5);

        // Add title
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text(reportData.reportType, { align: 'center' });

        doc.moveDown(0.5);

        // Add generation info
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`Generated: ${new Date().toLocaleString()}`, {
            align: 'center',
          });

        doc.moveDown(1);

        // Add filters
        this.addFiltersSection(doc, reportData.filters);

        doc.moveDown(1);

        // Add summary
        this.addSummarySection(doc, reportData.summary);

        doc.moveDown(1);

        // Add data table
        this.addDataTable(doc, reportData);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private addFiltersSection(doc: any, filters: any) {
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Filters Applied:', { underline: true });

    doc.moveDown(0.3);

    doc.fontSize(10).font('Helvetica');

    const filterEntries = Object.entries(filters).filter(([_, value]) => value);

    if (filterEntries.length === 0) {
      doc.text('No filters applied');
    } else {
      filterEntries.forEach(([key, value]) => {
        const label = this.formatFilterLabel(key);
        doc.text(`${label}: ${value}`);
      });
    }
  }

  private addSummarySection(doc: any, summary: any) {
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Summary:', { underline: true });

    doc.moveDown(0.3);

    doc.fontSize(10).font('Helvetica');

    Object.entries(summary).forEach(([key, value]) => {
      const label = this.formatSummaryLabel(key);
      doc.text(`${label}: ${value}`);
    });
  }

  private addDataTable(doc: any, reportData: ReportData) {
    const { headers, data } = reportData;

    if (data.length === 0) {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('No data available for the selected filters.');
      return;
    }

    // Calculate column widths based on content
    const pageWidth = doc.page.width - 100; // Account for margins
    const columnWidths = this.calculateColumnWidths(headers, data, pageWidth);

    const rowHeight = 20;
    const headerHeight = 25;

    // Table header
    this.addTableHeader(doc, headers, columnWidths, headerHeight);

    // Table data
    doc.font('Helvetica').fontSize(8);

    data.forEach((row, index) => {
      const currentY = doc.y;

      // Alternate row colors
      if (index % 2 === 0) {
        doc
          .fillColor('#F8F9FA')
          .rect(50, currentY, pageWidth, rowHeight)
          .fill();
      }

      let x = 50;
      headers.forEach((header, colIndex) => {
        const value = this.formatCellValue(row[header.key]);
        const cellWidth = columnWidths[colIndex];

        // Ensure text color is black for data cells
        doc
          .fillColor('#000000')
          .font('Helvetica')
          .fontSize(8)
          .text(value, x + 5, currentY + 5, {
            width: cellWidth - 10,
            align: 'left',
            height: rowHeight - 10,
            ellipsis: true,
          });

        x += cellWidth;
      });

      doc.y = currentY + rowHeight;

      // Check if we need a new page
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
        // Redraw header on new page
        this.addTableHeader(doc, headers, columnWidths, headerHeight);
      }
    });
  }

  private calculateColumnWidths(
    headers: any[],
    data: any[],
    pageWidth: number,
  ): number[] {
    const columnWidths: number[] = [];
    const minWidth = 60;
    const maxWidth = 150;

    headers.forEach((header, index) => {
      // Calculate width based on header text length
      let maxTextLength = header.header.length;

      // Check data content for this column
      data.forEach((row) => {
        const value = this.formatCellValue(row[header.key]);
        maxTextLength = Math.max(maxTextLength, value.length);
      });

      // Calculate width (roughly 6 pixels per character + padding)
      let width = Math.max(
        minWidth,
        Math.min(maxWidth, maxTextLength * 6 + 20),
      );
      columnWidths.push(width);
    });

    // Adjust widths to fit page width
    const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    if (totalWidth > pageWidth) {
      const scaleFactor = pageWidth / totalWidth;
      columnWidths.forEach((width, index) => {
        columnWidths[index] = Math.max(minWidth, width * scaleFactor);
      });
    }

    return columnWidths;
  }

  private addTableHeader(
    doc: any,
    headers: any[],
    columnWidths: number[],
    headerHeight: number,
  ) {
    const currentY = doc.y;

    let x = 50;
    headers.forEach((header, index) => {
      const cellWidth = columnWidths[index];

      // Draw header background
      doc
        .fillColor('#E0E0E0')
        .rect(x, currentY, cellWidth, headerHeight)
        .fill();

      // Draw header text
      doc
        .fillColor('#000000')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(header.header, x + 5, currentY + 8, {
          width: cellWidth - 10,
          align: 'left',
          height: headerHeight - 10,
        });

      x += cellWidth;
    });

    doc.y = currentY + headerHeight + 5;
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

  private formatCellValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
      // Format numbers with appropriate precision
      if (value % 1 !== 0) {
        return value.toFixed(2);
      }
      return value.toString();
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value instanceof Date) return value.toLocaleDateString();

    // Truncate long strings to prevent layout issues
    const stringValue = String(value);
    return stringValue.length > 30
      ? stringValue.substring(0, 27) + '...'
      : stringValue;
  }
}
