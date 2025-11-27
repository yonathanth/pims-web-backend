export enum ReportType {
  INVENTORY = 'inventory',
  SALES = 'sales',
  EXPIRY = 'expiry',
  PURCHASE = 'purchase',
}

export enum ReportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
}

export enum InventoryStatus {
  CURRENT_STOCK = 'current_stock',
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
}

export enum PurchaseOrderStatus {
  ALL = 'all',
  PENDING = 'pending',
  COMPLETED = 'completed',
  PARTIALLY_COMPLETED = 'partially_completed',
  CANCELLED = 'cancelled',
}

export enum TransactionStatus {
  ALL_STATUS = 'all_status',
  APPROVED = 'approved',
  PENDING = 'pending',
  DECLINED = 'declined',
}

export interface ReportFilters {
  fromDate?: string;
  toDate?: string;
  category?: string;
  status?: string;
  supplier?: string;
  drugId?: number;
  daysThreshold?: number;
}

export interface ReportData {
  reportType: string;
  filters: ReportFilters;
  data: any[];
  headers: { key: string; header: string }[];
  summary: {
    totalRecords: number;
    totalValue?: number;
    totalQuantity?: number;
    [key: string]: any;
  };
}

export interface InventoryReportItem {
  id: number;
  drugName: string;
  sku: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  location: string;
  unitPrice: number;
  lastRestock: string;
  supplier: string;
  category: string;
  status: string;
}

export interface SalesReportItem {
  id: number;
  transactionDate: string;
  sku: string;
  drugName: string;
  quantitySold: number;
  unitPrice: number;
  totalPrice: number;
  user: string;
  category: string;
  status: string;
}

export interface ExpiryReportItem {
  id: number;
  sku: string;
  drugName: string;
  batchNumber: string;
  expiryDate: string;
  quantityRemaining: number;
  daysUntilExpiry: number;
  location: string;
  supplier: string;
  unitCost: number;
  totalValue: number;
  category: string;
}

export interface PurchaseReportItem {
  id: number;
  orderId: number;
  orderDate: string;
  expectedDate: string;
  supplier: string;
  drugName: string;
  sku: string;
  category: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  totalCost: number;
  status: string;
  fulfillmentRate: number;
}
