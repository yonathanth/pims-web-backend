import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';

export enum TimeFilter {
  Daily = 'daily',
  Monthly = 'monthly',
  Yearly = 'yearly',
  Custom = 'custom',
  Date = 'date',
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export enum TopPerformersSort {
  Volume = 'volume',
  Name = 'name',
}

export enum TopSuppliersSort {
  Volume = 'volume',
  Value = 'value',
  Frequency = 'frequency',
}

export class AnalyticsQueryDto {
  @IsOptional()
  @IsEnum(TimeFilter)
  timeFilter?: TimeFilter;

  @IsOptional()
  @IsString()
  startIso?: string;

  @IsOptional()
  @IsString()
  endIso?: string;

  // Single date when timeFilter = 'date'
  @IsOptional()
  @IsString()
  dateIso?: string;

  @IsOptional()
  @IsNumber()
  rangeDays?: number;

  // Sorting options
  @IsOptional()
  @IsEnum(TopPerformersSort)
  topPerformersSort?: TopPerformersSort;

  @IsOptional()
  @IsEnum(SortOrder)
  topPerformersOrder?: SortOrder;

  @IsOptional()
  @IsEnum(TopSuppliersSort)
  topSuppliersSort?: TopSuppliersSort;

  @IsOptional()
  @IsEnum(SortOrder)
  topSuppliersOrder?: SortOrder;
}

export class KeyMetric {
  label: string;
  value: string | number | Record<string, any>;
  trendUp: boolean;
}

export class CategorySlice {
  category: string;
  stockQty: number;
  soldQty: number;
}

export class MonthlySeriesPoint {
  month: string;
  stocked: number;
  sold: number;
}

export class YearlySalesPoint {
  month: string;
  sales: number;
}

export class SupplierSummary {
  id: number;
  name: string;
  volumeSupplied: number;
  valueSupplied: number;
  ordersDelivered: number;
  orderCompletionPct: number;
  mostSuppliedItem: string;
}

export class TopPerformerDto {
  name: string;
  username: string;
  email: string;
  volumeSold: number;
}

export class ProductDto {
  genericName: string;
  tradeName?: string;
  sku?: string;
  batchNumber?: string;
  expiryDate?: string;
  quantity: number;
  location?: string;
  unitPrice: number;
  lastRestock?: string;
  supplier?: string;
  orderedQty: number;
}

export class AnalyticsResponse {
  metrics: KeyMetric[];
  inventoryCards: KeyMetric[];
  salesCards: KeyMetric[];
  supplyCards: KeyMetric[];
  distributionByCategory: CategorySlice[];
  monthlyStockedVsSold: MonthlySeriesPoint[];
  yearlySales: YearlySalesPoint[];
  topSuppliers: SupplierSummary[];
  topPerformers: TopPerformerDto[];
  outOfStockProducts: ProductDto[];
  expiredProducts: ProductDto[];
  soonToBeOutOfStockProducts: ProductDto[];
  soonToExpireProducts: ProductDto[];
  fastMovingProducts: ProductDto[];
  slowMovingProducts: ProductDto[];
  mostOrderedProducts: ProductDto[];
}
