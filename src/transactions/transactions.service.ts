import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Transaction, Prisma } from '@prisma/client';
import {
  CreateTransactionDto,
  TransactionType,
  ListTransactionsDto,
  TransactionResponseDto,
  PaginatedTransactionResult,
} from './dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';

@Injectable({ scope: Scope.REQUEST })
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  @Audit({
    entityName: 'Transaction',
    action: 'CREATE',
    changeSummary: (result) =>
      `Created ${result.transactionType} transaction for batch #${result.batchId}`,
  })
  async create(
    dto: CreateTransactionDto,
    userId: number,
  ): Promise<Transaction> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: dto.batchId },
    });
    if (!batch)
      throw new NotFoundException(`Batch with ID ${dto.batchId} not found`);

    // Process all transaction types uniformly - deduct inventory immediately regardless of status
    const sign = this.getQuantitySign(dto.transactionType);
    const delta = sign * dto.quantity;

    // Check if there's sufficient quantity for negative changes (sales, negative returns)
    if (delta < 0 && batch.currentQty + delta < 0) {
      throw new BadRequestException(
        `Insufficient quantity. Available: ${batch.currentQty}, Requested: ${dto.quantity}`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Update batch quantity immediately for all transaction types
      const updatedBatch = await tx.batch.update({
        where: { id: batch.id },
        data: { currentQty: { increment: delta } },
      });

      if (updatedBatch.currentQty < 0) {
        throw new BadRequestException(
          'Insufficient batch quantity for this transaction',
        );
      }

      // Create transaction record with appropriate status
      const created = await tx.transaction.create({
        data: {
          batchId: dto.batchId,
          transactionType: dto.transactionType,
          quantity: dto.quantity,
          userId,
          notes: dto.notes,
          status:
            dto.transactionType === TransactionType.SALE
              ? 'pending'
              : 'completed',
        },
      });

      return created;
    });

    // Evaluate stock notifications after transaction
    await this.notificationsService.evaluateBatchStock(dto.batchId);

    return result;
  }

  async findAll(
    query?: ListTransactionsDto,
  ): Promise<PaginatedTransactionResult> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortBy = query?.sortBy ?? 'id';
    const sortDir = query?.sortDir ?? 'desc';

    const where: Prisma.TransactionWhereInput = {};

    // Apply filters
    if (query?.type) where.transactionType = query.type;
    if (query?.batchId) where.batchId = query.batchId;
    if (query?.userId) where.userId = query.userId;
    if (query?.fromLocationId) where.fromLocationId = query.fromLocationId;
    if (query?.toLocationId) where.toLocationId = query.toLocationId;

    // Date range filtering
    if (query?.startDate || query?.endDate) {
      where.transactionDate = {};
      if (query.startDate) {
        (where.transactionDate as any).gte = new Date(query.startDate);
      }
      if (query.endDate) {
        (where.transactionDate as any).lte = new Date(query.endDate);
      }
    }

    // Search in notes
    if (query?.search) {
      where.notes = {
        contains: query.search,
        mode: 'insensitive',
      };
    }

    const [totalItems, rawData] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
        include: {
          batch: {
            include: {
              drug: {
                select: {
                  sku: true,
                  genericName: true,
                  tradeName: true,
                },
              },
              supplier: {
                select: {
                  name: true,
                },
              },
            },
          },
          user: {
            select: {
              username: true,
            },
          },
          fromLocation: {
            select: {
              name: true,
            },
          },
          toLocation: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const data = rawData.map((transaction) => ({
      ...transaction,
      drugSku: transaction.batch.drug.sku,
      drugName: transaction.batch.drug.tradeName
        ? `${transaction.batch.drug.genericName} (${transaction.batch.drug.tradeName})`
        : transaction.batch.drug.genericName,
      supplierName: transaction.batch.supplier.name,
      username: transaction.user?.username || 'Unknown User',
      fromLocationName: transaction.fromLocation?.name,
      toLocationName: transaction.toLocation?.name,
      // Remove nested objects
      batch: undefined,
      user: undefined,
      fromLocation: undefined,
      toLocation: undefined,
    })) as TransactionResponseDto[];

    return {
      data,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      },
    };
  }

  async findOne(id: number): Promise<TransactionResponseDto> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        batch: {
          include: {
            drug: {
              select: {
                sku: true,
                genericName: true,
                tradeName: true,
              },
            },
            supplier: {
              select: {
                name: true,
              },
            },
          },
        },
        user: {
          select: {
            username: true,
          },
        },
        fromLocation: {
          select: {
            name: true,
          },
        },
        toLocation: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return {
      ...transaction,
      drugSku: transaction.batch.drug.sku,
      drugName: transaction.batch.drug.tradeName
        ? `${transaction.batch.drug.genericName} (${transaction.batch.drug.tradeName})`
        : transaction.batch.drug.genericName,
      supplierName: transaction.batch.supplier.name,
      username: transaction.user?.username || 'Unknown User',
      fromLocationName: transaction.fromLocation?.name,
      toLocationName: transaction.toLocation?.name,
      // Remove nested objects
      batch: undefined,
      user: undefined,
      fromLocation: undefined,
      toLocation: undefined,
    } as TransactionResponseDto;
  }

  private getQuantitySign(type: TransactionType): 1 | -1 {
    switch (type) {
      case TransactionType.INBOUND:
      case TransactionType.POSITIVE_RETURN:
        return 1;
      case TransactionType.SALE:
      case TransactionType.NEGATIVE_RETURN:
        return -1;
      default:
        return -1;
    }
  }

  // Pending sales management methods
  async getPendingSales(): Promise<TransactionResponseDto[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        transactionType: TransactionType.SALE,
        status: 'pending',
      },
      include: {
        batch: {
          include: {
            drug: { select: { sku: true, genericName: true, tradeName: true } },
            supplier: { select: { name: true } },
          },
        },
        user: { select: { fullName: true } },
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return transactions.map((transaction) => ({
      ...transaction,
      transactionType: transaction.transactionType as TransactionType,
      notes: transaction.notes || undefined,
      fromLocationId: transaction.fromLocationId || undefined,
      toLocationId: transaction.toLocationId || undefined,
      userId: transaction.userId || undefined,
      drugSku: transaction.batch.drug.sku,
      drugName: transaction.batch.drug.tradeName
        ? `${transaction.batch.drug.genericName} (${transaction.batch.drug.tradeName})`
        : transaction.batch.drug.genericName,
      supplierName: transaction.batch.supplier.name,
      username: transaction.user?.fullName || 'Unknown User',
      fromLocationName: transaction.fromLocation?.name,
      toLocationName: transaction.toLocation?.name,
      batch: undefined,
      user: undefined,
      fromLocation: undefined,
      toLocation: undefined,
    }));
  }

  async updateTransactionStatus(
    transactionId: number,
    status: string,
    notes?: string,
  ): Promise<Transaction> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${transactionId} not found`,
      );
    }

    if (transaction.status !== 'pending') {
      throw new BadRequestException(
        `Transaction is not pending. Current status: ${transaction.status}`,
      );
    }

    if (transaction.transactionType !== TransactionType.SALE) {
      throw new BadRequestException(
        'Only sale transactions can be updated by sellers',
      );
    }

    if (status === 'completed') {
      // Complete the sale - just update status (inventory already deducted)
      return await this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'completed',
          notes: notes
            ? `${transaction.notes || ''} | ${notes}`
            : transaction.notes,
        },
      });
    } else if (status === 'declined') {
      // Decline the sale - restore inventory and update status
      return await this.prisma.$transaction(async (tx) => {
        // Restore the inventory
        await tx.batch.update({
          where: { id: transaction.batchId },
          data: { currentQty: { increment: transaction.quantity } },
        });

        // Update transaction status
        const updatedTransaction = await tx.transaction.update({
          where: { id: transactionId },
          data: {
            status: 'declined',
            notes: notes
              ? `${transaction.notes || ''} | DECLINED: ${notes}`
              : transaction.notes,
          },
        });

        return updatedTransaction;
      });
    }

    throw new BadRequestException(
      'Invalid status. Must be "completed" or "declined"',
    );
  }
}
