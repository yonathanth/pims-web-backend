import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { AnalyticsService } from './analytics.service';
import {
  AnalyticsResponse,
  KeyMetric,
  ProductDto,
  SupplierSummary,
  TopPerformerDto,
  CategorySlice,
  MonthlySeriesPoint,
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
export class AnalyticsUploaderService {
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

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pushIfChanged() {
    await this.runUpload(false);
  }

  async triggerUpload(force = false): Promise<UploadAttemptResult> {
    return this.runUpload(force);
  }

  getStatus(): AnalyticsUploadStatusDto {
    return {
      running: this.running,
      lastAttemptAt: this.status.lastAttemptAt,
      lastSuccessAt: this.status.lastSuccessAt,
      lastHash: this.status.lastHash,
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
    try {
      this.running = true;
      this.status.lastAttemptAt = new Date().toISOString();
      this.status.lastError = null;
      this.status.lastSkipReason = null;
      this.status.lastDurationMs = null;
      this.status.lastResponseCode = null;

      // Get current analytics snapshot from local service (default window)
      const analytics = await this.analyticsService.getAnalytics({});
      const payload = this.mapToRemotePayload(analytics);

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
      const url = `${baseUrl.replace(/\/$/, '')}/api/analytics/${encodeURIComponent(pharmacyId)}`;
      const body = {
        analytics: payload,
        hash,
        uploadedAt: new Date().toISOString(),
      };

      const response = await axios.post(url, body, {
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
        },
        timeout: 15000,
        // Validate status 2xx as success
        validateStatus: (s) => s >= 200 && s < 300,
      });

      this.previousHash = hash;
      this.status.lastSuccessAt = new Date().toISOString();
      this.status.lastHash = hash;
      this.status.lastResponseCode = response.status;
      this.status.lastDurationMs = Date.now() - attemptStart;
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
      this.logger.warn(`Upload failed (${label}): ${msg}`);
      this.status.lastError = msg;
      this.status.lastResponseCode = httpStatus;
      if (!httpStatus && axiosCode) {
        this.status.lastError = `${axiosCode}: ${msg}`;
      }
      return {
        outcome: 'error',
        message: msg,
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
  private mapToRemotePayload(a: AnalyticsResponse) {
    return {
      metrics: a.metrics.map(this.mapKeyMetric),
      inventory_cards: a.inventoryCards.map(this.mapKeyMetric),
      distribution_by_category: a.distributionByCategory.map(
        this.mapCategorySlice,
      ),
      monthly_stocked_vs_sold: a.monthlyStockedVsSold.map(this.mapMonthlyPoint),
      top_suppliers: a.topSuppliers.map(this.mapSupplier),
      top_performers: a.topPerformers.map(this.mapPerformer),
      out_of_stock_products: a.outOfStockProducts.map(this.mapProduct),
      expired_products: a.expiredProducts.map(this.mapProduct),
      soon_to_be_out_of_stock_products: a.soonToBeOutOfStockProducts.map(
        this.mapProduct,
      ),
      soon_to_expire_products: a.soonToExpireProducts.map(this.mapProduct),
      fast_moving_products: a.fastMovingProducts.map(this.mapProduct),
      slow_moving_products: a.slowMovingProducts.map(this.mapProduct),
      most_ordered_products: a.mostOrderedProducts.map(this.mapProduct),
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
