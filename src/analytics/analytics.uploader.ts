import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPeriodUploaderService } from './analytics-period-uploader.service';
import { GeneralConfigsService } from '../general-configs/general-configs.service';
import {
  AnalyticsResponse,
  KeyMetric,
  ProductDto,
  SupplierSummary,
  TopPerformerDto,
  CategorySlice,
  MonthlySeriesPoint,
  TimeFilter,
} from './dto/analytics.dto';
import {
  AnalyticsUploadStatusDto,
  UploadOutcome,
} from './dto/analytics-upload-status.dto';

type UploadAttemptResult = {
  outcome: UploadOutcome;
  message?: string;
};

type UploadStatusState = Omit<AnalyticsUploadStatusDto, 'running'>;

@Injectable()
export class AnalyticsUploaderService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsUploaderService.name);
  private previousHash: string | null = null;
  private running = false;
  private readonly status: UploadStatusState = {
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastHash: null,
    lastResponseCode: null,
    lastDurationMs: null,
    lastSkipReason: null,
    lastError: null,
  };
  private readonly CONFIG_KEY_LAST_SUCCESS = 'analytics_upload_last_success_at';
  private readonly CONFIG_KEY_LAST_HASH = 'analytics_upload_last_hash';

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly periodUploader: AnalyticsPeriodUploaderService,
    private readonly generalConfigs: GeneralConfigsService,
  ) {}

  async onModuleInit() {
    // Load persisted lastSuccessAt and hash from database
    try {
      const lastSuccessConfig = await this.generalConfigs
        .getTypedValue<string>(this.CONFIG_KEY_LAST_SUCCESS, 'string')
        .catch(() => null);
      const lastHashConfig = await this.generalConfigs
        .getTypedValue<string>(this.CONFIG_KEY_LAST_HASH, 'string')
        .catch(() => null);

      if (lastSuccessConfig) {
        this.status.lastSuccessAt = lastSuccessConfig;
        this.logger.debug(`Loaded persisted lastSuccessAt: ${lastSuccessConfig}`);
      }
      if (lastHashConfig) {
        this.previousHash = lastHashConfig;
        this.status.lastHash = lastHashConfig;
        this.logger.debug(`Loaded persisted lastHash: ${lastHashConfig}`);
      }
    } catch (error) {
      this.logger.warn('Failed to load persisted upload status:', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async pushIfChanged() {
    // Delegate to period uploader for daily period (new format)
    this.logger.log('🔄 Old uploader cron triggered - delegating to period uploader for daily sync');
    const attemptStart = Date.now();
    this.status.lastAttemptAt = new Date().toISOString();
    this.running = true;
    
    try {
      const results = await this.periodUploader.syncAllPeriods(false);
      const dailyResult = results.find((r: any) => r.period === 'daily');
      
      this.status.lastDurationMs = Date.now() - attemptStart;
      
      if (dailyResult?.outcome === 'uploaded') {
        this.status.lastSuccessAt = new Date().toISOString();
        this.status.lastHash = dailyResult.hash || null;
        this.status.lastResponseCode = 200;
        this.status.lastError = null;
        this.logger.log('✅ Period sync completed via old uploader cron');
      } else if (dailyResult?.outcome === 'skipped-no-change') {
        this.status.lastSkipReason = 'no-change';
        this.status.lastHash = dailyResult.hash || null;
        this.logger.log('⏭️ Period sync skipped (no changes) via old uploader cron');
      } else {
        this.status.lastError = dailyResult?.message || 'Period sync failed';
        this.logger.error(`❌ Period sync failed via old uploader cron: ${this.status.lastError}`);
      }
    } catch (error: any) {
      this.status.lastError = error.message || String(error);
      this.status.lastDurationMs = Date.now() - attemptStart;
      this.logger.error(`❌ Period sync failed via old uploader cron: ${this.status.lastError}`);
    } finally {
      this.running = false;
    }
  }

  async triggerUpload(force = false): Promise<UploadAttemptResult> {
    // Delegate to period uploader for daily period (new format)
    this.logger.log(`🔄 Manual upload triggered - delegating to period uploader (force=${force})`);
    const attemptStart = Date.now();
    this.status.lastAttemptAt = new Date().toISOString();
    this.running = true;
    this.status.lastError = null;
    this.status.lastSkipReason = null;
    
    try {
      const results = await this.periodUploader.syncAllPeriods(force);
      const dailyResult = results.find((r: any) => r.period === 'daily');
      
      this.status.lastDurationMs = Date.now() - attemptStart;
      
      if (dailyResult?.outcome === 'uploaded') {
        this.status.lastSuccessAt = new Date().toISOString();
        this.status.lastHash = dailyResult.hash || null;
        this.status.lastResponseCode = 200;
        return {
          outcome: dailyResult.outcome as UploadOutcome,
          message: dailyResult.message || 'Period sync completed',
        };
      } else if (dailyResult?.outcome === 'skipped-no-change') {
        this.status.lastSkipReason = 'no-change';
        this.status.lastHash = dailyResult.hash || null;
        return {
          outcome: 'skipped-no-change',
          message: dailyResult.message || 'No changes detected',
        };
      } else {
        this.status.lastError = dailyResult?.message || 'Period sync failed';
        return {
          outcome: dailyResult?.outcome as UploadOutcome || 'error',
          message: dailyResult?.message || 'Period sync failed',
        };
      }
    } catch (error: any) {
      this.status.lastError = error.message || String(error);
      this.status.lastDurationMs = Date.now() - attemptStart;
      this.logger.error(`❌ Period sync failed: ${this.status.lastError}`);
      return {
        outcome: 'error',
        message: `Period sync failed: ${error.message}`,
      };
    } finally {
      this.running = false;
    }
  }

  getStatus(): AnalyticsUploadStatusDto {
    // Get status from period uploader for daily period
    const periodStatus = this.periodUploader.getStatus();
    
    // Merge period uploader status with old format for backward compatibility
    return {
      running: periodStatus.running || this.running,
      lastAttemptAt: this.status.lastAttemptAt,
      lastSuccessAt: this.status.lastSuccessAt,
      lastHash: periodStatus.lastHashes?.daily || this.status.lastHash,
      lastResponseCode: this.status.lastResponseCode,
      lastDurationMs: this.status.lastDurationMs,
      lastSkipReason: this.status.lastSkipReason,
      lastError: this.status.lastError,
    };
  }

  private async runUpload(force: boolean): Promise<UploadAttemptResult> {
    if (this.running) {
      this.logger.debug('Previous upload still running, skipping this tick');
      this.status.lastSkipReason = 'already-running';
      return {
        outcome: 'skipped-running',
        message: 'Previous upload still running',
      };
    }

    const baseUrl = process.env.REMOTE_ANALYTICS_BASE_URL;
    const apiKey = process.env.REMOTE_ANALYTICS_API_KEY;
    const pharmacyId = process.env.REMOTE_ANALYTICS_PHARMACY_ID;

    if (!baseUrl || !apiKey || !pharmacyId) {
      this.logger.warn(
        'Uploader disabled: missing REMOTE_ANALYTICS_BASE_URL or REMOTE_ANALYTICS_API_KEY or REMOTE_ANALYTICS_PHARMACY_ID',
      );
      this.status.lastError =
        'Missing remote analytics configuration (BASE_URL/API_KEY/PHARMACY_ID)';
      this.status.lastSkipReason = 'missing-env';
      return {
        outcome: 'disabled',
        message: this.status.lastError,
      };
    }

    const attemptStart = Date.now();
    // Construct URL outside try block so it's accessible in catch
    const url = `${baseUrl.replace(/\/$/, '')}/api/analytics/${encodeURIComponent(pharmacyId)}`;
    try {
      this.running = true;
      this.status.lastAttemptAt = new Date().toISOString();
      this.status.lastError = null;
      this.status.lastSkipReason = null;
      this.status.lastDurationMs = null;
      this.status.lastResponseCode = null;

      // Get today's date in ISO format (YYYY-MM-DD) for daily snapshot
      const today = new Date();
      const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      this.logger.debug(`Fetching daily analytics snapshot for date: ${todayISO}`);
      
      // Get analytics snapshot for exact current date (not last 24 hours)
      let analytics: AnalyticsResponse;
      try {
        analytics = await this.analyticsService.getAnalytics({
          timeFilter: TimeFilter.Date,
          dateIso: todayISO,
        });
      } catch (error: any) {
        this.logger.error(`Failed to fetch analytics data: ${error?.message || String(error)}`);
        throw new Error(`Analytics data fetch failed: ${error?.message || String(error)}`);
      }
      
      // Validate analytics response has required data
      if (!analytics) {
        throw new Error('Analytics service returned null or undefined');
      }
      
      const payload = this.mapToRemotePayload(analytics);
      
      // Log payload summary for debugging
      this.logger.debug(`Payload summary: ${payload.metrics?.length || 0} metrics, ${payload.inventory_cards?.length || 0} inventory cards, ${payload.distribution_by_category?.length || 0} categories, ${payload.fast_moving_products?.length || 0} fast moving, ${payload.slow_moving_products?.length || 0} slow moving`);

      // Compute content hash over the analytics payload only
      const json = JSON.stringify(payload);
      const hash = await this.sha256(json);

      if (!force && this.previousHash && this.previousHash === hash) {
        this.logger.debug('No analytics change detected; skipping upload');
        this.status.lastSkipReason = 'no-change';
        this.status.lastHash = hash;
        this.status.lastDurationMs = Date.now() - attemptStart;
        return {
          outcome: 'skipped-no-change',
          message: 'No analytics change detected; skipping upload',
        };
      }

      // Send to remote server
      // uploadedAt should match what cloud API expects (ISO8601 string)
      // Cloud API uses this to set Pharmacy.lastUpdatedAt
      const uploadedAt = new Date().toISOString();
      const body = {
        analytics: payload,
        hash,
        uploadedAt,
      };
      
      this.logger.debug(`Upload timestamp: ${uploadedAt}`);

      this.logger.debug(`Attempting upload to: ${url}`);
      this.logger.debug(`Payload size: ${JSON.stringify(body).length} bytes`);

      const response = await axios.post(url, body, {
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
        },
        timeout: 60000, // Increased from 15s to 60s
        // Validate status 2xx as success
        validateStatus: (s) => s >= 200 && s < 300,
      });

      this.previousHash = hash;
      const successTimestamp = new Date().toISOString();
      this.status.lastSuccessAt = successTimestamp;
      this.status.lastHash = hash;
      this.status.lastResponseCode = response.status;
      this.status.lastDurationMs = Date.now() - attemptStart;
      
      // Persist lastSuccessAt and hash to database
      try {
        await this.generalConfigs.setTypedValue(
          this.CONFIG_KEY_LAST_SUCCESS,
          successTimestamp,
          'string',
        );
        await this.generalConfigs.setTypedValue(
          this.CONFIG_KEY_LAST_HASH,
          hash,
          'string',
        );
        this.logger.debug('Persisted upload status to database');
      } catch (error) {
        this.logger.warn('Failed to persist upload status:', error);
        // Don't fail the upload if persistence fails
      }
      
      this.logger.log('Analytics snapshot uploaded');
      return {
        outcome: 'uploaded',
        message: 'Analytics snapshot uploaded',
      };
    } catch (err: any) {
      // Offline or server error; log and retry next tick
      const httpStatus =
        typeof err?.response?.status === 'number'
          ? err.response.status
          : null;
      const axiosCode = err?.code || null;
      const msg = err?.message || String(err);
      const label = httpStatus ?? axiosCode ?? 'no-code';
      
      // Enhanced error logging
      const errorDetails: any = {
        label,
        message: msg,
        url: url,
      };
      if (httpStatus) {
        errorDetails.httpStatus = httpStatus;
        errorDetails.responseData = err?.response?.data;
      }
      if (axiosCode) {
        errorDetails.axiosCode = axiosCode;
      }
      
      this.logger.warn(`Upload failed (${label}): ${msg}`, errorDetails);
      
      // Build user-friendly error message
      let userMessage = msg;
      if (axiosCode === 'ECONNREFUSED' || axiosCode === 'ENOTFOUND') {
        userMessage = `Cannot connect to remote server. Check network and URL: ${baseUrl}`;
      } else if (axiosCode === 'ETIMEDOUT') {
        userMessage = 'Upload timed out after 60 seconds. Server may be slow or unreachable.';
      } else if (httpStatus === 401 || httpStatus === 403) {
        userMessage = `Authentication failed (${httpStatus}). Check API key.`;
      } else if (httpStatus === 404) {
        // Check if response is HTML (likely Next.js frontend, not API)
        const isHtmlResponse = err?.response?.data && 
          typeof err.response.data === 'string' && 
          err.response.data.includes('<!DOCTYPE html>');
        
        if (isHtmlResponse) {
          userMessage = `API endpoint not found (404). The domain appears to be serving a frontend, not the API. Check if:
1. Cloud API is running and accessible
2. Base URL includes correct port (e.g., :64387) or subdomain (e.g., api.leyuworkpharmacy.com.et)
3. Reverse proxy is configured to route /api/* to the NestJS backend
Current URL: ${url}`;
        } else {
          userMessage = `Endpoint not found (404). Check URL path: ${url}`;
        }
      } else if (httpStatus) {
        userMessage = `Server error (${httpStatus}): ${msg}`;
      }
      
      this.status.lastError = userMessage;
      this.status.lastResponseCode = httpStatus;
      if (!httpStatus && axiosCode) {
        this.status.lastError = `${axiosCode}: ${userMessage}`;
      }
      return {
        outcome: 'error',
        message: userMessage,
      };
    } finally {
      this.running = false;
      if (this.status.lastDurationMs == null) {
        this.status.lastDurationMs = Date.now() - attemptStart;
      }
    }
  }

  private async sha256(text: string): Promise<string> {
    // Use Node crypto via dynamic import to avoid extra deps
    const crypto = await import('node:crypto');
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  // Map internal AnalyticsResponse (camelCase) to remote expected snake_case contract
  // Only includes: General cards (metrics), Inventory tab, and Sales tab data
  private mapToRemotePayload(a: AnalyticsResponse) {
    return {
      // General cards (summary cards above tabs)
      metrics: a.metrics.map(this.mapKeyMetric),
      
      // Inventory tab data
      inventory_cards: a.inventoryCards.map(this.mapKeyMetric),
      distribution_by_category: a.distributionByCategory.map(
        this.mapCategorySlice,
      ),
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
      
      // Note: Removed top_suppliers, top_performers, most_ordered_products
      // as they belong to Supply and Employee tabs, not Sales/Inventory
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

  private mapSupplier(s: SupplierSummary) {
    return {
      id: s.id,
      name: s.name,
      volume_supplied: s.volumeSupplied,
      value_supplied: s.valueSupplied,
      orders_delivered: s.ordersDelivered,
      order_completion_pct: s.orderCompletionPct,
      most_supplied_item: s.mostSuppliedItem,
    };
  }

  private mapPerformer(p: TopPerformerDto) {
    return {
      name: p.name,
      username: p.username,
      email: p.email,
      volume_sold: p.volumeSold,
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
      // Intentionally omitting orderedQty to keep payload minimal per remote schema
    };
  }
}
