import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApproveSaleDto,
  DeclineSaleDto,
  SalesQueryDto,
  CreateSaleDto,
  ProductSalesQueryDto,
  PeriodType,
} from './dto';
import { TransactionType } from '../transactions/dto/create-transaction.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getPendingSales() {
    try {
      const pendingSales = await this.prisma.transaction.findMany({
        where: {
          transactionType: TransactionType.SALE,
          status: 'pending',
        },
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
          createdAt: 'desc',
        },
      });

      return pendingSales.map((transaction) => ({
        id: transaction.id,
        saleId: transaction.saleId ?? undefined,
        drugName: transaction.batch.drug.tradeName
          ? `${transaction.batch.drug.genericName} (${transaction.batch.drug.tradeName})`
          : transaction.batch.drug.genericName,
        sku: transaction.batch.drug.sku,
        category: transaction.batch.drug.category.name,
        quantity: transaction.quantity,
        unitPrice: transaction.unitPrice ?? transaction.batch.unitPrice,
        totalPrice: transaction.quantity * (transaction.unitPrice ?? transaction.batch.unitPrice),
        customerName:
          transaction.user?.fullName ||
          transaction.user?.username ||
          'Unknown Customer',
        customerId: transaction.userId,
        createdAt: transaction.createdAt,
        notes: transaction.notes,
        batchId: transaction.batchId,
        batchNumber:
          transaction.batch.batchNumber ??
          `B${transaction.batch.id.toString().padStart(6, '0')}`,
        expiryDate: transaction.batch.expiryDate,
        currentStock: transaction.batch.currentQty,
      }));
    } catch (error) {
      console.error('Error getting pending sales:', error);
      throw error;
    }
  }

  async getSales(query: SalesQueryDto) {
    try {
      const { page = 1, limit = 10, status = 'all', search } = query;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        transactionType: TransactionType.SALE,
      };

      if (status !== 'all') {
        where.status = status;
      }

      if (search) {
        where.OR = [
          {
            batch: {
              drug: {
                genericName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            user: {
              fullName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
          {
            user: {
              username: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        ];
      }

      const [transactions, total] = await Promise.all([
        this.prisma.transaction.findMany({
          where,
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
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        this.prisma.transaction.count({ where }),
      ]);

      const sales = transactions.map((transaction) => ({
        id: transaction.id,
        drugName: transaction.batch.drug.tradeName
          ? `${transaction.batch.drug.genericName} (${transaction.batch.drug.tradeName})`
          : transaction.batch.drug.genericName,
        sku: transaction.batch.drug.sku,
        category: transaction.batch.drug.category.name,
        quantity: transaction.quantity,
        unitPrice: transaction.unitPrice ?? transaction.batch.unitPrice,
        totalPrice: transaction.quantity * (transaction.unitPrice ?? transaction.batch.unitPrice),
        customerName:
          transaction.user?.fullName ||
          transaction.user?.username ||
          'Unknown Customer',
        customerId: transaction.userId,
        status: transaction.status,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        notes: transaction.notes,
        batchId: transaction.batchId,
        batchNumber:
          transaction.batch.batchNumber ??
          `B${transaction.batch.id.toString().padStart(6, '0')}`,
        expiryDate: transaction.batch.expiryDate,
      }));

      return {
        sales,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error getting sales:', error);
      throw error;
    }
  }

  /**
   * Create a grouped sale (Sale header + multiple Transaction rows).
   * Uses userId as the seller who created the sale group.
   * Note: This is implemented without a long-lived DB transaction to avoid
   * interactive transaction timeouts in constrained environments.
   */
  async createGroupedSale(dto: CreateSaleDto, userId: number) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Sale must contain at least one item');
    }

    if (!userId) {
      throw new BadRequestException(
        'User information is required to create a sale',
      );
    }

    // First create the sale header
    const sale = await this.prisma.sale.create({
      data: {
        status: 'pending',
        notes: dto.notes,
      },
    });

    // Then process each line item individually
    // Only validate availability - don't deduct inventory until approval
    for (const item of dto.items) {
      const batch = await this.prisma.batch.findUnique({
        where: { id: item.batchId },
      });

      if (!batch) {
        throw new NotFoundException(`Batch with ID ${item.batchId} not found`);
      }

      // Validate sufficient quantity available (but don't deduct yet)
      if (batch.currentQty < item.quantity) {
        throw new BadRequestException(
          `Insufficient quantity for batch ${item.batchId}. Available: ${batch.currentQty}, Requested: ${item.quantity}`,
        );
      }

      // Create transaction record without deducting inventory
      await this.prisma.transaction.create({
        data: {
          batchId: item.batchId,
          transactionType: TransactionType.SALE,
          quantity: item.quantity,
          unitPrice: batch.unitPrice,
          userId,
          notes: item.lineNotes ?? dto.notes,
          status: 'pending',
          saleId: sale.id,
        },
      });
    }

    // Audit log for sale creation
    this.auditLogService.logAsync({
      action: 'CREATE',
      entityName: 'Sale',
      entityId: sale.id,
      userId,
      changeSummary: `Created sale with ${dto.items.length} items`,
    });

    return sale;
  }

  async approveSale(id: number, approveSaleDto: ApproveSaleDto) {
    try {
      // Check if transaction exists and is pending
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          id,
          transactionType: TransactionType.SALE,
          status: 'pending',
        },
        include: {
          batch: true,
        },
      });

      if (!transaction) {
        throw new NotFoundException('Pending sale not found');
      }

      // Check if there's sufficient quantity available
      if (transaction.batch.currentQty < transaction.quantity) {
        throw new BadRequestException(
          `Insufficient quantity. Available: ${transaction.batch.currentQty}, Requested: ${transaction.quantity}`,
        );
      }

      // Deduct inventory and update transaction status in a transaction
      const updatedTransaction = await this.prisma.$transaction(async (tx) => {
        // Deduct inventory
        const updatedBatch = await tx.batch.update({
          where: { id: transaction.batchId },
          data: { currentQty: { decrement: transaction.quantity } },
        });

        if (updatedBatch.currentQty < 0) {
          throw new BadRequestException(
            'Insufficient batch quantity for this transaction',
          );
        }

        // Update transaction status
        return await tx.transaction.update({
        where: { id },
        data: {
          status: 'approved',
          notes: approveSaleDto.notes || transaction.notes,
          updatedAt: new Date(),
        },
      });
      });

      // Evaluate stock notifications after inventory deduction
      await this.notificationsService.evaluateBatchStock(transaction.batchId);

      return {
        message: 'Sale approved successfully',
        transaction: updatedTransaction,
      };
    } catch (error) {
      console.error('Error approving sale:', error);
      throw error;
    }
  }

  async declineSale(id: number, declineSaleDto: DeclineSaleDto) {
    try {
      // Check if transaction exists and is pending
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          id,
          transactionType: TransactionType.SALE,
          status: 'pending',
        },
      });

      if (!transaction) {
        throw new NotFoundException('Pending sale not found');
      }

      // Update transaction status with decline reason
      const updatedTransaction = await this.prisma.transaction.update({
        where: { id },
        data: {
          status: 'declined',
          notes: `Declined: ${declineSaleDto.reason}`,
          updatedAt: new Date(),
        },
      });

      return {
        message: 'Sale declined successfully',
        transaction: updatedTransaction,
      };
    } catch (error) {
      console.error('Error declining sale:', error);
      throw error;
    }
  }

  /**
   * Approve all pending transactions belonging to a given Sale in one go.
   */
  async approveSaleGroup(
    saleId: number,
    approveSaleDto: ApproveSaleDto,
    userId: number,
  ) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        transactions: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale group not found');
    }

    if (sale.status !== 'pending') {
      throw new BadRequestException(
        `Sale group is not pending. Current status: ${sale.status}`,
      );
    }

    const nonPending = sale.transactions.filter(
      (t) => t.status && t.status !== 'pending',
    );

    if (nonPending.length > 0) {
      throw new BadRequestException(
        'Cannot approve sale group because some line items are not pending',
      );
    }

    const notesToApply = approveSaleDto.notes;

    const updatedSale = await this.prisma.$transaction(async (tx) => {
      // First, validate all transactions have sufficient inventory
      for (const transaction of sale.transactions) {
        const batch = await tx.batch.findUnique({
          where: { id: transaction.batchId },
        });

        if (!batch) {
          throw new NotFoundException(
            `Batch with ID ${transaction.batchId} not found`,
          );
        }

        if (batch.currentQty < transaction.quantity) {
          throw new BadRequestException(
            `Insufficient quantity for batch ${transaction.batchId}. Available: ${batch.currentQty}, Requested: ${transaction.quantity}`,
          );
        }
      }

      // Deduct inventory and update all transactions to approved
      for (const transaction of sale.transactions) {
        // Deduct inventory
        const updatedBatch = await tx.batch.update({
          where: { id: transaction.batchId },
          data: { currentQty: { decrement: transaction.quantity } },
        });

        if (updatedBatch.currentQty < 0) {
          throw new BadRequestException(
            `Insufficient batch quantity for transaction ${transaction.id}`,
          );
        }

        // Update transaction status
        await tx.transaction.update({
          where: { id: transaction.id },
        data: {
          status: 'approved',
          ...(notesToApply && { notes: notesToApply }),
          updatedAt: new Date(),
        },
      });
      }

      // Update sale header
      return tx.sale.update({
        where: { id: saleId },
        data: {
          status: 'approved',
          notes: notesToApply ?? sale.notes,
          updatedAt: new Date(),
        },
      });
    });

    // Evaluate stock notifications for all batches after inventory deduction
    const batchIds = new Set(sale.transactions.map((t) => t.batchId));
    for (const batchId of batchIds) {
      await this.notificationsService.evaluateBatchStock(batchId);
    }

    // Audit log
    this.auditLogService.logAsync({
      action: 'UPDATE',
      entityName: 'Sale',
      entityId: saleId,
      userId,
      changeSummary: 'Approved sale group',
    });

    return {
      message: 'Sale group approved successfully',
      sale: updatedSale,
    };
  }

  /**
   * Decline all pending transactions belonging to a given Sale in one go and restore inventory.
   */
  async declineSaleGroup(
    saleId: number,
    declineSaleDto: DeclineSaleDto,
    userId: number,
  ) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        transactions: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale group not found');
    }

    if (sale.status !== 'pending') {
      throw new BadRequestException(
        `Sale group is not pending. Current status: ${sale.status}`,
      );
    }

    const pendingTransactions = sale.transactions.filter(
      (t) => !t.status || t.status === 'pending',
    );

    if (pendingTransactions.length === 0) {
      throw new BadRequestException(
        'Sale group has no pending transactions to decline',
      );
    }

    const updatedSale = await this.prisma.$transaction(async (tx) => {
      // Mark each transaction as declined (no inventory restoration needed since nothing was deducted)
      for (const transaction of pendingTransactions) {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'declined',
            notes: `Declined: ${declineSaleDto.reason}`,
            updatedAt: new Date(),
          },
        });
      }

      return tx.sale.update({
        where: { id: saleId },
        data: {
          status: 'declined',
          notes: `Declined: ${declineSaleDto.reason}`,
          updatedAt: new Date(),
        },
      });
    });

    // Audit log
    this.auditLogService.logAsync({
      action: 'UPDATE',
      entityName: 'Sale',
      entityId: saleId,
      userId,
      changeSummary: 'Declined sale group',
    });

    return {
      message: 'Sale group declined successfully',
      sale: updatedSale,
    };
  }

  private getDateRange(period: PeriodType, startDate?: string, endDate?: string): { start: Date; end: Date } {
    const now = new Date();
    let start: Date;
    let end: Date = new Date(now);

    switch (period) {
      case PeriodType.DAILY:
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case PeriodType.WEEKLY:
        start = new Date(now);
        const dayOfWeek = start.getDay();
        const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case PeriodType.MONTHLY:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case PeriodType.YEARLY:
        start = new Date(now.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(now.getFullYear(), 11, 31);
        end.setHours(23, 59, 59, 999);
        break;
      case PeriodType.CUSTOM:
        if (!startDate || !endDate) {
          throw new BadRequestException('Start date and end date are required for custom period');
        }
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }

  async getProductSales(query: ProductSalesQueryDto) {
    try {
      const { period = PeriodType.DAILY, startDate, endDate, page = 1, limit = 10 } = query;
      const skip = (page - 1) * limit;

      // Get date range based on period
      const { start, end } = this.getDateRange(period, startDate, endDate);

      // Build where clause - only approved sales (includes sales from inventory page and sales page)
      const where: any = {
        transactionType: TransactionType.SALE,
        status: 'approved', // Only count approved sales
        transactionDate: {
          gte: start,
          lte: end,
        },
      };

      // Get all approved sales transactions within the period
      // Order by transactionDate to ensure consistent processing
      const approvedTransactions = await this.prisma.transaction.findMany({
        where,
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
        },
        orderBy: {
          transactionDate: 'asc',
        },
      });

      // Group transactions by product (drugId)
      // First, collect all unique drugs to ensure consistent naming
      const drugInfoMap = new Map<number, {
        drugName: string;
        sku: string;
        category: string;
      }>();

      approvedTransactions.forEach((t) => {
        const drugId = t.batch.drug.id;
        if (!drugInfoMap.has(drugId)) {
          drugInfoMap.set(drugId, {
            drugName: t.batch.drug.tradeName
              ? `${t.batch.drug.genericName} (${t.batch.drug.tradeName})`
              : t.batch.drug.genericName,
            sku: t.batch.drug.sku,
            category: t.batch.drug.category?.name || 'Unknown',
          });
        }
      });

      // Now group transactions by product (drugId)
      const productMap = new Map<number, {
        drugId: number;
        drugName: string;
        sku: string;
        category: string;
        totalQuantity: number;
        totalRevenue: number;
        totalProfit: number;
        unitPrice: number;
      }>();

      approvedTransactions.forEach((t) => {
        const drugId = t.batch.drug.id;
        const drugInfo = drugInfoMap.get(drugId)!;
        
        // Use transaction unitPrice if available, otherwise fall back to batch unitPrice
        const unitPrice = t.unitPrice ?? t.batch.unitPrice ?? 0;
        const unitCost = t.batch.unitCost || 0;
        
        // Calculate revenue and profit for this transaction
        const revenue = t.quantity * unitPrice;
        const profit = revenue - (t.quantity * unitCost);

        if (productMap.has(drugId)) {
          const existing = productMap.get(drugId)!;
          existing.totalQuantity += t.quantity;
          existing.totalRevenue += revenue;
          existing.totalProfit += profit;
        } else {
          productMap.set(drugId, {
            drugId,
            drugName: drugInfo.drugName,
            sku: drugInfo.sku,
            category: drugInfo.category,
            totalQuantity: t.quantity,
            totalRevenue: revenue,
            totalProfit: profit,
            unitPrice, // Initial unit price, will be recalculated as weighted average
          });
        }
      });

      // Convert to array, calculate weighted average unit price, and sort by total quantity (descending)
      const products = Array.from(productMap.values())
        .map((product) => ({
          ...product,
          // Calculate weighted average unit price: totalRevenue / totalQuantity
          unitPrice: product.totalQuantity > 0 
            ? product.totalRevenue / product.totalQuantity 
            : 0,
        }))
        .sort((a, b) => {
          // Primary sort: total quantity (descending)
          if (b.totalQuantity !== a.totalQuantity) {
            return b.totalQuantity - a.totalQuantity;
          }
          // Secondary sort: drug name (ascending) for stable sorting
          return a.drugName.localeCompare(b.drugName);
        });

      // Calculate summary metrics from all products
      const totalQuantitySold = products.reduce(
        (sum, p) => sum + p.totalQuantity,
        0,
      );

      const totalRevenue = products.reduce(
        (sum, p) => sum + p.totalRevenue,
        0,
      );

      const totalProfit = products.reduce(
        (sum, p) => sum + p.totalProfit,
        0,
      );

      // Get most sold item (should be products[0] after sorting by quantity descending)
      const mostSoldItem = products.length > 0 ? products[0].drugName : 'N/A';

      // Get total number of unique products sold
      const numberOfProductsSold = products.length;

      // Paginate products
      const paginatedProducts = products.slice(skip, skip + limit);
      const total = products.length;

      // Debug logging to verify data consistency
      if (products.length > 0) {
        console.log('Product Sales Debug:', {
          totalProducts: products.length,
          mostSoldItem: mostSoldItem,
          mostSoldQuantity: products[0].totalQuantity,
          page: page,
          skip: skip,
          limit: limit,
          firstProductInResults: paginatedProducts.length > 0 ? paginatedProducts[0].drugName : 'N/A',
          allProductNames: products.map(p => ({ name: p.drugName, qty: p.totalQuantity })),
        });
      }

      return {
        summary: {
          numberOfProductsSold,
          totalQuantitySold,
          mostSoldItem,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalProfit: Math.round(totalProfit * 100) / 100,
        },
        products: paginatedProducts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error getting product sales:', error);
      throw error;
    }
  }
}
