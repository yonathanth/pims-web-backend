import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportFilters, ReportData, ReportType } from '../types/report.types';
import { TransactionType } from '../../transactions/dto/create-transaction.dto';

@Injectable()
export class ReportGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate inventory report preview (first 100 records)
   */
  async generateInventoryReportPreview(
    filters: ReportFilters,
  ): Promise<ReportData> {
    try {
      console.log(
        'Generate Inventory Report Preview - Starting with filters:',
        filters,
      );
      const whereClause = this.buildInventoryWhereClause(filters);
      console.log(
        'Generate Inventory Report Preview - Where clause:',
        whereClause,
      );

      const data = await this.prisma.batch.findMany({
        where: whereClause,
        include: {
          drug: {
            include: {
              category: true,
            },
          },
          supplier: true,
          locationBatches: {
            include: {
              location: true,
            },
          },
        },
        orderBy: {
          drug: {
            tradeName: 'asc',
          },
        },
        take: 100, // Limit to first 100 records for preview
      });

      console.log(
        'Generate Inventory Report Preview - Raw data count:',
        data.length,
      );

      const reportData = data.map((batch) => ({
        id: batch.id,
        drugName: batch.drug.tradeName
          ? `${batch.drug.genericName} (${batch.drug.tradeName})`
          : batch.drug.genericName,
        sku: batch.drug.sku,
        batchNumber:
          batch.batchNumber ?? `B${batch.id.toString().padStart(6, '0')}`,
        expiryDate: batch.expiryDate.toISOString().split('T')[0],
        quantity: batch.currentQty,
        location:
          batch.locationBatches.map((lb) => lb.location.name).join(', ') ||
          'No Location',
        unitPrice: batch.unitPrice,
        lastRestock: batch.purchaseDate.toISOString().split('T')[0],
        supplier: batch.supplier.name,
        category: batch.drug.category.name,
        status: this.getInventoryStatus(
          batch.currentQty,
          batch.lowStockThreshold,
        ),
      }));

      // Get total count for summary
      const totalCount = await this.prisma.batch.count({
        where: whereClause,
      });

      const summary = this.calculateInventorySummaryWithTotal(
        reportData,
        totalCount,
      );

      console.log('Generate Inventory Report Preview - Final report data:', {
        reportDataLength: reportData.length,
        totalCount,
        summaryKeys: Object.keys(summary),
      });

      return {
        reportType: 'Inventory Report',
        filters,
        data: reportData,
        headers: [
          { key: 'drugName', header: 'Drug Name' },
          { key: 'sku', header: 'SKU' },
          { key: 'batchNumber', header: 'Batch Number' },
          { key: 'expiryDate', header: 'Expiry Date' },
          { key: 'quantity', header: 'Quantity' },
          { key: 'location', header: 'Location' },
          { key: 'unitPrice', header: 'Unit Price' },
          { key: 'lastRestock', header: 'Purchase Date' },
          { key: 'supplier', header: 'Supplier' },
          { key: 'category', header: 'Category' },
        ],
        summary,
      };
    } catch (error) {
      console.error(
        'Generate Inventory Report Preview - Error occurred:',
        error,
      );
      throw error;
    }
  }

  /**
   * Generate inventory report
   */
  async generateInventoryReport(filters: ReportFilters): Promise<ReportData> {
    try {
      console.log(
        'Generate Inventory Report - Starting with filters:',
        filters,
      );
      const whereClause = this.buildInventoryWhereClause(filters);
      console.log('Generate Inventory Report - Where clause:', whereClause);

      const data = await this.prisma.batch.findMany({
        where: whereClause,
        include: {
          drug: {
            include: {
              category: true,
            },
          },
          supplier: true,
          locationBatches: {
            include: {
              location: true,
            },
          },
        },
        orderBy: {
          drug: {
            tradeName: 'asc',
          },
        },
      });

      console.log('Generate Inventory Report - Raw data count:', data.length);

      const reportData = data.map((batch) => ({
        id: batch.id,
        drugName: batch.drug.tradeName ?? batch.drug.genericName,
        sku: batch.drug.sku,
        batchNumber:
          batch.batchNumber ?? `B${batch.id.toString().padStart(6, '0')}`,
        expiryDate: batch.expiryDate.toISOString().split('T')[0],
        quantity: batch.currentQty,
        location:
          batch.locationBatches.map((lb) => lb.location.name).join(', ') ||
          'No Location',
        unitPrice: batch.unitPrice,
        lastRestock: batch.purchaseDate.toISOString().split('T')[0],
        supplier: batch.supplier.name,
        category: batch.drug.category.name,
        status: this.getInventoryStatus(
          batch.currentQty,
          batch.lowStockThreshold,
        ),
      }));

      const summary = this.calculateInventorySummary(reportData);

      console.log('Generate Inventory Report - Final report data:', {
        reportDataLength: reportData.length,
        summaryKeys: Object.keys(summary),
      });

      return {
        reportType: 'Inventory Report',
        filters,
        data: reportData,
        headers: [
          { key: 'drugName', header: 'Drug Name' },
          { key: 'sku', header: 'SKU' },
          { key: 'batchNumber', header: 'Batch Number' },
          { key: 'expiryDate', header: 'Expiry Date' },
          { key: 'quantity', header: 'Quantity' },
          { key: 'location', header: 'Location' },
          { key: 'unitPrice', header: 'Unit Price' },
          { key: 'lastRestock', header: 'Purchase Date' },
          { key: 'supplier', header: 'Supplier' },
          { key: 'category', header: 'Category' },
        ],
        summary,
      };
    } catch (error) {
      console.error('Generate Inventory Report - Error occurred:', error);
      throw error;
    }
  }

  /**
   * Generate sales report preview (first 100 records)
   */
  async generateSalesReportPreview(
    filters: ReportFilters,
  ): Promise<ReportData> {
    try {
      console.log(
        'Generate Sales Report Preview - Starting with filters:',
        filters,
      );
      const whereClause = this.buildSalesWhereClause(filters);
      console.log('Generate Sales Report Preview - Where clause:', whereClause);

      const data = await this.prisma.transaction.findMany({
        where: whereClause,
        include: {
          batch: {
            include: {
              drug: {
                include: {
                  category: true,
                },
              },
            },
          },
          user: true,
        },
        orderBy: {
          transactionDate: 'desc',
        },
        take: 100, // Limit to first 100 records for preview
      });

      console.log(
        'Generate Sales Report Preview - Raw data count:',
        data.length,
      );

      const reportData = data.map((transaction) => ({
        id: transaction.id,
        transactionDate: transaction.transactionDate
          .toISOString()
          .split('T')[0],
        sku: transaction.batch.drug.sku,
        drugName: transaction.batch.drug.tradeName
          ? `${transaction.batch.drug.genericName} (${transaction.batch.drug.tradeName})`
          : transaction.batch.drug.genericName,
        quantitySold: transaction.quantity,
        unitPrice: transaction.batch.unitPrice,
        totalPrice: transaction.quantity * transaction.batch.unitPrice,
        user: transaction.user?.fullName || 'Unknown User',
        category: transaction.batch.drug.category.name,
        status: transaction.status || 'pending', // Add status with fallback
      }));

      // Get total count for summary
      const totalCount = await this.prisma.transaction.count({
        where: whereClause,
      });

      const summary = this.calculateSalesSummaryWithTotal(
        reportData,
        totalCount,
      );

      console.log('Generate Sales Report Preview - Final report data:', {
        reportDataLength: reportData.length,
        totalCount,
        summaryKeys: Object.keys(summary),
      });

      return {
        reportType: 'Sales Report (Preview - First 100)',
        filters,
        data: reportData,
        headers: [
          { key: 'transactionDate', header: 'Transaction Date' },
          { key: 'sku', header: 'SKU' },
          { key: 'drugName', header: 'Drug Name' },
          { key: 'quantitySold', header: 'Quantity Sold' },
          { key: 'unitPrice', header: 'Unit Price' },
          { key: 'totalPrice', header: 'Total Price' },
          { key: 'user', header: 'User' },
          { key: 'category', header: 'Category' },
          { key: 'status', header: 'Status' },
        ],
        summary,
      };
    } catch (error) {
      console.error('Generate Sales Report Preview - Error occurred:', error);
      throw error;
    }
  }

  /**
   * Generate sales report
   */
  async generateSalesReport(filters: ReportFilters): Promise<ReportData> {
    const whereClause = this.buildSalesWhereClause(filters);

    const data = await this.prisma.transaction.findMany({
      where: whereClause,
      include: {
        batch: {
          include: {
            drug: {
              include: {
                category: true,
              },
            },
          },
        },
        user: true,
      },
      orderBy: {
        transactionDate: 'desc',
      },
    });

    const reportData = data.map((transaction) => ({
      id: transaction.id,
      transactionDate: transaction.transactionDate.toISOString().split('T')[0],
      sku: transaction.batch.drug.sku,
      drugName: transaction.batch.drug.tradeName
        ? `${transaction.batch.drug.genericName} (${transaction.batch.drug.tradeName})`
        : transaction.batch.drug.genericName,
      quantitySold: transaction.quantity,
      unitPrice: transaction.batch.unitPrice,
      totalPrice: transaction.quantity * transaction.batch.unitPrice,
      user: transaction.user?.fullName || 'Unknown User',
      category: transaction.batch.drug.category.name,
      status: transaction.status || 'pending', // Add status with fallback
    }));

    const summary = this.calculateSalesSummary(reportData);

    return {
      reportType: 'Sales Report',
      filters,
      data: reportData,
      headers: [
        { key: 'transactionDate', header: 'Transaction Date' },
        { key: 'sku', header: 'SKU' },
        { key: 'drugName', header: 'Drug Name' },
        { key: 'quantitySold', header: 'Quantity Sold' },
        { key: 'unitPrice', header: 'Unit Price' },
        { key: 'totalPrice', header: 'Total Price' },
        { key: 'user', header: 'User' },
        { key: 'category', header: 'Category' },
        { key: 'status', header: 'Status' },
      ],
      summary,
    };
  }

  /**
   * Generate expiry report preview (first 100 records)
   */
  async generateExpiryReportPreview(
    filters: ReportFilters,
  ): Promise<ReportData> {
    try {
      const daysThreshold = filters.daysThreshold || 30;
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

      const whereClause = this.buildExpiryWhereClause(filters, thresholdDate);

      const data = await this.prisma.batch.findMany({
        where: whereClause,
        include: {
          drug: {
            include: {
              category: true,
            },
          },
          supplier: true,
          locationBatches: {
            include: {
              location: true,
            },
          },
        },
        orderBy: {
          expiryDate: 'asc',
        },
        take: 100, // Limit to first 100 records for preview
      });

      const reportData = data.map((batch) => {
        const daysUntilExpiry = Math.ceil(
          (batch.expiryDate.getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        );

        return {
          id: batch.id,
          sku: batch.drug.sku,
          drugName: batch.drug.tradeName
            ? `${batch.drug.genericName} (${batch.drug.tradeName})`
            : batch.drug.genericName,
          batchNumber:
          batch.batchNumber ?? `B${batch.id.toString().padStart(6, '0')}`,
          expiryDate: batch.expiryDate.toISOString().split('T')[0],
          quantityRemaining: batch.currentQty,
          daysUntilExpiry,
          location:
            batch.locationBatches.map((lb) => lb.location.name).join(', ') ||
            'No Location',
          supplier: batch.supplier.name,
          unitCost: batch.unitCost,
          totalValue: batch.currentQty * batch.unitCost,
          category: batch.drug.category.name,
        };
      });

      // Get total count for summary
      const totalCount = await this.prisma.batch.count({
        where: whereClause,
      });

      const summary = this.calculateExpirySummaryWithTotal(
        reportData,
        totalCount,
        daysThreshold,
      );

      return {
        reportType: 'Expiry Report',
        filters,
        data: reportData,
        headers: [
          { key: 'sku', header: 'SKU' },
          { key: 'drugName', header: 'Drug Name' },
          { key: 'batchNumber', header: 'Batch Number' },
          { key: 'expiryDate', header: 'Expiry Date' },
          { key: 'quantityRemaining', header: 'Quantity Remaining' },
          { key: 'daysUntilExpiry', header: 'Days Until Expiry' },
          { key: 'location', header: 'Location' },
          { key: 'supplier', header: 'Supplier' },
          { key: 'unitCost', header: 'Unit Cost' },
          { key: 'totalValue', header: 'Total Value' },
          { key: 'category', header: 'Category' },
        ],
        summary,
      };
    } catch (error) {
      console.error('Generate Expiry Report Preview - Error occurred:', error);
      throw error;
    }
  }

  /**
   * Generate expiry report
   */
  async generateExpiryReport(filters: ReportFilters): Promise<ReportData> {
    const daysThreshold = filters.daysThreshold || 30;
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    const whereClause = this.buildExpiryWhereClause(filters, thresholdDate);

    const data = await this.prisma.batch.findMany({
      where: whereClause,
      include: {
        drug: {
          include: {
            category: true,
          },
        },
        supplier: true,
        locationBatches: {
          include: {
            location: true,
          },
        },
      },
      orderBy: {
        expiryDate: 'asc',
      },
    });

    const reportData = data.map((batch) => {
      const daysUntilExpiry = Math.ceil(
        (batch.expiryDate.getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      );

      return {
        id: batch.id,
        sku: batch.drug.sku,
        drugName: batch.drug.tradeName
          ? `${batch.drug.genericName} (${batch.drug.tradeName})`
          : batch.drug.genericName,
        batchNumber:
          batch.batchNumber ?? `B${batch.id.toString().padStart(6, '0')}`,
        expiryDate: batch.expiryDate.toISOString().split('T')[0],
        quantityRemaining: batch.currentQty,
        daysUntilExpiry,
        location:
          batch.locationBatches.map((lb) => lb.location.name).join(', ') ||
          'No Location',
        supplier: batch.supplier.name,
        unitCost: batch.unitCost,
        totalValue: batch.currentQty * batch.unitCost,
        category: batch.drug.category.name,
      };
    });

    const summary = this.calculateExpirySummary(reportData, daysThreshold);

    return {
      reportType: 'Expiry Report',
      filters,
      data: reportData,
      headers: [
        { key: 'sku', header: 'SKU' },
        { key: 'drugName', header: 'Drug Name' },
        { key: 'batchNumber', header: 'Batch Number' },
        { key: 'expiryDate', header: 'Expiry Date' },
        { key: 'quantityRemaining', header: 'Quantity Remaining' },
        { key: 'daysUntilExpiry', header: 'Days Until Expiry' },
        { key: 'location', header: 'Location' },
        { key: 'supplier', header: 'Supplier' },
        { key: 'unitCost', header: 'Unit Cost' },
        { key: 'totalValue', header: 'Total Value' },
        { key: 'category', header: 'Category' },
      ],
      summary,
    };
  }

  /**
   * Generate purchase report preview (first 100 records)
   */
  async generatePurchaseReportPreview(
    filters: ReportFilters,
  ): Promise<ReportData> {
    try {
      console.log(
        'Generate Purchase Report Preview - Starting with filters:',
        filters,
      );
      const whereClause = this.buildPurchaseWhereClause(filters);
      console.log(
        'Generate Purchase Report Preview - Where clause:',
        whereClause,
      );

      const data = await this.prisma.purchaseOrderItem.findMany({
        where: whereClause,
        include: {
          purchaseOrder: {
            include: {
              supplier: true,
            },
          },
          drug: {
            include: {
              category: true,
            },
          },
          batch: true,
        },
        orderBy: {
          purchaseOrder: {
            createdDate: 'desc',
          },
        },
        take: 100, // Limit to first 100 records for preview
      });

      console.log(
        'Generate Purchase Report Preview - Raw data count:',
        data.length,
      );

      const reportData = data.map((item) => {
        const fulfillmentRate =
          item.quantityOrdered > 0
            ? (item.quantityReceived / item.quantityOrdered) * 100
            : 0;

        return {
          id: item.id,
          orderId: item.purchaseOrder.id,
          orderDate: item.purchaseOrder.createdDate.toISOString().split('T')[0],
          expectedDate:
            item.purchaseOrder.expectedDate?.toISOString().split('T')[0] ||
            'N/A',
          supplier: item.purchaseOrder.supplier.name,
          drugName: item.drug.tradeName
            ? `${item.drug.genericName} (${item.drug.tradeName})`
            : item.drug.genericName,
          sku: item.drug.sku,
          category: item.drug.category.name,
          quantityOrdered: item.quantityOrdered,
          quantityReceived: item.quantityReceived,
          unitCost: item.unitCost,
          totalCost: item.quantityOrdered * item.unitCost,
          status: item.status,
          fulfillmentRate: Math.round(fulfillmentRate * 100) / 100,
        };
      });

      // Get total count for summary
      const totalCount = await this.prisma.purchaseOrderItem.count({
        where: whereClause,
      });

      const summary = this.calculatePurchaseSummaryWithTotal(
        reportData,
        totalCount,
      );

      console.log('Generate Purchase Report Preview - Final report data:', {
        reportDataLength: reportData.length,
        totalCount,
        summaryKeys: Object.keys(summary),
      });

      return {
        reportType: 'Purchase Report (Preview - First 100)',
        filters,
        data: reportData,
        headers: [
          { key: 'orderId', header: 'Order ID' },
          { key: 'orderDate', header: 'Order Date' },
          { key: 'expectedDate', header: 'Expected Date' },
          { key: 'supplier', header: 'Supplier' },
          { key: 'drugName', header: 'Drug Name' },
          { key: 'sku', header: 'SKU' },
          { key: 'category', header: 'Category' },
          { key: 'quantityOrdered', header: 'Quantity Ordered' },
          { key: 'quantityReceived', header: 'Quantity Received' },
          { key: 'unitCost', header: 'Unit Cost' },
          { key: 'totalCost', header: 'Total Cost' },
          { key: 'status', header: 'Status' },
          { key: 'fulfillmentRate', header: 'Fulfillment Rate (%)' },
        ],
        summary,
      };
    } catch (error) {
      console.error(
        'Generate Purchase Report Preview - Error occurred:',
        error,
      );
      throw error;
    }
  }

  /**
   * Generate purchase report
   */
  async generatePurchaseReport(filters: ReportFilters): Promise<ReportData> {
    const whereClause = this.buildPurchaseWhereClause(filters);

    const data = await this.prisma.purchaseOrderItem.findMany({
      where: whereClause,
      include: {
        purchaseOrder: {
          include: {
            supplier: true,
          },
        },
        drug: {
          include: {
            category: true,
          },
        },
        batch: true,
      },
      orderBy: {
        purchaseOrder: {
          createdDate: 'desc',
        },
      },
    });

    const reportData = data.map((item) => {
      const fulfillmentRate =
        item.quantityOrdered > 0
          ? (item.quantityReceived / item.quantityOrdered) * 100
          : 0;

      return {
        id: item.id,
        orderId: item.purchaseOrder.id,
        orderDate: item.purchaseOrder.createdDate.toISOString().split('T')[0],
        expectedDate:
          item.purchaseOrder.expectedDate?.toISOString().split('T')[0] || 'N/A',
        supplier: item.purchaseOrder.supplier.name,
        drugName: item.drug.genericName,
        sku: item.drug.sku,
        category: item.drug.category.name,
        quantityOrdered: item.quantityOrdered,
        quantityReceived: item.quantityReceived,
        unitCost: item.unitCost,
        totalCost: item.quantityOrdered * item.unitCost,
        status: item.status,
        fulfillmentRate: Math.round(fulfillmentRate * 100) / 100,
      };
    });

    const summary = this.calculatePurchaseSummary(reportData);

    return {
      reportType: 'Purchase Report',
      filters,
      data: reportData,
      headers: [
        { key: 'orderId', header: 'Order ID' },
        { key: 'orderDate', header: 'Order Date' },
        { key: 'expectedDate', header: 'Expected Date' },
        { key: 'supplier', header: 'Supplier' },
        { key: 'drugName', header: 'Drug Name' },
        { key: 'sku', header: 'SKU' },
        { key: 'category', header: 'Category' },
        { key: 'quantityOrdered', header: 'Quantity Ordered' },
        { key: 'quantityReceived', header: 'Quantity Received' },
        { key: 'unitCost', header: 'Unit Cost' },
        { key: 'totalCost', header: 'Total Cost' },
        { key: 'status', header: 'Status' },
        { key: 'fulfillmentRate', header: 'Fulfillment Rate (%)' },
      ],
      summary,
    };
  }

  // Helper methods for building where clauses
  private buildInventoryWhereClause(filters: ReportFilters) {
    const where: any = {};

    if (filters.fromDate || filters.toDate) {
      where.purchaseDate = {};
      if (filters.fromDate) {
        where.purchaseDate.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        where.purchaseDate.lte = new Date(filters.toDate);
      }
    }

    if (filters.category) {
      where.drug = {
        category: {
          name: filters.category,
        },
      };
    }

    if (filters.status) {
      switch (filters.status) {
        case 'low_stock':
          where.currentQty = {
            lte: this.prisma.batch.fields.lowStockThreshold,
          };
          break;
        case 'out_of_stock':
          where.currentQty = 0;
          break;
        case 'current_stock':
        default:
          // No additional filter for current stock
          break;
      }
    }

    return where;
  }

  private buildSalesWhereClause(filters: ReportFilters) {
    const where: any = {
      transactionType: TransactionType.SALE, // Use enum value 'sale'
    };

    // Status filtering
    if (filters.status) {
      switch (filters.status) {
        case 'completed':
          where.status = 'completed'; // Use lowercase to match database
          break;
        case 'pending':
          where.status = 'pending'; // Use lowercase to match database
          break;
        case 'declined':
          where.status = 'declined'; // Use lowercase to match database
          break;
        case 'all_status':
        default:
          // No status filter - show all except declined by default
          where.status = {
            not: 'declined', // Use lowercase to match database
          };
          break;
      }
    } else {
      // Default: exclude declined transactions
      where.status = {
        not: 'declined', // Use lowercase to match database
      };
    }

    if (filters.fromDate || filters.toDate) {
      where.transactionDate = {};
      if (filters.fromDate) {
        where.transactionDate.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        where.transactionDate.lte = new Date(filters.toDate);
      }
    }

    if (filters.category) {
      where.batch = {
        drug: {
          category: {
            name: filters.category,
          },
        },
      };
    }

    if (filters.drugId) {
      where.batch = {
        ...where.batch,
        drugId: filters.drugId,
      };
    }

    return where;
  }

  private buildExpiryWhereClause(filters: ReportFilters, thresholdDate: Date) {
    const where: any = {};

    // Build expiry date filter
    const expiryDateFilter: any = {};

    // Always include the threshold filter (batches expiring within X days)
    expiryDateFilter.lte = thresholdDate;

    // Add date range filtering for expiry dates
    if (filters.fromDate || filters.toDate) {
      if (filters.fromDate) {
        expiryDateFilter.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        // Use the more restrictive of threshold date or user-specified end date
        const userEndDate = new Date(filters.toDate);
        expiryDateFilter.lte =
          userEndDate < thresholdDate ? userEndDate : thresholdDate;
      }
    }

    where.expiryDate = expiryDateFilter;

    if (filters.category) {
      where.drug = {
        category: {
          name: filters.category,
        },
      };
    }

    if (filters.supplier) {
      where.supplier = {
        name: filters.supplier,
      };
    }

    return where;
  }

  private buildPurchaseWhereClause(filters: ReportFilters) {
    const where: any = {};

    if (filters.fromDate || filters.toDate) {
      where.purchaseOrder = {
        createdDate: {},
      };
      if (filters.fromDate) {
        where.purchaseOrder.createdDate.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        where.purchaseOrder.createdDate.lte = new Date(filters.toDate);
      }
    }

    if (filters.category) {
      where.drug = {
        category: {
          name: filters.category,
        },
      };
    }

    if (filters.supplier) {
      where.purchaseOrder = {
        ...where.purchaseOrder,
        supplier: {
          name: filters.supplier,
        },
      };
    }

    // Handle status filtering for purchase reports
    const statusValue = (filters as any).orderStatus || filters.status;
    if (statusValue && statusValue !== 'all') {
      where.status = statusValue;
    }

    return where;
  }

  // Helper methods for calculating summaries
  private calculateInventorySummaryWithTotal(data: any[], totalCount: number) {
    const totalItems = data.length;
    const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = data.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const lowStockCount = data.filter(
      (item) => item.status === 'Low Stock',
    ).length;
    const outOfStockCount = data.filter(
      (item) => item.status === 'Out of Stock',
    ).length;
    const expiringSoonCount = data.filter((item) => {
      const expiryDate = new Date(item.expiryDate);
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
      );
      return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
    }).length;

    const expiredCount = data.filter((item) => {
      const expiryDate = new Date(item.expiryDate);
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
      );
      return daysUntilExpiry < 0;
    }).length;

    return {
      totalRecords: totalCount, // Total records in database
      totalItems,
      totalQuantity,
      totalValue: Math.round(totalValue * 100) / 100,
      lowStockCount,
      outOfStockCount,
      expiringSoonCount,
      expiredCount,
    };
  }

  private calculateInventorySummary(data: any[]) {
    const totalItems = data.length;
    const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = data.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const lowStockCount = data.filter(
      (item) => item.status === 'Low Stock',
    ).length;
    const outOfStockCount = data.filter(
      (item) => item.status === 'Out of Stock',
    ).length;
    const expiringSoonCount = data.filter((item) => {
      const expiryDate = new Date(item.expiryDate);
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
      );
      return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
    }).length;

    const expiredCount = data.filter((item) => {
      const expiryDate = new Date(item.expiryDate);
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
      );
      return daysUntilExpiry < 0;
    }).length;

    return {
      totalRecords: totalItems,
      totalItems,
      totalQuantity,
      totalValue: Math.round(totalValue * 100) / 100,
      lowStockCount,
      outOfStockCount,
      expiringSoonCount,
      expiredCount,
    };
  }

  private calculateSalesSummaryWithTotal(data: any[], totalCount: number) {
    const totalTransactions = data.length;
    const totalQuantitySold = data.reduce(
      (sum, item) => sum + item.quantitySold,
      0,
    );
    const totalRevenue = data.reduce((sum, item) => sum + item.totalPrice, 0);
    const averageOrderValue =
      totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    return {
      totalRecords: totalCount, // Total records in database
      totalTransactions,
      totalQuantitySold,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    };
  }

  private calculateSalesSummary(data: any[]) {
    const totalTransactions = data.length;
    const totalQuantitySold = data.reduce(
      (sum, item) => sum + item.quantitySold,
      0,
    );
    const totalRevenue = data.reduce((sum, item) => sum + item.totalPrice, 0);
    const averageOrderValue =
      totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    return {
      totalRecords: totalTransactions,
      totalTransactions,
      totalQuantitySold,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    };
  }

  private calculateExpirySummaryWithTotal(
    data: any[],
    totalCount: number,
    daysThreshold: number,
  ) {
    const totalBatches = data.length;
    const totalQuantity = data.reduce(
      (sum, item) => sum + item.quantityRemaining,
      0,
    );
    const totalValue = data.reduce((sum, item) => sum + item.totalValue, 0);
    const expiredCount = data.filter((item) => item.daysUntilExpiry < 0).length;
    const expiringSoonCount = data.filter(
      (item) =>
        item.daysUntilExpiry <= daysThreshold && item.daysUntilExpiry >= 0,
    ).length;

    return {
      totalRecords: totalCount, // Total records in database
      totalBatches,
      totalQuantity,
      totalValue: Math.round(totalValue * 100) / 100,
      expiredCount,
      expiringSoonCount,
      daysThreshold,
    };
  }

  private calculateExpirySummary(data: any[], daysThreshold: number) {
    const totalBatches = data.length;
    const totalQuantity = data.reduce(
      (sum, item) => sum + item.quantityRemaining,
      0,
    );
    const totalValue = data.reduce((sum, item) => sum + item.totalValue, 0);
    const expiredCount = data.filter((item) => item.daysUntilExpiry < 0).length;
    const expiringSoonCount = data.filter(
      (item) =>
        item.daysUntilExpiry <= daysThreshold && item.daysUntilExpiry >= 0,
    ).length;

    return {
      totalRecords: totalBatches,
      totalBatches,
      totalQuantity,
      totalValue: Math.round(totalValue * 100) / 100,
      expiredCount,
      expiringSoonCount,
      daysThreshold,
    };
  }

  private calculatePurchaseSummaryWithTotal(data: any[], totalCount: number) {
    const totalOrders = data.length;
    const totalItems = data.reduce(
      (sum, item) => sum + item.quantityOrdered,
      0,
    );
    const totalQuantityOrdered = data.reduce(
      (sum, item) => sum + item.quantityOrdered,
      0,
    );
    const totalQuantityReceived = data.reduce(
      (sum, item) => sum + item.quantityReceived,
      0,
    );
    const totalValue = data.reduce((sum, item) => sum + item.totalCost, 0);
    const averageFulfillmentRate =
      totalOrders > 0
        ? data.reduce((sum, item) => sum + item.fulfillmentRate, 0) /
          totalOrders
        : 0;

    const statusCounts = data.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalRecords: totalCount, // Total records in database
      totalOrders,
      totalItems,
      totalQuantityOrdered,
      totalQuantityReceived,
      totalValue: Math.round(totalValue * 100) / 100,
      averageFulfillmentRate: Math.round(averageFulfillmentRate * 100) / 100,
      statusCounts,
    };
  }

  private calculatePurchaseSummary(data: any[]) {
    const totalOrders = data.length;
    const totalItems = data.reduce(
      (sum, item) => sum + item.quantityOrdered,
      0,
    );
    const totalQuantityOrdered = data.reduce(
      (sum, item) => sum + item.quantityOrdered,
      0,
    );
    const totalQuantityReceived = data.reduce(
      (sum, item) => sum + item.quantityReceived,
      0,
    );
    const totalValue = data.reduce((sum, item) => sum + item.totalCost, 0);
    const averageFulfillmentRate =
      totalOrders > 0
        ? data.reduce((sum, item) => sum + item.fulfillmentRate, 0) /
          totalOrders
        : 0;

    const statusCounts = data.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalRecords: totalOrders,
      totalOrders,
      totalItems,
      totalQuantityOrdered,
      totalQuantityReceived,
      totalValue: Math.round(totalValue * 100) / 100,
      averageFulfillmentRate: Math.round(averageFulfillmentRate * 100) / 100,
      statusCounts,
    };
  }

  private getInventoryStatus(
    currentQty: number,
    lowStockThreshold: number,
  ): string {
    if (currentQty === 0) return 'Out of Stock';
    if (currentQty <= lowStockThreshold) return 'Low Stock';
    return 'Current Stock';
  }
}
