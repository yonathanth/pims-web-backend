import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveSaleDto, DeclineSaleDto, SalesQueryDto } from './dto';
import { TransactionType } from '../transactions/dto/create-transaction.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

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
        drugName: transaction.batch.drug.tradeName
          ? `${transaction.batch.drug.genericName} (${transaction.batch.drug.tradeName})`
          : transaction.batch.drug.genericName,
        sku: transaction.batch.drug.sku,
        category: transaction.batch.drug.category.name,
        quantity: transaction.quantity,
        unitPrice: transaction.batch.unitPrice,
        totalPrice: transaction.quantity * transaction.batch.unitPrice,
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
        unitPrice: transaction.batch.unitPrice,
        totalPrice: transaction.quantity * transaction.batch.unitPrice,
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

  async approveSale(id: number, approveSaleDto: ApproveSaleDto) {
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

      // Update transaction status only (stock was already deducted when transaction was created)
      const updatedTransaction = await this.prisma.transaction.update({
        where: { id },
        data: {
          status: 'approved',
          notes: approveSaleDto.notes || transaction.notes,
          updatedAt: new Date(),
        },
      });

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
}
