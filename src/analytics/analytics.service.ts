import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeneralConfigsService } from '../general-configs/general-configs.service';
import {
  AnalyticsResponse,
  KeyMetric,
  CategorySlice,
  MonthlySeriesPoint,
  YearlySalesPoint,
  SupplierSummary,
  TopPerformerDto,
  ProductDto,
  TimeFilter,
  AnalyticsQueryDto,
  TopPerformersSort,
  SortOrder,
  TopSuppliersSort,
} from './dto/analytics.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private generalConfigs: GeneralConfigsService,
  ) {}

  // Centralized transaction type constants to avoid magic strings
  private static readonly SALE_TYPES = ['sale'] as const;
  private static readonly RECEIVE_TYPES = ['receive', 'in'] as const;

  private computeRanges(
    timeFilter: TimeFilter | undefined,
    startIso?: string,
    endIso?: string,
    dateIso?: string,
  ): { currentStart: Date; currentEnd: Date; prevStart: Date; prevEnd: Date } {
    const now = new Date();
    let currentStart: Date;
    let currentEnd: Date = now;
    let prevStart: Date;
    let prevEnd: Date;

    if (timeFilter === TimeFilter.Custom && startIso) {
      currentStart = new Date(startIso);
      currentEnd = endIso ? new Date(endIso) : now;
      const len = currentEnd.getTime() - currentStart.getTime();
      prevEnd = new Date(currentStart.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - len);
    } else if (timeFilter === TimeFilter.Date && dateIso) {
      // Single day: [date start, next day start)
      const d = new Date(dateIso);
      currentStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      currentEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      // previous day window
      prevStart = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
      prevEnd = currentStart;
    } else {
      switch (timeFilter) {
        case TimeFilter.Daily:
          currentStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          prevStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
          prevEnd = currentStart;
          break;
        case TimeFilter.Monthly:
          currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          prevStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
          prevEnd = currentStart;
          break;
        case TimeFilter.Yearly:
        default:
          currentStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          prevStart = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
          prevEnd = currentStart;
          break;
      }
    }

    return { currentStart, currentEnd, prevStart, prevEnd };
  }

  private async revenueInRange(start: Date, end: Date): Promise<number> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        transactionType: {
          in: [...AnalyticsService.SALE_TYPES],
          mode: 'insensitive',
        },
        status: 'approved',
        transactionDate: { gte: start, lt: end },
      },
      include: { batch: true },
    });
    return transactions.reduce(
      (sum, t) => sum + t.quantity * ((t as any).unitPrice ?? t.batch?.unitPrice ?? 0),
      0,
    );
  }

  private async profitInRange(start: Date, end: Date): Promise<number> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        transactionType: {
          in: [...AnalyticsService.SALE_TYPES],
          mode: 'insensitive',
        },
        status: 'approved',
        transactionDate: { gte: start, lt: end },
      },
      include: { batch: true },
    });
    return transactions.reduce(
      (sum, t) =>
        sum +
        t.quantity * (((t as any).unitPrice ?? t.batch?.unitPrice ?? 0) - (t.batch?.unitCost || 0)),
      0,
    );
  }

  private async soldQtyInRange(start: Date, end: Date): Promise<number> {
    const result = await this.prisma.transaction.aggregate({
      _sum: { quantity: true },
      where: {
        transactionType: {
          in: [...AnalyticsService.SALE_TYPES],
          mode: 'insensitive',
        },
        status: 'approved',
        transactionDate: { gte: start, lt: end },
      },
    });
    return result._sum.quantity || 0;
  }

  private async receivedQtyInRange(start: Date, end: Date): Promise<number> {
    const result = await this.prisma.transaction.aggregate({
      _sum: { quantity: true },
      where: {
        transactionType: {
          in: [...AnalyticsService.RECEIVE_TYPES],
          mode: 'insensitive',
        },
        transactionDate: { gte: start, lt: end },
      },
    });
    return result._sum.quantity || 0;
  }

  private async totalTransactionsInRange(
    start: Date,
    end: Date,
  ): Promise<number> {
    return await this.prisma.transaction.count({
      where: {
        transactionDate: { gte: start, lt: end },
      },
    });
  }

  private async avgSaleValuePerUnitInRange(
    start: Date,
    end: Date,
  ): Promise<number> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        transactionType: {
          in: [...AnalyticsService.SALE_TYPES],
          mode: 'insensitive',
        },
        status: 'approved',
        transactionDate: { gte: start, lt: end },
      },
      include: { batch: true },
    });
    const totalValue = transactions.reduce(
      (sum, t) => sum + t.quantity * ((t as any).unitPrice ?? t.batch?.unitPrice ?? 0),
      0,
    );
    const totalQty = transactions.reduce((sum, t) => sum + t.quantity, 0);
    return totalQty > 0 ? totalValue / totalQty : 0;
  }

  private async soldCostInRange(start: Date, end: Date): Promise<number> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        transactionType: {
          in: [...AnalyticsService.SALE_TYPES],
          mode: 'insensitive',
        },
        status: 'approved',
        transactionDate: { gte: start, lt: end },
      },
      include: { batch: true },
    });
    return transactions.reduce(
      (sum, t) => sum + t.quantity * (t.batch?.unitCost || 0),
      0,
    );
  }

  private async receivedValueInRange(start: Date, end: Date): Promise<number> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        transactionType: {
          in: [...AnalyticsService.RECEIVE_TYPES],
          mode: 'insensitive',
        },
        transactionDate: { gte: start, lt: end },
      },
      include: { batch: true },
    });
    return transactions.reduce(
      (sum, t) => sum + t.quantity * ((t as any).unitPrice ?? t.batch?.unitPrice ?? 0),
      0,
    );
  }

  private async totalStockValue(): Promise<number> {
    // Match dashboard calculation: sum of currentQty * unitPrice for all batches
    const batches = await this.prisma.batch.findMany({
      select: {
        currentQty: true,
        unitPrice: true,
      },
    });
    return batches.reduce((sum, batch) => {
      return sum + batch.currentQty * batch.unitPrice;
    }, 0);
  }

  private async totalItems(): Promise<number> {
    const result = await this.prisma.batch.aggregate({
      _sum: { currentQty: true },
    });
    return result._sum.currentQty || 0;
  }

  private async expiringInDays(days: number): Promise<number> {
    // Match dashboard calculation: count batches expiring within days, with currentQty > 0
    // Uses current date (not time-filtered)
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return await this.prisma.batch.count({
      where: {
        expiryDate: {
          gte: now,
          lte: until,
        },
        currentQty: { gt: 0 }, // Only count batches with remaining stock (matches dashboard)
      },
    });
  }

  private async lowStockCount(): Promise<number> {
    // Match dashboard calculation: count batches where currentQty <= batch.lowStockThreshold
    // Uses batch.lowStockThreshold (per-batch threshold)
    // Excludes out of stock batches (currentQty = 0)
    const lowStockBatches = await this.prisma.batch.findMany({
      select: {
        currentQty: true,
        lowStockThreshold: true,
      },
    });
    return lowStockBatches.filter(
      (batch) => batch.currentQty > 0 && batch.currentQty <= batch.lowStockThreshold,
    ).length;
  }

  private async delayedPurchaseOrders(): Promise<number> {
    const now = new Date();
    return await this.prisma.purchaseOrder.count({
      where: {
        expectedDate: { lt: now },
        status: { not: 'received' },
      },
    });
  }

  private async totalExpiredBatches(): Promise<number> {
    const now = new Date();
    return await this.prisma.batch.count({
      where: {
        expiryDate: { lt: now },
      },
    });
  }

  // Count expired batches (match dashboard: only batches with currentQty > 0)
  private async expiredBatchesCount(): Promise<number> {
    const now = new Date();
    return await this.prisma.batch.count({
      where: {
        expiryDate: { lt: now },
        currentQty: { gt: 0 }, // Only count batches with remaining stock (matches dashboard)
      },
    });
  }

  private async outOfStockCount(): Promise<number> {
    // Count batches with zero quantity (simpler than drug-level aggregation)
    return await this.prisma.batch.count({
      where: {
        currentQty: 0,
      },
    });
  }

  private async totalSuppliers(): Promise<number> {
    return await this.prisma.supplier.count();
  }

  // Snapshot helpers to support period-over-period trends without historical snapshots
  private async currentDrugQuantities(): Promise<Map<number, number>> {
    // Use batch.currentQty instead of locationBatches.quantity
    const rows = await this.prisma.$queryRaw<
      Array<{ drugId: number; qty: number }>
    >`
      SELECT d.id as "drugId",
             COALESCE(CAST(SUM(b."currentQty") AS DOUBLE PRECISION), 0) AS qty
      FROM "drugs" d
      LEFT JOIN "batches" b ON b."drugId" = d.id
      GROUP BY d.id
    `;
    return new Map(rows.map((r) => [r.drugId, r.qty || 0]));
  }

  private async drugFlowsAfter(
    start: Date,
    end: Date,
  ): Promise<Map<number, { received: number; sold: number }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ drugId: number; received: number; sold: number }>
    >`
      SELECT b."drugId" as "drugId",
             COALESCE(CAST(SUM(CASE WHEN LOWER(t."transactionType") IN ('receive','in') THEN t.quantity ELSE 0 END) AS DOUBLE PRECISION), 0) AS received,
             COALESCE(CAST(SUM(CASE WHEN LOWER(t."transactionType") IN ('sale') AND t."status" = 'approved' THEN t.quantity ELSE 0 END) AS DOUBLE PRECISION), 0) AS sold
      FROM "transactions" t
      JOIN "batches" b ON b.id = t."batchId"
      WHERE t."transactionDate" >= ${start} AND t."transactionDate" < ${end}
      GROUP BY b."drugId"
    `;
    const map = new Map<number, { received: number; sold: number }>();
    rows.forEach((r) =>
      map.set(r.drugId, { received: r.received || 0, sold: r.sold || 0 }),
    );
    return map;
  }

  private async estimatePrevCountsAsOf(
    prevEnd: Date,
    currentEnd: Date,
  ): Promise<{ lowStockPrev: number; outOfStockPrev: number }> {
    // Estimate previous period counts by rolling back current quantities
    // Uses batch.lowStockThreshold for each batch (not a single threshold)
    const batches = await this.prisma.batch.findMany({
      select: {
        drugId: true,
        currentQty: true,
        lowStockThreshold: true,
      },
    });
    const flows = await this.drugFlowsAfter(prevEnd, currentEnd);
    const currentQty = await this.currentDrugQuantities();
    
    // Group batches by drug and calculate previous quantities
    const drugBatches = new Map<number, typeof batches>();
    batches.forEach((b) => {
      if (!drugBatches.has(b.drugId)) {
        drugBatches.set(b.drugId, []);
      }
      drugBatches.get(b.drugId)!.push(b);
    });
    
    let low = 0;
    let out = 0;
    
    drugBatches.forEach((batchesForDrug, drugId) => {
      const f = flows.get(drugId) || { received: 0, sold: 0 };
      const currentDrugQty = currentQty.get(drugId) || 0;
      const prevDrugQty = currentDrugQty - f.received + f.sold;
      
      // Estimate previous quantity per batch proportionally
      const totalCurrent = batchesForDrug.reduce((sum, b) => sum + b.currentQty, 0);
      if (totalCurrent === 0) {
        // If all batches are empty now, check if they were empty before
        if (prevDrugQty <= 0) out += batchesForDrug.length;
        return;
      }
      
      batchesForDrug.forEach((batch) => {
        // Estimate previous quantity for this batch
        const prevBatchQty = totalCurrent > 0 
          ? (batch.currentQty / totalCurrent) * prevDrugQty
          : 0;
        
        if (prevBatchQty <= 0) {
          out += 1;
        } else if (prevBatchQty <= batch.lowStockThreshold) {
          low += 1;
        }
      });
    });
    
    return { lowStockPrev: low, outOfStockPrev: out };
  }

  private async mostSoldDrugsInRange(
    start: Date,
    end: Date,
    limit: number,
  ): Promise<{ drugName: string; soldQty: number }[]> {
    const result = await this.prisma.transaction.groupBy({
      by: ['batchId'],
      _sum: { quantity: true },
      where: {
        transactionType: {
          in: [...AnalyticsService.SALE_TYPES],
          mode: 'insensitive',
        },
        status: 'approved',
        transactionDate: { gte: start, lt: end },
      },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    const withNames = await Promise.all(
      result.map(async (r) => {
        const batch = await this.prisma.batch.findUnique({
          where: { id: r.batchId },
          include: { drug: true },
        });
        return {
          drugName: batch?.drug?.tradeName
            ? `${batch.drug.genericName} (${batch.drug.tradeName})`
            : batch?.drug?.genericName || 'Unknown',
          soldQty: r._sum.quantity || 0,
        };
      }),
    );
    return withNames;
  }

  private async mostOrderedProductsInRange(
    start: Date,
    end: Date,
    limit: number,
  ): Promise<ProductDto[]> {
    const items = await this.prisma.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          createdDate: { gte: start, lt: end },
        },
      },
      include: {
        drug: true,
        batch: {
          include: {
            locationBatches: {
              include: { location: true },
            },
          },
        },
        purchaseOrder: { include: { supplier: true } },
      },
      orderBy: { quantityOrdered: 'desc' },
      take: limit,
    });
    return items.map((item) => {
      // Get location names from batch if it exists (comma-separated if multiple)
      const locationNames = item.batch?.locationBatches
        ?.map((lb) => lb.location.name)
        .join(', ') || undefined;

      return {
        genericName: item.drug.tradeName ?? item.drug.genericName,
        tradeName: item.drug.tradeName || undefined,
        sku: item.drug.sku || undefined,
        batchNumber: item.batch?.batchNumber ?? (item.batch?.id.toString() || undefined),
        expiryDate:
          item.batch?.expiryDate?.toISOString().split('T')[0] || undefined,
        quantity: item.quantityReceived,
        location: locationNames,
        unitPrice: item.unitCost,
        lastRestock: item.purchaseOrder.createdDate.toISOString().split('T')[0],
        supplier: item.purchaseOrder.supplier.name,
        orderedQty: item.quantityOrdered,
      };
    });
  }

  private async incompletePurchaseOrdersCount(): Promise<number> {
    return await this.prisma.purchaseOrder.count({
      where: {
        status: { in: ['pending', 'partiallycompleted'], mode: 'insensitive' },
      },
    });
  }

  private async incompletePurchaseOrdersBreakdown(): Promise<
    Record<string, number>
  > {
    const result = await this.prisma.purchaseOrder.groupBy({
      by: ['status'],
      _count: true,
      where: {
        status: { in: ['pending', 'partiallycompleted'], mode: 'insensitive' },
      },
    });
    const map: Record<string, number> = {};
    result.forEach((r) => {
      map[r.status.toLowerCase()] = r._count;
    });
    return map;
  }

  private async topSuppliers(
    limit: number,
    sort: TopSuppliersSort,
    order: SortOrder,
  ): Promise<SupplierSummary[]> {
    const suppliers = await this.prisma.supplier.findMany({
      include: {
        purchaseOrders: {
          include: { 
            items: { 
              include: { 
                drug: true,
                batch: {
                  select: {
                    unitCost: true,
                  },
                },
              } 
            } 
          },
        },
      },
    });
    const summaries = suppliers.map((s) => {
      const volumeSupplied = s.purchaseOrders.reduce(
        (sum, po) => sum + po.items.reduce((s, i) => s + i.quantityReceived, 0),
        0,
      );
      const valueSupplied = s.purchaseOrders.reduce(
        (sum, po) =>
          sum +
          po.items.reduce((s, i) => {
            // Prefer batch unitCost (actual purchase cost) if batch exists, otherwise use item unitCost
            const unitCost = i.batch?.unitCost ?? i.unitCost ?? 0;
            return s + i.quantityReceived * unitCost;
          }, 0),
        0,
      );
      const ordersDelivered = s.purchaseOrders.filter(
        (po) => {
          // An order is "delivered" only if ALL its items have status "Complete"
          // We check item status, not order status, since item status is more reliable
          if (po.items.length === 0) return false;
          
          // All items must be "Complete" (case-insensitive, trimmed)
          return po.items.every(
            (item) => item.status?.toLowerCase().trim() === 'complete',
          );
        },
      ).length;
      const totalOrders = s.purchaseOrders.length;
      const orderCompletionPct =
        totalOrders > 0 ? (ordersDelivered / totalOrders) * 100 : 0;
      const allItems = s.purchaseOrders.flatMap((po) => po.items);
      const mostSuppliedItem =
        allItems.length > 0
          ? allItems.reduce((prev, curr) =>
              prev.quantityReceived > curr.quantityReceived ? prev : curr,
            ).drug.genericName
          : '';
      return {
        id: s.id,
        name: s.name,
        volumeSupplied,
        valueSupplied,
        ordersDelivered,
        orderCompletionPct,
        mostSuppliedItem,
        totalOrders,
      } as SupplierSummary & { totalOrders: number };
    });
    const dir = order === SortOrder.Asc ? 1 : -1;
    summaries.sort((a, b) => {
      let lhs: number;
      let rhs: number;
      switch (sort) {
        case TopSuppliersSort.Value:
          lhs = a.valueSupplied;
          rhs = b.valueSupplied;
          break;
        case TopSuppliersSort.Frequency:
          lhs = a.totalOrders;
          rhs = b.totalOrders;
          break;
        case TopSuppliersSort.Volume:
        default:
          lhs = a.volumeSupplied;
          rhs = b.volumeSupplied;
          break;
      }
      return (lhs - rhs) * dir;
    });
    return summaries.slice(0, limit).map(({ totalOrders, ...rest }) => rest);
  }

  private async activeSuppliersCount(days: number): Promise<number> {
    // Count suppliers that have purchase orders in the last N days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        purchaseOrders: {
          some: {
            createdDate: { gte: cutoffDate },
          },
        },
      },
    });
    return suppliers.length;
  }

  private async totalPurchasesETB(): Promise<number> {
    // Sum of all purchase order items: quantityReceived * unitCost
    // Prefer batch.unitCost (actual purchase cost) if available, otherwise use item.unitCost
    const items = await this.prisma.purchaseOrderItem.findMany({
      include: {
        batch: {
          select: {
            unitCost: true,
          },
        },
      },
    });
    return items.reduce((sum, item) => {
      // Prefer batch unitCost (actual purchase cost) if batch exists, otherwise use item unitCost
      const unitCost = item.batch?.unitCost ?? item.unitCost ?? 0;
      return sum + item.quantityReceived * unitCost;
    }, 0);
  }

  private async onTimeDeliveryRate(): Promise<number> {
    // Calculate percentage of orders delivered on or before expectedDate
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        status: { in: ['Complete', 'Partially Received'], mode: 'insensitive' },
        expectedDate: { not: null },
      },
      select: {
        expectedDate: true,
        updatedAt: true,
        status: true,
      },
    });

    if (orders.length === 0) return 0;

    // An order is on-time if it was completed/received on or before expectedDate
    const onTimeOrders = orders.filter((order) => {
      if (!order.expectedDate) return false;
      // Use updatedAt as delivery date (when status changed to completed/received)
      const deliveryDate = order.updatedAt;
      return deliveryDate <= order.expectedDate;
    });

    return (onTimeOrders.length / orders.length) * 100;
  }

  private async topPerformersInRange(
    start: Date,
    end: Date,
    limit: number,
    sort: TopPerformersSort,
    order: SortOrder,
  ): Promise<TopPerformerDto[]> {
    const result = await this.prisma.transaction.groupBy({
      by: ['userId'],
      _sum: { quantity: true },
      where: {
        transactionType: {
          in: [...AnalyticsService.SALE_TYPES],
          mode: 'insensitive',
        },
        status: 'approved',
        transactionDate: { gte: start, lt: end },
      },
    });
    const withUsers = await Promise.all(
      result.map(async (r) => {
        const user = r.userId
          ? await this.prisma.user.findUnique({
              where: { id: r.userId },
            })
          : null;
        return {
          name: user?.fullName || 'Unknown',
          username: user?.username || '',
          email: user?.email || '',
          volumeSold: r._sum.quantity || 0,
        };
      }),
    );
    const dir = order === SortOrder.Asc ? 1 : -1;
    withUsers.sort((a, b) => {
      if (sort === TopPerformersSort.Name) {
        return a.name.localeCompare(b.name) * dir;
      }
      return (a.volumeSold - b.volumeSold) * dir;
    });
    return withUsers.slice(0, limit);
  }

  private async distributionByCategory(): Promise<CategorySlice[]> {
    // Not time-based: shows current stock and all-time sold quantities
    const categories = await this.prisma.category.findMany({
      include: {
        drugs: {
          include: {
            batches: true,
          },
        },
      },
    });
    return await Promise.all(
      categories.map(async (c) => {
        // Use batch.currentQty for consistency with dashboard
        const stockQty = c.drugs.reduce(
          (sum, d) =>
            sum + d.batches.reduce((s, b) => s + b.currentQty, 0),
          0,
        );
        // Calculate soldQty from all approved sale transactions (not time-filtered)
        const batchIds = c.drugs.flatMap((d) => d.batches.map((b) => b.id));
        let soldQty = 0;
        if (batchIds.length > 0) {
          const soldResult = await this.prisma.transaction.aggregate({
            _sum: { quantity: true },
            where: {
              transactionType: {
                in: [...AnalyticsService.SALE_TYPES],
                mode: 'insensitive',
              },
              status: 'approved',
              batchId: { in: batchIds },
            },
          });
          soldQty = soldResult._sum.quantity || 0;
        }
        return { category: c.name, stockQty, soldQty };
      }),
    );
  }

  private async monthlyStockedVsSold(
    monthsBack: number,
    start?: Date,
    end?: Date,
  ): Promise<MonthlySeriesPoint[]> {
    // Returns monthly stocked (receipts) vs sold quantities.
    // If start/end dates are provided, use those; otherwise use monthsBack from now.
    const now = end || new Date();
    const months: { start: Date; end: Date; label: string }[] = [];
    
    if (start && end) {
      // Use custom date range - break it into months
      const rangeStart = new Date(start);
      const rangeEnd = new Date(end);
      let currentMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      
      while (currentMonth < rangeEnd) {
        const monthStart = currentMonth > rangeStart ? currentMonth : rangeStart;
        const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        const monthEnd = nextMonth < rangeEnd ? nextMonth : rangeEnd;
        const label = `${currentMonth.getFullYear()}-${(currentMonth.getMonth() + 1).toString().padStart(2, '0')}`;
        months.push({ start: monthStart, end: monthEnd, label });
        currentMonth = nextMonth;
      }
    } else {
      // Use monthsBack from now (default behavior)
      for (let i = monthsBack - 1; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const label = `${monthStart.getFullYear()}-${(monthStart.getMonth() + 1).toString().padStart(2, '0')}`;
        months.push({ start: monthStart, end: monthEnd, label });
      }
    }
    
    const points: MonthlySeriesPoint[] = [];
    for (const m of months) {
      // Stocked: sum of currentQty for batches created in this month
      // This includes batches created manually and from purchase orders
      // Uses purchaseDate to determine when inventory was stocked
      const stockedBatches = await this.prisma.batch.findMany({
        where: {
          purchaseDate: { gte: m.start, lt: m.end },
        },
        select: {
          currentQty: true,
        },
      });
      const stocked = stockedBatches.reduce(
        (sum, b) => sum + b.currentQty,
        0,
      );

      // Sold: sum of 'sale' transactions in this month (only approved sales)
      const soldAgg = await this.prisma.transaction.aggregate({
        _sum: { quantity: true },
        where: {
          transactionType: {
            in: [...AnalyticsService.SALE_TYPES],
            mode: 'insensitive',
          },
          status: 'approved',
          transactionDate: { gte: m.start, lt: m.end },
        },
      });
      points.push({
        month: m.label,
        stocked,
        sold: soldAgg._sum.quantity || 0,
      });
    }
    return points;
  }

  private async yearlySales(): Promise<YearlySalesPoint[]> {
    // Returns monthly sales for the current year (12 months)
    const now = new Date();
    const currentYear = now.getFullYear();
    const points: YearlySalesPoint[] = [];

    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(currentYear, month, 1);
      const monthEnd = new Date(currentYear, month + 1, 1);
      const label = `${monthStart.getFullYear()}-${(monthStart.getMonth() + 1).toString().padStart(2, '0')}`;

      // Sum of approved sale transactions in this month
      const salesAgg = await this.prisma.transaction.aggregate({
        _sum: { quantity: true },
        where: {
          transactionType: {
            in: [...AnalyticsService.SALE_TYPES],
            mode: 'insensitive',
          },
          status: 'approved',
          transactionDate: { gte: monthStart, lt: monthEnd },
        },
      });

      points.push({
        month: label,
        sales: salesAgg._sum.quantity || 0,
      });
    }

    return points;
  }

  private async outOfStockProducts(
    limit: number,
    offset: number,
  ): Promise<ProductDto[]> {
    // Use batch.currentQty and show batches with zero quantity (matches card calculation)
    // Sort by last restock date (most recently out of stock first) to prioritize items that went out of stock recently
    const batches = await this.prisma.batch.findMany({
      where: {
        currentQty: 0,
      },
      include: {
        drug: true,
        supplier: true,
        locationBatches: {
          include: { location: true },
        },
      },
      orderBy: [
        { purchaseDate: 'desc' }, // Most recently restocked first (most recently out of stock)
        { drug: { genericName: 'asc' } }, // Secondary sort by drug name for consistency
      ],
      skip: offset,
      take: limit,
    });
    return batches.map((b) => {
      // Get location names (comma-separated if multiple)
      const locationNames = b.locationBatches
        .map((lb) => lb.location.name)
        .join(', ') || undefined;

      return {
        genericName: b.drug.tradeName ?? b.drug.genericName,
        tradeName: b.drug.tradeName || undefined,
        sku: b.drug.sku || undefined,
        batchNumber: b.batchNumber ?? b.id.toString(),
        expiryDate: b.expiryDate?.toISOString().split('T')[0] || undefined,
        quantity: b.currentQty, // Use batch.currentQty for consistency
        location: locationNames,
        unitPrice: b.unitCost,
        lastRestock: b.purchaseDate?.toISOString().split('T')[0] || undefined,
        supplier: b.supplier.name,
        orderedQty: 0,
      };
    });
  }

  private async expiredProducts(
    limit: number,
    offset: number,
  ): Promise<ProductDto[]> {
    // Sort by expiry date (most recently expired first) then by quantity (highest first)
    // This prioritizes recently expired items with high stock value
    const batches = await this.prisma.batch.findMany({
      where: {
        expiryDate: { lt: new Date() },
        currentQty: { gt: 0 }, // Only include batches with remaining stock (matches dashboard)
      },
      include: {
        drug: true,
        supplier: true,
        locationBatches: {
          include: { location: true },
        },
      },
      orderBy: [
        { expiryDate: 'desc' }, // Most recently expired first (most urgent)
        { currentQty: 'desc' }, // Then by quantity (highest first - most value at risk)
      ],
      skip: offset,
      take: limit,
    });
    return batches.map((b) => {
      // Get location names (comma-separated if multiple)
      const locationNames = b.locationBatches
        .map((lb) => lb.location.name)
        .join(', ') || undefined;

      return {
        genericName: b.drug.tradeName ?? b.drug.genericName,
        tradeName: b.drug.tradeName || undefined,
        sku: b.drug.sku || undefined,
        batchNumber: b.batchNumber ?? b.id.toString(),
        expiryDate: b.expiryDate?.toISOString().split('T')[0] || undefined,
        quantity: b.currentQty, // Use batch.currentQty for consistency
        location: locationNames,
        unitPrice: b.unitCost,
        lastRestock: b.purchaseDate?.toISOString().split('T')[0] || undefined,
        supplier: b.supplier.name,
        orderedQty: 0,
      };
    });
  }

  private async soonToExpireProducts(
    days: number,
    limit: number,
    offset: number,
  ): Promise<ProductDto[]> {
    // Uses current date (not time-filtered) to match card calculation
    // Sort by expiry date (soonest first) to prioritize items expiring soonest
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const batches = await this.prisma.batch.findMany({
      where: {
        expiryDate: { gte: now, lte: until },
        currentQty: { gt: 0 }, // Only include batches with remaining stock (matches dashboard)
      },
      include: {
        drug: true,
        supplier: true,
        locationBatches: {
          include: { location: true },
        },
      },
      orderBy: [
        { expiryDate: 'asc' }, // Soonest expiry first (most urgent)
        { currentQty: 'desc' }, // Then by quantity (highest first - most value at risk)
      ],
      skip: offset,
      take: limit,
    });
    return batches.map((b) => {
      // Get location names (comma-separated if multiple)
      const locationNames = b.locationBatches
        .map((lb) => lb.location.name)
        .join(', ') || undefined;

      return {
        genericName: b.drug.tradeName ?? b.drug.genericName,
        tradeName: b.drug.tradeName || undefined,
        sku: b.drug.sku || undefined,
        batchNumber: b.batchNumber ?? b.id.toString(),
        expiryDate: b.expiryDate?.toISOString().split('T')[0] || undefined,
        quantity: b.currentQty, // Use batch.currentQty for consistency
        location: locationNames,
        unitPrice: b.unitCost,
        lastRestock: b.purchaseDate?.toISOString().split('T')[0] || undefined,
        supplier: b.supplier.name,
        orderedQty: 0,
      };
    });
  }

  private async soonToBeOutOfStockProducts(
    limit: number,
    offset: number,
  ): Promise<ProductDto[]> {
    // Use batch-level filtering with batch.lowStockThreshold to match card logic
    // Exclude batches with currentQty = 0 (out of stock)
    // Show batches where currentQty > 0 AND currentQty <= batch.lowStockThreshold
    const batches = await this.prisma.batch.findMany({
      where: {
        currentQty: {
          gt: 0, // Exclude out of stock batches
        },
      },
      include: {
        drug: true,
        supplier: true,
        locationBatches: {
          include: { location: true },
        },
      },
    });

    // Filter batches where currentQty <= lowStockThreshold (matches card calculation)
    const lowStockBatches = batches.filter(
      (b) => b.currentQty > 0 && b.currentQty <= b.lowStockThreshold,
    );

    // Sort by quantity (lowest first) to prioritize items closest to being out of stock
    // Secondary sort by how close to threshold (currentQty / lowStockThreshold) for items with same quantity
    lowStockBatches.sort((a, b) => {
      // Primary sort: by quantity (ascending - lowest first)
      if (a.currentQty !== b.currentQty) {
        return a.currentQty - b.currentQty;
      }
      // Secondary sort: by threshold ratio (ascending - closest to threshold first)
      const ratioA = a.currentQty / a.lowStockThreshold;
      const ratioB = b.currentQty / b.lowStockThreshold;
      return ratioA - ratioB;
    });

    // Paginate
    const paginated = lowStockBatches.slice(offset, offset + limit);

    return paginated.map((b) => {
      // Get location names (comma-separated if multiple)
      const locationNames = b.locationBatches
        .map((lb) => lb.location.name)
        .join(', ') || undefined;

      return {
        genericName: b.drug.tradeName ?? b.drug.genericName,
        tradeName: b.drug.tradeName || undefined,
        sku: b.drug.sku || undefined,
        batchNumber: b.batchNumber ?? b.id.toString(),
        expiryDate: b.expiryDate?.toISOString().split('T')[0] || undefined,
        quantity: b.currentQty, // Use batch.currentQty for consistency
        location: locationNames,
        unitPrice: b.unitCost,
        lastRestock: b.purchaseDate?.toISOString().split('T')[0] || undefined,
        supplier: b.supplier.name,
        orderedQty: 0,
      };
    });
  }

  private async fastMovingProductsInRange(
    start: Date,
    end: Date,
    limit: number,
    offset: number,
  ): Promise<ProductDto[]> {
    const result = await this.prisma.transaction.groupBy({
      by: ['batchId'],
      _sum: { quantity: true },
      where: {
        transactionType: {
          in: [...AnalyticsService.SALE_TYPES],
          mode: 'insensitive',
        },
        status: 'approved',
        transactionDate: { gte: start, lt: end },
      },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit + offset,
    });
    const paginated = result.slice(offset);
    const withDetails = await Promise.all(
      paginated.map(async (r) => {
        const batch = await this.prisma.batch.findUnique({
          where: { id: r.batchId },
          include: {
            drug: true,
            locationBatches: {
              include: { location: true },
            },
            supplier: true,
          },
        });
        if (!batch) return null;
        // Use batch.currentQty instead of locationBatches.quantity
        const currentQty = batch.currentQty;
        // Get location names (comma-separated if multiple)
        const locationNames = batch.locationBatches
          .map((lb) => lb.location.name)
          .join(', ') || undefined;

        return {
          genericName: batch.drug.tradeName ?? batch.drug.genericName,
          tradeName: batch.drug.tradeName || undefined,
          sku: batch.drug.sku || undefined,
          batchNumber: batch.batchNumber ?? batch.id.toString(),
          expiryDate:
            batch.expiryDate?.toISOString().split('T')[0] || undefined,
          quantity: currentQty,
          location: locationNames,
          unitPrice: batch.unitCost,
          lastRestock: batch.purchaseDate?.toISOString().split('T')[0] || undefined,
          supplier: batch.supplier.name,
          orderedQty: r._sum.quantity || 0,
        };
      }),
    );
    return withDetails.filter((p) => p !== null) as ProductDto[];
  }

  private async slowMovingProductsInRange(
    start: Date,
    end: Date,
    limit: number,
    offset: number,
  ): Promise<ProductDto[]> {
    // Get all batches that have some stock (use currentQty for consistency)
    const batchesWithStock = await this.prisma.batch.findMany({
      where: {
        currentQty: { gt: 0 }, // Use currentQty instead of locationBatches
      },
      include: {
        drug: true,
        locationBatches: {
          include: { location: true },
        },
        supplier: true,
      },
    });

    // Get sales data for the period (only approved sales)
    const salesData = await this.prisma.transaction.groupBy({
      by: ['batchId'],
      _sum: { quantity: true },
      where: {
        transactionType: {
          in: [...AnalyticsService.SALE_TYPES],
          mode: 'insensitive',
        },
        status: 'approved',
        transactionDate: { gte: start, lt: end },
      },
    });

    const salesMap = new Map(
      salesData.map((s) => [s.batchId, s._sum.quantity || 0]),
    );

    // Sort batches by sales quantity (ascending), with unsold items first
    // Include ALL batches with stock, even if they have no sales (soldQty = 0)
    // Secondary sort by purchase date (oldest first) - if sales are equal, older stock is worse performing
    const sortedBatches = batchesWithStock
      .map((b) => ({
        batch: b,
        soldQty: salesMap.get(b.id) || 0,
      }))
      .sort((a, b) => {
        // Primary sort: by sales quantity (ascending - lowest first)
        if (a.soldQty !== b.soldQty) {
          return a.soldQty - b.soldQty;
        }
        // Secondary sort: by purchase date (ascending - oldest first)
        // If sales are equal, the product that's been in stock longer is worse performing
        const dateA = a.batch.purchaseDate.getTime();
        const dateB = b.batch.purchaseDate.getTime();
        return dateA - dateB;
      })
      .slice(offset, offset + limit);

    return sortedBatches.map(({ batch, soldQty }) => {
      // Get location names (comma-separated if multiple)
      const locationNames = batch.locationBatches
        .map((lb) => lb.location.name)
        .join(', ') || undefined;

      return {
        genericName: batch.drug.tradeName ?? batch.drug.genericName,
        tradeName: batch.drug.tradeName || undefined,
        sku: batch.drug.sku || undefined,
        batchNumber: batch.batchNumber ?? batch.id.toString(),
        expiryDate: batch.expiryDate?.toISOString().split('T')[0] || undefined,
        quantity: batch.currentQty, // Use batch.currentQty for consistency
        location: locationNames,
        unitPrice: batch.unitCost,
        lastRestock: batch.purchaseDate?.toISOString().split('T')[0] || undefined,
        supplier: batch.supplier.name,
        orderedQty: soldQty, // This is the sales quantity (soldQty)
      };
    });
  }

  async getAnalytics(
    query: AnalyticsQueryDto = {},
  ): Promise<AnalyticsResponse> {
    const {
      timeFilter,
      startIso,
      endIso,
      dateIso,
      topPerformersSort = TopPerformersSort.Volume,
      topPerformersOrder = SortOrder.Desc,
      topSuppliersSort = TopSuppliersSort.Volume,
      topSuppliersOrder = SortOrder.Desc,
    } = query;

    const { currentStart, currentEnd, prevStart, prevEnd } = this.computeRanges(
      timeFilter,
      startIso,
      endIso,
      dateIso,
    );

    // Unified limit for table-like sections
    const tableLimit = 10;

    const mostSoldRows = await this.mostSoldDrugsInRange(
      currentStart,
      currentEnd,
      tableLimit,
    );
    const topMetricValue =
      mostSoldRows.length > 0
        ? `${mostSoldRows[0].drugName} (${mostSoldRows[0].soldQty})`
        : 'None';

    const revenueCurrent = await this.revenueInRange(currentStart, currentEnd);
    const revenuePrev = await this.revenueInRange(prevStart, prevEnd);

    const profitCurrent = await this.profitInRange(currentStart, currentEnd);
    const profitPrev = await this.profitInRange(prevStart, prevEnd);

    const soldCurrent = await this.soldQtyInRange(currentStart, currentEnd);
    const soldPrev = await this.soldQtyInRange(prevStart, prevEnd);

    const receivedCurrent = await this.receivedQtyInRange(
      currentStart,
      currentEnd,
    );
    const receivedPrev = await this.receivedQtyInRange(prevStart, prevEnd);

    const transactionsCurrent = await this.totalTransactionsInRange(
      currentStart,
      currentEnd,
    );
    const transactionsPrev = await this.totalTransactionsInRange(
      prevStart,
      prevEnd,
    );

    const avgPriceCurrent = await this.avgSaleValuePerUnitInRange(
      currentStart,
      currentEnd,
    );
    const avgPricePrev = await this.avgSaleValuePerUnitInRange(
      prevStart,
      prevEnd,
    );

    const soldCostCurrent = await this.soldCostInRange(
      currentStart,
      currentEnd,
    );
    const receivedValueCurrent = await this.receivedValueInRange(
      currentStart,
      currentEnd,
    );

    const totalStockValueCurrent = await this.totalStockValue();
    const totalItemsCurrent = await this.totalItems();
    // Expired and expiring items use current date (not time-filtered)
    const expiredItemsCurrent = await this.expiredBatchesCount();
    const expiring30Current = await this.expiringInDays(30);
    const lowStockCurrent = await this.lowStockCount();
    const delayedPoCurrent = await this.delayedPurchaseOrders();
    const outOfStockCurrent = await this.outOfStockCount();
    const totalSuppliers = await this.totalSuppliers();

    const mostOrderedProducts = await this.mostOrderedProductsInRange(
      currentStart,
      currentEnd,
      tableLimit,
    );
    // Always return top 10 suppliers by volume for Supply tab
    const topSuppliers = await this.topSuppliers(
      10,
      TopSuppliersSort.Volume,
      SortOrder.Desc,
    );
    const topPerformers = await this.topPerformersInRange(
      currentStart,
      currentEnd,
      tableLimit,
      topPerformersSort,
      topPerformersOrder,
    );

    const incompleteCount = await this.incompletePurchaseOrdersCount();
    const incompleteBreakdown = await this.incompletePurchaseOrdersBreakdown();

    const totalItemsPrevEst = totalItemsCurrent - receivedCurrent + soldCurrent;
    const totalStockValuePrevEst =
      totalStockValueCurrent - receivedValueCurrent + soldCostCurrent;

    const pctChange = (prev: number, curr: number) => {
      if (prev === 0) {
        return curr === 0 ? 0 : 100;
      }
      return ((curr - prev) / prev) * 100;
    };

    const revenueChangePct = pctChange(revenuePrev, revenueCurrent);
    const revenueTrendUp = revenueCurrent >= revenuePrev;

    const profitChangePct = pctChange(profitPrev, profitCurrent);
    const profitTrendUp = profitCurrent >= profitPrev;

    const soldChangePct = pctChange(soldPrev, soldCurrent);
    const soldTrendUp = soldCurrent >= soldPrev;

    const transactionsChangePct = pctChange(
      transactionsPrev,
      transactionsCurrent,
    );
    const transactionsTrendUp = transactionsCurrent >= transactionsPrev;

    const avgPriceChangePct = pctChange(avgPricePrev, avgPriceCurrent);
    const avgPriceTrendUp = avgPriceCurrent >= avgPricePrev;

    const totalItemsChangePct = pctChange(totalItemsPrevEst, totalItemsCurrent);
    const totalItemsTrendUp = totalItemsCurrent >= totalItemsPrevEst;

    const totalStockValueChangePct = pctChange(
      totalStockValuePrevEst,
      totalStockValueCurrent,
    );
    const totalStockValueTrendUp =
      totalStockValueCurrent >= totalStockValuePrevEst;

    const netInflowCurrent = receivedCurrent - soldCurrent;
    // Compute previous-period low/out-of-stock counts by rolling back current quantities using flows after prevEnd
    const { lowStockPrev, outOfStockPrev } = await this.estimatePrevCountsAsOf(
      prevEnd,
      currentEnd,
    );
    const lowStockTrendUp = lowStockCurrent <= lowStockPrev;
    const outOfStockTrendUp = outOfStockCurrent <= outOfStockPrev;
    // Expired items are not time-filtered, so trend is always neutral (no comparison)
    const expiredItemsTrendUp = true;
    const delayedPoTrendUp = delayedPoCurrent === 0;

    // Distribution by category is not time-based (shows current stock and all-time sold)
    const distribution = await this.distributionByCategory();
    // Pass time range to monthlyStockedVsSold to respect the time filter
    // Calculate months based on the time range, or default to 12 months if range is too large
    const daysDiff = Math.ceil(
      (currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const monthsInRange = Math.max(1, Math.ceil(daysDiff / 30));
    const monthly = await this.monthlyStockedVsSold(
      monthsInRange > 12 ? 12 : monthsInRange,
      currentStart,
      currentEnd,
    );

    const outOfStockProducts = await this.outOfStockProducts(tableLimit, 0);
    const expiredProducts = await this.expiredProducts(tableLimit, 0);
    // Uses current date (not time-filtered) to match card calculation
    const soonToExpireProducts = await this.soonToExpireProducts(
      30,
      tableLimit,
      0,
    );
    const soonToBeOutOfStockProducts = await this.soonToBeOutOfStockProducts(
      tableLimit,
      0,
    );
    const fastMovingProducts = await this.fastMovingProductsInRange(
      currentStart,
      currentEnd,
      tableLimit,
      0,
    );
    const slowMovingProducts = await this.slowMovingProductsInRange(
      currentStart,
      currentEnd,
      tableLimit,
      0,
    );

    // Calculate yearly sales for line graph
    const yearlySales = await this.yearlySales();

    // Calculate supply cards metrics
    const activeSuppliersCount = await this.activeSuppliersCount(180); // Last 180 days
    const totalPurchasesETB = await this.totalPurchasesETB();
    const topSuppliersList = await this.topSuppliers(1, TopSuppliersSort.Volume, SortOrder.Desc)
    const topSupplierName = topSuppliersList.length > 0
      ? topSuppliersList[0].name
      : 'None';
    const onTimeDeliveryRate = await this.onTimeDeliveryRate();
    const mostOrderedProductForSupply = mostOrderedProducts.length > 0
      ? `${mostOrderedProducts[0].tradeName ?? mostOrderedProducts[0].genericName} (${mostOrderedProducts[0].orderedQty})`
      : 'None';

    const metrics: KeyMetric[] = [
      {
        label: 'Total Revenue',
        value: `${revenueCurrent.toFixed(2)} (+${revenueChangePct.toFixed(1)}%)`,
        trendUp: revenueTrendUp,
      },
      {
        label: 'Total Profit',
        value: `${profitCurrent.toFixed(2)} (+${profitChangePct.toFixed(1)}%)`,
        trendUp: profitTrendUp,
      },
      {
        label: 'Total Sales (qty)',
        value: soldCurrent,
        trendUp: soldTrendUp,
      },
      {
        label: 'Delayed Orders',
        value: delayedPoCurrent,
        trendUp: delayedPoTrendUp,
      },
      {
        label: 'Total Suppliers',
        value: totalSuppliers,
        trendUp: true,
      },
      {
        label: 'Incomplete Orders',
        value: incompleteCount,
        trendUp: incompleteCount === 0,
      },
      {
        label: 'Total Stock Value',
        value: `${totalStockValueCurrent.toFixed(2)} (+${totalStockValueChangePct.toFixed(1)}%)`,
        trendUp: totalStockValueTrendUp,
      },
      {
        label: 'Expiring in 30 days',
        value: expiring30Current,
        trendUp: true,
      },
      {
        label: 'Low Stock Items',
        value: lowStockCurrent,
        trendUp: lowStockTrendUp,
      },
      {
        label: 'Total Transactions',
        value: transactionsCurrent,
        trendUp: transactionsTrendUp,
      },
    ];

    const inventoryCards: KeyMetric[] = [
      {
        label: 'Total Items',
        value: totalItemsCurrent,
        trendUp: totalItemsTrendUp,
      },
      {
        label: 'Turnover Rate',
        value: `${((soldCurrent / Math.max(totalItemsCurrent, 1)) * 100).toFixed(1)}%`,
        trendUp: soldTrendUp,
      },
      {
        label: 'Expired Items',
        value: expiredItemsCurrent,
        trendUp: expiredItemsTrendUp,
      },
      {
        label: 'Expiring in 30 days',
        value: expiring30Current,
        trendUp: true,
      },
      {
        label: 'Low Stock Items',
        value: lowStockCurrent,
        trendUp: lowStockTrendUp,
      },
      {
        label: 'Top seller',
        value: topMetricValue,
        trendUp: mostSoldRows.length > 0 && mostSoldRows[0].soldQty > 0,
      },
      {
        label: 'Out of Stock',
        value: outOfStockCurrent,
        trendUp: outOfStockTrendUp,
      },
      {
        label: 'Avg Sale Value (per unit)',
        value: `${avgPriceCurrent.toFixed(2)} (+${avgPriceChangePct.toFixed(1)}%)`,
        trendUp: avgPriceTrendUp,
      },
      {
        label: 'Most Ordered Product',
        value:
          mostOrderedProducts.length > 0
            ? `${mostOrderedProducts[0].tradeName ?? mostOrderedProducts[0].genericName} (${mostOrderedProducts[0].orderedQty})`
            : 'None',
        trendUp:
          mostOrderedProducts.length > 0 &&
          mostOrderedProducts[0].orderedQty > 0,
      },
      {
        label: 'Incomplete Orders Breakdown',
        value: incompleteBreakdown,
        trendUp: incompleteCount === 0,
      },
    ];

    // Sales tab cards
    const fastestMovingProduct = fastMovingProducts.length > 0
      ? `${fastMovingProducts[0].tradeName ?? fastMovingProducts[0].genericName} (${fastMovingProducts[0].orderedQty})`
      : 'None';
    
    const topSellingProduct = mostSoldRows.length > 0
      ? `${mostSoldRows[0].drugName} (${mostSoldRows[0].soldQty})`
      : 'None';
    
    const worstPerformingProduct = slowMovingProducts.length > 0
      ? `${slowMovingProducts[0].tradeName ?? slowMovingProducts[0].genericName} (${slowMovingProducts[0].orderedQty})`
      : 'None';

    // Find top-selling category (highest soldQty)
    const topSellingCategory = distribution.length > 0
      ? distribution.reduce((top, current) => 
          current.soldQty > top.soldQty ? current : top
        )
      : null;
    const topCategoryValue = topSellingCategory
      ? `${topSellingCategory.category} (${topSellingCategory.soldQty})`
      : 'None';

    // Find month that sold the most from yearly sales data
    const topSellingMonth = yearlySales.length > 0
      ? yearlySales.reduce((top, current) => 
          current.sales > top.sales ? current : top
        )
      : null;
    
    // Convert YYYY-MM format to month name
    const getMonthName = (monthStr: string): string => {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const parts = monthStr.split('-');
      if (parts.length === 2) {
        const monthIndex = parseInt(parts[1], 10) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
          return monthNames[monthIndex];
        }
      }
      return monthStr; // Fallback to original format if parsing fails
    };
    
    const topMonthValue = topSellingMonth
      ? `${getMonthName(topSellingMonth.month)} (${topSellingMonth.sales})`
      : 'None';

    const salesCards: KeyMetric[] = [
      {
        label: 'Average sale value',
        value: `${avgPriceCurrent.toFixed(2)} (+${avgPriceChangePct.toFixed(1)}%)`,
        trendUp: avgPriceTrendUp,
      },
      {
        label: 'Fastest moving product',
        value: fastestMovingProduct,
        trendUp: fastMovingProducts.length > 0 && fastMovingProducts[0].orderedQty > 0,
      },
      {
        label: 'Top-selling product',
        value: topSellingProduct,
        trendUp: mostSoldRows.length > 0 && mostSoldRows[0].soldQty > 0,
      },
      {
        label: 'Worst-performing product',
        value: worstPerformingProduct,
        trendUp: slowMovingProducts.length > 0 && slowMovingProducts[0].orderedQty === 0,
      },
      {
        label: 'Total Sales Revenue',
        value: `${revenueCurrent.toFixed(2)} (+${revenueChangePct.toFixed(1)}%)`,
        trendUp: revenueTrendUp,
      },
      {
        label: 'Total Sales (qty)',
        value: `${soldCurrent} (+${soldChangePct.toFixed(1)}%)`,
        trendUp: soldTrendUp,
      },
      {
        label: 'Total Transactions',
        value: `${transactionsCurrent} (+${transactionsChangePct.toFixed(1)}%)`,
        trendUp: transactionsTrendUp,
      },
      {
        label: 'Total Profit',
        value: `${profitCurrent.toFixed(2)} (+${profitChangePct.toFixed(1)}%)`,
        trendUp: profitTrendUp,
      },
      {
        label: 'Top-selling category',
        value: topCategoryValue,
        trendUp: topSellingCategory !== null && topSellingCategory.soldQty > 0,
      },
      {
        label: 'Month that sold the most',
        value: topMonthValue,
        trendUp: topSellingMonth !== null && topSellingMonth.sales > 0,
      },
    ];

    // Supply tab cards
    const supplyCards: KeyMetric[] = [
      {
        label: 'Active Suppliers',
        value: `${activeSuppliersCount} (Suppliers used in last 180 days)`,
        trendUp: activeSuppliersCount > 0,
      },
      {
        label: 'Total Purchases (in ETB)',
        value: `${totalPurchasesETB.toFixed(2)}`,
        trendUp: totalPurchasesETB > 0,
      },
      {
        label: 'Top supplier',
        value: topSupplierName,
        trendUp: topSuppliersList.length > 0,
      },
      {
        label: 'On-Time Delivery Rate',
        value: `${onTimeDeliveryRate.toFixed(1)}%`,
        trendUp: onTimeDeliveryRate >= 80, // Consider 80%+ as good
      },
      {
        label: 'Most ordered product',
        value: mostOrderedProductForSupply,
        trendUp: mostOrderedProducts.length > 0 && mostOrderedProducts[0].orderedQty > 0,
      },
    ];

    return {
      metrics,
      inventoryCards,
      salesCards,
      supplyCards,
      distributionByCategory: distribution,
      monthlyStockedVsSold: monthly,
      yearlySales,
      topSuppliers,
      topPerformers,
      outOfStockProducts,
      expiredProducts,
      soonToBeOutOfStockProducts,
      soonToExpireProducts,
      fastMovingProducts,
      slowMovingProducts,
      mostOrderedProducts,
    };
  }
}
