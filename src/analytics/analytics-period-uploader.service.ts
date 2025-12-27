import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { AnalyticsService } from './analytics.service';
import { SalesService } from '../sales/sales.service';
import { GeneralConfigsService } from '../general-configs/general-configs.service';
import {
  AnalyticsResponse,
  KeyMetric,
  ProductDto,
  CategorySlice,
  MonthlySeriesPoint,
  TimeFilter,
} from './dto/analytics.dto';
import { PeriodType } from '../sales/dto/product-sales-query.dto';

const gzipAsync = promisify(gzip);

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

type PeriodSyncResult = {
  period: Period;
  outcome: 'uploaded' | 'skipped-no-change' | 'error' | 'disabled';
  message?: string;
  hash?: string;
  error?: string;
};

@Injectable()
export class AnalyticsPeriodUploaderService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsPeriodUploaderService.name);
  private previousHashes: Map<string, string> = new Map();
  private running = false;

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly salesService: SalesService,
    private readonly generalConfigs: GeneralConfigsService,
  ) {}

  async onModuleInit() {
    // Load persisted hashes from database
    try {
      const periods: Period[] = ['daily', 'weekly', 'monthly', 'yearly'];
      for (const period of periods) {
        const hashKey = `period_upload_hash_${period}`;
        const hashConfig = await this.generalConfigs
          .getTypedValue<string>(hashKey, 'string')
          .catch(() => null);

        if (hashConfig) {
          this.previousHashes.set(period, hashConfig);
          this.logger.debug(`Loaded persisted hash for ${period}: ${hashConfig}`);
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load persisted upload hashes:', error);
    }
  }

  // Sync every 6 hours
  @Cron('0 */6 * * *')
  async syncAllPeriodsScheduled() {
    await this.syncAllPeriods(false);
  }

  async syncAllPeriods(force = false): Promise<PeriodSyncResult[]> {
    if (this.running) {
      this.logger.debug('Previous sync still running, skipping this attempt');
      return [
        {
          period: 'daily',
          outcome: 'error',
          message: 'Previous sync still running',
        },
      ];
    }

    const periods: Period[] = ['daily', 'weekly', 'monthly', 'yearly'];
    const results: PeriodSyncResult[] = [];

    for (const period of periods) {
      try {
        this.logger.debug(`Starting sync for period: ${period}`);

        // Fetch analytics for this period
        const analytics = await this.fetchAnalyticsForPeriod(period);

        // Fetch sales for this period (top 10 for all periods)
        const sales = await this.fetchSalesForPeriod(period);

        // Upload both
        const result = await this.uploadPeriodData(
          period,
          analytics,
          sales,
          force,
        );
        results.push({ period, ...result });
      } catch (error: any) {
        this.logger.error(`Failed to sync ${period} period:`, error);
        results.push({
          period,
          outcome: 'error',
          message: error?.message || String(error),
          error: error?.message || String(error),
        });
      }
    }

    return results;
  }

  private async fetchAnalyticsForPeriod(period: Period): Promise<AnalyticsResponse> {
    const today = new Date();
    let timeFilter: TimeFilter;
    let startIso: string | undefined;
    let endIso: string | undefined;
    let dateIso: string | undefined;

    switch (period) {
      case 'daily':
        timeFilter = TimeFilter.Date;
        dateIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        break;
      case 'weekly':
        // Last 7 days
        timeFilter = TimeFilter.Custom;
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(today);
        weekEnd.setHours(23, 59, 59, 999);
        startIso = weekStart.toISOString();
        endIso = weekEnd.toISOString();
        break;
      case 'monthly':
        timeFilter = TimeFilter.Monthly;
        break;
      case 'yearly':
        timeFilter = TimeFilter.Yearly;
        break;
    }

    return await this.analyticsService.getAnalytics({
      timeFilter,
      startIso,
      endIso,
      dateIso,
    });
  }

  private async fetchSalesForPeriod(period: Period) {
    let periodType: PeriodType;

    switch (period) {
      case 'daily':
        periodType = PeriodType.DAILY;
        break;
      case 'weekly':
        periodType = PeriodType.WEEKLY;
        break;
      case 'monthly':
        periodType = PeriodType.MONTHLY;
        break;
      case 'yearly':
        periodType = PeriodType.YEARLY;
        break;
    }

    // Always limit to top 10 for all periods
    const result = await this.salesService.getProductSales({
      period: periodType,
      page: 1,
      limit: 10,
    });

    return result;
  }

  private async uploadPeriodData(
    period: Period,
    analytics: AnalyticsResponse,
    sales: any,
    force: boolean,
  ): Promise<Omit<PeriodSyncResult, 'period'>> {
    const baseUrl = process.env.REMOTE_ANALYTICS_BASE_URL;
    const apiKey = process.env.REMOTE_ANALYTICS_API_KEY;
    const pharmacyId = process.env.REMOTE_ANALYTICS_PHARMACY_ID;

    if (!baseUrl || !apiKey || !pharmacyId) {
      return {
        outcome: 'disabled',
        message: 'Missing remote analytics configuration (BASE_URL/API_KEY/PHARMACY_ID)',
      };
    }

    try {
      this.running = true;

      const payload = {
        period,
        analytics: this.mapAnalyticsPayload(analytics),
        sales: this.mapSalesPayload(sales, period),
        uploadedAt: new Date().toISOString(),
      };

      const json = JSON.stringify(payload);
      const hash = await this.sha256(json);
      const hashKey = period;

      // Add hash to payload
      const payloadWithHash = {
        ...payload,
        hash,
      };
      const jsonWithHash = JSON.stringify(payloadWithHash);

      // Check if changed
      if (!force && this.previousHashes.get(hashKey) === hash) {
        this.logger.debug(`No changes detected for ${period} period; skipping upload`);
        return {
          outcome: 'skipped-no-change',
          message: `No changes detected for ${period} period`,
          hash,
        };
      }

      // Compress payload with hash
      const compressed = await gzipAsync(Buffer.from(jsonWithHash, 'utf8'));
      const originalSize = Buffer.byteLength(jsonWithHash, 'utf8');
      const compressedSize = compressed.length;
      const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

      this.logger.debug(
        `Payload size for ${period}: ${originalSize} bytes → ${compressedSize} bytes (${compressionRatio}% reduction)`,
      );

      // Upload to cloud API
      const url = `${baseUrl.replace(/\/$/, '')}/api/sync/period/${encodeURIComponent(pharmacyId)}/${period}`;
      
      this.logger.log(`🚀 Uploading ${period} data to: ${url}`);
      this.logger.log(`📦 Payload size: ${compressed.length} bytes (compressed)`);
      this.logger.log(`🔑 Using API key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING'}`);

      try {
        const response = await axios.post(url, compressed, {
          headers: {
            'x-api-key': apiKey,
            'content-type': 'application/octet-stream', // Use octet-stream for binary gzip data
            // Don't set content-encoding: gzip - that's for HTTP responses, not requests
            // The server will detect gzip by magic bytes (1f 8b)
          },
          timeout: 60000,
          validateStatus: (s) => s >= 200 && s < 300,
        });
        
        this.logger.log(`✅ Upload successful for ${period}. Status: ${response.status}`);
        this.logger.log(`📥 Response: ${JSON.stringify(response.data)}`);

        // Update hash
        this.previousHashes.set(hashKey, hash);

        // Persist hash to database
        try {
          const hashConfigKey = `period_upload_hash_${period}`;
          await this.generalConfigs.setTypedValue(hashConfigKey, hash, 'string');
          this.logger.debug(`Persisted hash for ${period} period to database`);
        } catch (error) {
          this.logger.warn(`Failed to persist hash for ${period} period:`, error);
        }

        this.logger.log(`Successfully synced ${period} period data`);
        return {
          outcome: 'uploaded',
          message: `Successfully synced ${period} period data`,
          hash,
        };
      } catch (err: any) {
        const httpStatus =
          typeof err?.response?.status === 'number' ? err.response.status : null;
        const axiosCode = err?.code || null;
        const msg = err?.message || String(err);
        const responseData = err?.response?.data ? JSON.stringify(err.response.data) : 'No response data';

        this.logger.error(`❌ Upload failed for ${period} period:`);
        this.logger.error(`   Status: ${httpStatus || axiosCode || 'unknown'}`);
        this.logger.error(`   Message: ${msg}`);
        this.logger.error(`   Response: ${responseData}`);
        this.logger.error(`   URL: ${url}`);
        if (err?.response) {
          this.logger.error(`   Response headers: ${JSON.stringify(err.response.headers)}`);
        }

        return {
          outcome: 'error',
          message: `Upload failed: ${msg}`,
          error: msg,
        };
      } finally {
        this.running = false;
      }
    } catch (err: any) {
      this.running = false;
      const msg = err?.message || String(err);
      this.logger.error(`❌ Fatal error in uploadPeriodData for ${period}: ${msg}`);
      return {
        outcome: 'error',
        message: `Fatal error: ${msg}`,
        error: msg,
      };
    }
  }

  private mapAnalyticsPayload(a: AnalyticsResponse) {
    return {
      // General cards (summary cards above tabs)
      metrics: a.metrics.map(this.mapKeyMetric),

      // Inventory tab data
      inventory_cards: a.inventoryCards.map(this.mapKeyMetric),
      distribution_by_category: a.distributionByCategory.map(this.mapCategorySlice),
      monthly_stocked_vs_sold: a.monthlyStockedVsSold.map(this.mapMonthlyPoint),
      out_of_stock_products: a.outOfStockProducts.map(this.mapProduct),
      expired_products: a.expiredProducts.map(this.mapProduct),
      soon_to_be_out_of_stock_products: a.soonToBeOutOfStockProducts.map(
        this.mapProduct,
      ),
      soon_to_expire_products: a.soonToExpireProducts.map(this.mapProduct),

      // Sales tab data
      sales_cards: a.salesCards.map(this.mapKeyMetric),
      yearly_sales: a.yearlySales.map((y) => ({
        month: y.month,
        sales: y.sales,
      })),
      fast_moving_products: a.fastMovingProducts.map(this.mapProduct),
      slow_moving_products: a.slowMovingProducts.map(this.mapProduct),

      // Supply tab data
      supply_cards: a.supplyCards.map(this.mapKeyMetric),
    };
  }

  private mapSalesPayload(sales: any, period: Period) {
    return {
      summary: sales.summary,
      products: sales.products, // Top 10 for all periods
      period,
    };
  }

  private mapKeyMetric(m: KeyMetric) {
    return {
      label: m.label,
      value: m.value,
      trend_up: m.trendUp,
    };
  }

  private mapCategorySlice(c: CategorySlice) {
    return {
      category: c.category,
      stock_qty: c.stockQty,
      sold_qty: c.soldQty,
    };
  }

  private mapMonthlyPoint(p: MonthlySeriesPoint) {
    return {
      month: p.month,
      stocked: p.stocked,
      sold: p.sold,
    };
  }

  private mapProduct(p: ProductDto) {
    return {
      generic_name: p.genericName,
      trade_name: p.tradeName ?? null,
      sku: p.sku ?? null,
      batch_number: p.batchNumber ?? null,
      expiry_date: p.expiryDate ?? null,
      quantity: p.quantity,
      location: p.location ?? null,
      unit_price: p.unitPrice,
      last_restock: p.lastRestock ?? null,
      supplier: p.supplier ?? null,
    };
  }

  private async sha256(text: string): Promise<string> {
    const crypto = await import('node:crypto');
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  getStatus(): { running: boolean; lastHashes: Record<string, string> } {
    return {
      running: this.running,
      lastHashes: Object.fromEntries(this.previousHashes),
    };
  }
}

