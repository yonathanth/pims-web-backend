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
}
