import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '../transactions/dto/create-transaction.dto';
import {
  DashboardDataDto,
  DashboardCardDto,
  TopSellingDrugDto,
  InventoryDistributionDto,
  MonthlyDataDto,
  AuditLogDto,
} from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardData(): Promise<DashboardDataDto> {
    const [
      cards,
      topSellingDrugs,
      inventoryDistribution,
      monthlyData,
      recentAuditLogs,
    ] = await Promise.all([
      this.getDashboardCards(),
      this.getTopSellingDrugs(),
      this.getInventoryDistribution(),
      this.getMonthlyData(),
      this.getRecentAuditLogs(),
    ]);

    return {
      cards,
      topSellingDrugs,
      inventoryDistribution,
      monthlyData,
      recentAuditLogs,
    };
  }

  private async getDashboardCards(): Promise<DashboardCardDto[]> {
    const now = new Date();
    const oneMonthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Get total profit (quantity sold * (unit price - unit cost) for all sales transactions)
    const salesTransactions = await this.prisma.transaction.findMany({
      where: {
        transactionType: TransactionType.SALE,
      },
      include: {
        batch: true,
      },
    });

    const totalProfit = salesTransactions.reduce((sum, transaction) => {
      const profitPerUnit =
        transaction.batch.unitPrice - transaction.batch.unitCost;
      return sum + transaction.quantity * profitPerUnit;
    }, 0);

    // Get delayed orders (orders with expected date in the past but not complete)
    const delayedOrders = await this.prisma.purchaseOrder.count({
      where: {
        expectedDate: {
          lt: now,
        },
        status: {
          not: 'Complete',
        },
      },
    });

    // Get total stock value (sum of currentQty * unitPrice for all batches)
    const batches = await this.prisma.batch.findMany({
      select: {
        currentQty: true,
        unitPrice: true,
      },
    });

    const totalStockValue = batches.reduce((sum, batch) => {
      return sum + batch.currentQty * batch.unitPrice;
    }, 0);

    // Get expiring in a month
    const expiringInMonth = await this.prisma.batch.count({
      where: {
        expiryDate: {
          lte: oneMonthFromNow,
          gte: now,
        },
        currentQty: { gt: 0 }, // Only count batches with remaining stock
      },
    });

    // Get low stock batches (using batch.lowStockThreshold instead of hardcoded 10)
    const lowStockBatches = await this.prisma.batch.findMany({
      select: {
        currentQty: true,
        lowStockThreshold: true,
      },
    });

    const lowStock = lowStockBatches.filter(
      (batch) => batch.currentQty <= batch.lowStockThreshold,
    ).length;

    // Get expired batches
    const expiredBatches = await this.prisma.batch.count({
      where: {
        expiryDate: {
          lt: now,
        },
        currentQty: { gt: 0 }, // Only count batches with remaining stock
      },
    });

    return [
      {
        label: 'Total Profit',
        value: `ETB ${totalProfit.toLocaleString()}`,
      },
      {
        label: 'Delayed Orders',
        value: delayedOrders.toString(),
      },
      {
        label: 'Total Stock Value',
        value: `ETB ${totalStockValue.toLocaleString()}`,
      },
      {
        label: 'Expiring in a Month',
        value: expiringInMonth.toString(),
      },
      {
        label: 'Low / Out of Stock',
        value: lowStock.toString(),
      },
      {
        label: 'Expired Batches',
        value: expiredBatches.toString(),
      },
    ];
  }

  private async getTopSellingDrugs(): Promise<TopSellingDrugDto[]> {
    try {
      const topDrugs = await this.prisma.transaction.groupBy({
        by: ['batchId'],
        _sum: {
          quantity: true,
        },
        where: {
          transactionType: TransactionType.SALE,
        },
        orderBy: {
          _sum: {
            quantity: 'desc',
          },
        },
        take: 6,
      });

      if (topDrugs.length === 0) {
        // Return mock data if no transactions exist
        return [
          { name: 'Paracetamol', quantity: 150 },
          { name: 'Amoxicillin', quantity: 120 },
          { name: 'Ibuprofen', quantity: 100 },
          { name: 'Aspirin', quantity: 80 },
          { name: 'Vitamins', quantity: 60 },
          { name: 'Antibiotics', quantity: 40 },
        ];
      }

      const drugIds = topDrugs.map((d) => d.batchId);
      const batches = await this.prisma.batch.findMany({
        where: {
          id: {
            in: drugIds,
          },
        },
        include: {
          drug: true,
        },
      });

      return topDrugs.map((td) => {
        const batch = batches.find((b) => b.id === td.batchId);
        return {
          name: (batch?.drug.tradeName ?? batch?.drug.genericName) || 'Unknown Drug',
          quantity: td._sum.quantity || 0,
        };
      });
    } catch (error) {
      console.error('Error fetching top selling drugs:', error);
      // Return mock data on error
      return [
        { name: 'Paracetamol', quantity: 150 },
        { name: 'Amoxicillin', quantity: 120 },
        { name: 'Ibuprofen', quantity: 100 },
        { name: 'Aspirin', quantity: 80 },
        { name: 'Vitamins', quantity: 60 },
        { name: 'Antibiotics', quantity: 40 },
      ];
    }
  }

  private async getInventoryDistribution(): Promise<
    InventoryDistributionDto[]
  > {
    try {
      const categoryData = await this.prisma.drug.groupBy({
        by: ['categoryId'],
        _count: {
          id: true,
        },
      });

      if (categoryData.length === 0) {
        // Return mock data if no drugs exist
        return [
          { category: 'Antibiotics', percentage: 35 },
          { category: 'Pain Relief', percentage: 25 },
          { category: 'Antivirals', percentage: 20 },
          { category: 'Vitamins', percentage: 15 },
          { category: 'Others', percentage: 5 },
        ];
      }

      const totalDrugs = categoryData.reduce(
        (sum, cat) => sum + cat._count.id,
        0,
      );

      const categories = await this.prisma.category.findMany({
        where: {
          id: {
            in: categoryData.map((c) => c.categoryId),
          },
        },
      });

      return categoryData.map((cat) => {
        const category = categories.find((c) => c.id === cat.categoryId);
        return {
          category: category?.name || 'Unknown Category',
          percentage: totalDrugs > 0 ? (cat._count.id / totalDrugs) * 100 : 0,
        };
      });
    } catch (error) {
      console.error('Error fetching inventory distribution:', error);
      // Return mock data on error
      return [
        { category: 'Antibiotics', percentage: 35 },
        { category: 'Pain Relief', percentage: 25 },
        { category: 'Antivirals', percentage: 20 },
        { category: 'Vitamins', percentage: 15 },
        { category: 'Others', percentage: 5 },
      ];
    }
  }

  private async getMonthlyData(): Promise<MonthlyDataDto[]> {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      // Get sales data
      const salesData = await this.prisma.transaction.groupBy({
        by: ['transactionDate'],
        _sum: {
          quantity: true,
        },
        where: {
          transactionType: TransactionType.SALE,
          transactionDate: {
            gte: sixMonthsAgo,
          },
        },
      });

      // Get purchases data
      const purchasesData = await this.prisma.transaction.groupBy({
        by: ['transactionDate'],
        _sum: {
          quantity: true,
        },
        where: {
          transactionType: 'PURCHASE',
          transactionDate: {
            gte: sixMonthsAgo,
          },
        },
      });

      // Group by month
      const monthlyMap = new Map<
        string,
        { sales: number; purchases: number }
      >();

      salesData.forEach((sale) => {
        const month = sale.transactionDate.toISOString().substring(0, 7);
        if (!monthlyMap.has(month)) {
          monthlyMap.set(month, { sales: 0, purchases: 0 });
        }
        monthlyMap.get(month)!.sales += sale._sum.quantity || 0;
      });

      purchasesData.forEach((purchase) => {
        const month = purchase.transactionDate.toISOString().substring(0, 7);
        if (!monthlyMap.has(month)) {
          monthlyMap.set(month, { sales: 0, purchases: 0 });
        }
        monthlyMap.get(month)!.purchases += purchase._sum.quantity || 0;
      });

      const result = Array.from(monthlyMap.entries())
        .map(([month, data]) => ({
          month,
          sales: data.sales,
          purchases: data.purchases,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      if (result.length === 0) {
        // Return mock data if no transactions exist
        const currentDate = new Date();
        return Array.from({ length: 6 }, (_, i) => {
          const date = new Date(currentDate);
          date.setMonth(date.getMonth() - i);
          const month = date.toISOString().substring(0, 7);
          return {
            month,
            sales: Math.floor(Math.random() * 1000) + 500,
            purchases: Math.floor(Math.random() * 800) + 300,
          };
        }).reverse();
      }

      return result;
    } catch (error) {
      console.error('Error fetching monthly data:', error);
      // Return mock data on error
      const currentDate = new Date();
      return Array.from({ length: 6 }, (_, i) => {
        const date = new Date(currentDate);
        date.setMonth(date.getMonth() - i);
        const month = date.toISOString().substring(0, 7);
        return {
          month,
          sales: Math.floor(Math.random() * 1000) + 500,
          purchases: Math.floor(Math.random() * 800) + 300,
        };
      }).reverse();
    }
  }

  private async getRecentAuditLogs(): Promise<AuditLogDto[]> {
    const logs = await this.prisma.auditLog.findMany({
      take: 3,
      orderBy: {
        timestamp: 'desc',
      },
      include: {
        user: {
          select: { id: true, username: true, fullName: true },
        },
      },
    });

    return logs.map((log) => ({
      entityName: log.entityName,
      action: log.action,
      timestamp: log.timestamp,
      changeSummary: log.changeSummary || '',
      userName: log.user?.fullName || log.user?.username || 'Unknown User',
      userId: log.user?.id || 0,
    }));
  }
}
