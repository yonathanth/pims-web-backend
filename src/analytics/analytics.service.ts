import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeneralConfigsService } from '../general-configs/general-configs.service';
import {
  AnalyticsResponse,
  KeyMetric,
  CategorySlice,
  MonthlySeriesPoint,
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
    // Aggregate in DB to avoid loading entire tables into memory
    const result = await this.prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COALESCE(SUM(lb.quantity * b."unitCost"), 0) AS total
      FROM "batches" b
      JOIN "location_batches" lb ON lb."batchId" = b.id
    `;
    return result[0]?.total ?? 0;
  }

  private async totalItems(): Promise<number> {
    const result = await this.prisma.batch.aggregate({
      _sum: { currentQty: true },
    });
    return result._sum.currentQty || 0;
  }

  private async expiringInDays(
    days: number,
    referenceDate?: Date,
  ): Promise<number> {
    // If referenceDate is provided, use it; otherwise use current date
    // This allows calculating expiring items as of a specific date (e.g., end of time filter period)
    const refDate = referenceDate || new Date();
    const until = new Date(refDate.getTime() + days * 24 * 60 * 60 * 1000);
    return await this.prisma.batch.count({
      where: {
        expiryDate: {
          gte: refDate,
          lte: until,
        },
      },
    });
  }

  private async lowStockCount(threshold: number): Promise<number> {
    // Count drugs whose total quantity across all batches/locations is <= threshold
    const result = await this.prisma.$queryRaw<Array<{ id: number }>>`
      SELECT d.id
      FROM "drugs" d
      LEFT JOIN "batches" b ON b."drugId" = d.id
      LEFT JOIN "location_batches" lb ON lb."batchId" = b.id
      GROUP BY d.id
      HAVING COALESCE(SUM(lb.quantity), 0) <= ${threshold}
    `;
    return result.length;
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

  // Count expired batches as of a specific reference date
  private async expiredBatchesAsOf(asOf: Date): Promise<number> {
    return await this.prisma.batch.count({
      where: { expiryDate: { lt: asOf } },
    });
  }

  private async outOfStockCount(): Promise<number> {
    // Count drugs whose total quantity across all batches/locations equals 0
    const result = await this.prisma.$queryRaw<Array<{ id: number }>>`
      SELECT d.id
      FROM "drugs" d
      LEFT JOIN "batches" b ON b."drugId" = d.id
      LEFT JOIN "location_batches" lb ON lb."batchId" = b.id
      GROUP BY d.id
      HAVING COALESCE(SUM(lb.quantity), 0) = 0
    `;
    return result.length;
  }

  private async totalSuppliers(): Promise<number> {
    return await this.prisma.supplier.count();
  }

  // Snapshot helpers to support period-over-period trends without historical snapshots
  private async currentDrugQuantities(): Promise<Map<number, number>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ drugId: number; qty: number }>
    >`
      SELECT d.id as "drugId",
             COALESCE(CAST(SUM(lb.quantity) AS DOUBLE PRECISION), 0) AS qty
      FROM "drugs" d
      LEFT JOIN "batches" b ON b."drugId" = d.id
      LEFT JOIN "location_batches" lb ON lb."batchId" = b.id
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
    threshold: number,
  ): Promise<{ lowStockPrev: number; outOfStockPrev: number }> {
    const currentQty = await this.currentDrugQuantities();
    const flows = await this.drugFlowsAfter(prevEnd, currentEnd);
    let low = 0;
    let out = 0;
    currentQty.forEach((qtyNow, drugId) => {
      const f = flows.get(drugId) || { received: 0, sold: 0 };
      const prevQty = qtyNow - f.received + f.sold;
      if (prevQty <= 0) out += 1;
      else if (prevQty <= threshold) low += 1;
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
        batch: true,
        purchaseOrder: { include: { supplier: true } },
      },
      orderBy: { quantityOrdered: 'desc' },
      take: limit,
    });
    return items.map((item) => ({
      genericName: item.drug.tradeName ?? item.drug.genericName,
      tradeName: item.drug.tradeName || undefined,
      sku: item.drug.sku || undefined,
      batchNumber: item.batch?.batchNumber ?? (item.batch?.id.toString() || undefined),
      expiryDate:
        item.batch?.expiryDate?.toISOString().split('T')[0] || undefined,
      quantity: item.quantityReceived,
      location: undefined,
      unitPrice: item.unitCost,
      lastRestock: item.purchaseOrder.createdDate.toISOString().split('T')[0],
      supplier: item.purchaseOrder.supplier.name,
      orderedQty: item.quantityOrdered,
    }));
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
          include: { items: { include: { drug: true } } },
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
          po.items.reduce((s, i) => s + i.quantityReceived * i.unitCost, 0),
        0,
      );
      const ordersDelivered = s.purchaseOrders.filter(
        (po) => po.status.toLowerCase() === 'completed',
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

  private async distributionByCategory(
    start?: Date,
    end?: Date,
  ): Promise<CategorySlice[]> {
    const categories = await this.prisma.category.findMany({
      include: {
        drugs: {
          include: {
            batches: {
              include: { locationBatches: true },
            },
          },
        },
      },
    });
    return await Promise.all(
      categories.map(async (c) => {
        const stockQty = c.drugs.reduce(
          (sum, d) =>
            sum +
            d.batches.reduce(
              (s, b) =>
                s + b.locationBatches.reduce((lb, l) => lb + l.quantity, 0),
              0,
            ),
          0,
        );
        // Calculate soldQty from transactions via batch -> drug -> category relationship
        // Now filtered by time range if provided
        const batchIds = c.drugs.flatMap((d) => d.batches.map((b) => b.id));
        let soldQty = 0;
        if (batchIds.length > 0) {
          const whereClause: any = {
            transactionType: {
              in: [...AnalyticsService.SALE_TYPES],
              mode: 'insensitive',
            },
            status: 'approved',
            batchId: { in: batchIds },
          };
          // Add time filter if provided
          if (start || end) {
            whereClause.transactionDate = {};
            if (start) whereClause.transactionDate.gte = start;
            if (end) whereClause.transactionDate.lt = end;
          }
          const soldResult = await this.prisma.transaction.aggregate({
            _sum: { quantity: true },
            where: whereClause,
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
      // Stocked: sum of 'receive'/'in' transactions in this month
      const stockedAgg = await this.prisma.transaction.aggregate({
        _sum: { quantity: true },
        where: {
          transactionType: {
            in: [...AnalyticsService.RECEIVE_TYPES],
            mode: 'insensitive',
          },
          transactionDate: { gte: m.start, lt: m.end },
        },
      });
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
        stocked: stockedAgg._sum.quantity || 0,
        sold: soldAgg._sum.quantity || 0,
      });
    }
    return points;
  }

  private async outOfStockProducts(
    limit: number,
    offset: number,
  ): Promise<ProductDto[]> {
    const drugs = await this.prisma.drug.findMany({
      include: {
        batches: {
          include: { locationBatches: true },
        },
      },
    });
    const outOfStock = drugs.filter(
      (d) =>
        d.batches.reduce(
          (sum, b) =>
            sum + b.locationBatches.reduce((s, lb) => s + lb.quantity, 0),
          0,
        ) === 0,
    );
    const paginated = outOfStock.slice(offset, offset + limit);
    return paginated.map((d) => {
      const firstBatch =
        d.batches && d.batches.length > 0 ? d.batches[0] : undefined;
      return {
        genericName: d.tradeName ?? d.genericName,
        tradeName: d.tradeName || undefined,
        sku: d.sku || undefined,
        batchNumber: firstBatch?.batchNumber ?? (firstBatch?.id ? firstBatch.id.toString() : undefined),
        expiryDate: firstBatch?.expiryDate
          ? firstBatch.expiryDate.toISOString().split('T')[0]
          : undefined,
        quantity: 0,
        location: undefined,
        unitPrice: firstBatch?.unitCost ?? 0,
        lastRestock: undefined,
        supplier: undefined,
        orderedQty: 0,
      };
    });
  }

  private async expiredProducts(
    limit: number,
    offset: number,
  ): Promise<ProductDto[]> {
    const batches = await this.prisma.batch.findMany({
      where: {
        expiryDate: { lt: new Date() },
      },
      include: { drug: true, locationBatches: true },
      skip: offset,
      take: limit,
    });
    return batches.map((b) => ({
      genericName: b.drug.tradeName ?? b.drug.genericName,
      tradeName: b.drug.tradeName || undefined,
      sku: b.drug.sku || undefined,
      batchNumber: b.batchNumber ?? b.id.toString(),
      expiryDate: b.expiryDate?.toISOString().split('T')[0] || undefined,
      quantity: b.locationBatches.reduce((sum, lb) => sum + lb.quantity, 0),
      location: undefined,
      unitPrice: b.unitCost,
      lastRestock: undefined,
      supplier: undefined,
      orderedQty: 0,
    }));
  }

  private async soonToExpireProducts(
    days: number,
    limit: number,
    offset: number,
    referenceDate?: Date,
  ): Promise<ProductDto[]> {
    // If referenceDate is provided, use it; otherwise use current date
    // This allows calculating expiring items as of a specific date (e.g., end of time filter period)
    const refDate = referenceDate || new Date();
    const until = new Date(refDate.getTime() + days * 24 * 60 * 60 * 1000);
    const batches = await this.prisma.batch.findMany({
      where: {
        expiryDate: { gte: refDate, lte: until },
      },
      include: { drug: true, locationBatches: true },
      skip: offset,
      take: limit,
    });
    return batches.map((b) => ({
      genericName: b.drug.tradeName ?? b.drug.genericName,
      tradeName: b.drug.tradeName || undefined,
      sku: b.drug.sku || undefined,
      batchNumber: b.batchNumber ?? b.id.toString(),
      expiryDate: b.expiryDate?.toISOString().split('T')[0] || undefined,
      quantity: b.locationBatches.reduce((sum, lb) => sum + lb.quantity, 0),
      location: undefined,
      unitPrice: b.unitCost,
      lastRestock: undefined,
      supplier: undefined,
      orderedQty: 0,
    }));
  }

  private async soonToBeOutOfStockProducts(
    thresholdPct: number,
    limit: number,
    offset: number,
  ): Promise<ProductDto[]> {
    const drugs = await this.prisma.drug.findMany({
      include: {
        batches: {
          include: { locationBatches: true },
        },
      },
    });
    const lowStockDrugs = drugs.filter((d) => {
      const totalQty = d.batches.reduce(
        (sum, b) =>
          sum + b.locationBatches.reduce((s, lb) => s + lb.quantity, 0),
        0,
      );
      return totalQty > 0 && totalQty <= thresholdPct; // > 0 to exclude out of stock, <= threshold for low stock
    });
    const paginated = lowStockDrugs.slice(offset, offset + limit);
    return paginated.map((d) => {
      const totalQty = d.batches.reduce(
        (sum, b) =>
          sum + b.locationBatches.reduce((s, lb) => s + lb.quantity, 0),
        0,
      );
      const hasBatch = d.batches && d.batches.length > 0;
      return {
        genericName: d.tradeName ?? d.genericName,
        tradeName: d.tradeName || undefined,
        sku: d.sku || undefined,
        batchNumber: hasBatch ? (d.batches[0].batchNumber ?? d.batches[0].id.toString()) : undefined,
        expiryDate:
          hasBatch && d.batches[0].expiryDate
            ? d.batches[0].expiryDate.toISOString().split('T')[0]
            : undefined,
        quantity: totalQty,
        location: undefined,
        unitPrice: hasBatch ? d.batches[0].unitCost : 0,
        lastRestock: undefined,
        supplier: undefined,
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
          include: { drug: true, locationBatches: true },
        });
        if (!batch) return null;
        const currentQty = batch.locationBatches.reduce(
          (sum, lb) => sum + lb.quantity,
          0,
        );
        return {
          genericName: batch.drug.tradeName ?? batch.drug.genericName,
          tradeName: batch.drug.tradeName || undefined,
          sku: batch.drug.sku || undefined,
          batchNumber: batch.batchNumber ?? batch.id.toString(),
          expiryDate:
            batch.expiryDate?.toISOString().split('T')[0] || undefined,
          quantity: currentQty,
          location: undefined,
          unitPrice: batch.unitCost,
          lastRestock: undefined,
          supplier: undefined,
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
    // Get all batches that have some stock
    const batchesWithStock = await this.prisma.batch.findMany({
      where: {
        locationBatches: {
          some: {
            quantity: { gt: 0 },
          },
        },
      },
      include: { drug: true, locationBatches: true },
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
    const sortedBatches = batchesWithStock
      .map((b) => ({
        batch: b,
        soldQty: salesMap.get(b.id) || 0,
      }))
      .sort((a, b) => a.soldQty - b.soldQty)
      .slice(offset, offset + limit);

    return sortedBatches.map(({ batch, soldQty }) => {
      const currentQty = batch.locationBatches.reduce(
        (sum, lb) => sum + lb.quantity,
        0,
      );
      return {
        genericName: batch.drug.tradeName ?? batch.drug.genericName,
        tradeName: batch.drug.tradeName || undefined,
        sku: batch.drug.sku || undefined,
        batchNumber: batch.id.toString(),
        expiryDate: batch.expiryDate?.toISOString().split('T')[0] || undefined,
        quantity: currentQty,
        location: undefined,
        unitPrice: batch.unitCost,
        lastRestock: undefined,
        supplier: undefined,
        orderedQty: soldQty,
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
      lowStockThreshold,
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

    // Determine low stock threshold: prefer query override, else DB general config, else 10.
    let effectiveLowStockThreshold = lowStockThreshold;
    if (effectiveLowStockThreshold == null) {
      try {
        effectiveLowStockThreshold =
          await this.generalConfigs.getTypedValue<number>(
            'low_stock_threshold',
            'number',
          );
      } catch {
        effectiveLowStockThreshold = 10;
      }
    }

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
    const expiredItemsCurrent = await this.expiredBatchesAsOf(currentEnd);
    // Use currentEnd as reference to show items expiring within 30 days from the end of the selected period
    const expiring30Current = await this.expiringInDays(30, currentEnd);
    const lowStockCurrent = await this.lowStockCount(
      effectiveLowStockThreshold,
    );
    const delayedPoCurrent = await this.delayedPurchaseOrders();
    const outOfStockCurrent = await this.outOfStockCount();
    const totalSuppliers = await this.totalSuppliers();

    const mostOrderedProducts = await this.mostOrderedProductsInRange(
      currentStart,
      currentEnd,
      tableLimit,
    );
    const topSuppliers = await this.topSuppliers(
      tableLimit,
      topSuppliersSort,
      topSuppliersOrder,
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
      effectiveLowStockThreshold,
    );
    const lowStockTrendUp = lowStockCurrent <= lowStockPrev;
    const outOfStockTrendUp = outOfStockCurrent <= outOfStockPrev;
    // Compare expired batch counts at previous vs current period ends
    const prevExpiredItems = await this.expiredBatchesAsOf(prevEnd);
    const expiredItemsTrendUp = expiredItemsCurrent <= prevExpiredItems;
    const delayedPoTrendUp = delayedPoCurrent === 0;

    // Pass time range to distributionByCategory so soldQty respects the time filter
    const distribution = await this.distributionByCategory(
      currentStart,
      currentEnd,
    );
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
    // Use currentEnd as reference to show products expiring within 30 days from the end of selected period
    const soonToExpireProducts = await this.soonToExpireProducts(
      30,
      tableLimit,
      0,
      currentEnd,
    );
    const soonToBeOutOfStockProducts = await this.soonToBeOutOfStockProducts(
      effectiveLowStockThreshold,
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

    return {
      metrics,
      inventoryCards,
      distributionByCategory: distribution,
      monthlyStockedVsSold: monthly,
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
