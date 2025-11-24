import { ApiProperty } from '@nestjs/swagger';

export class DashboardCardDto {
  @ApiProperty({ example: 'Total Profit', description: 'Card label' })
  label: string;

  @ApiProperty({ example: 'ETB 2,000,000', description: 'Card value' })
  value: string;
}

export class TopSellingDrugDto {
  @ApiProperty({ example: 'Paracetamol', description: 'Drug name' })
  name: string;

  @ApiProperty({ example: 150, description: 'Quantity sold' })
  quantity: number;
}

export class InventoryDistributionDto {
  @ApiProperty({ example: 'Antibiotics', description: 'Category name' })
  category: string;

  @ApiProperty({ example: 25.5, description: 'Percentage of total inventory' })
  percentage: number;
}

export class MonthlyDataDto {
  @ApiProperty({ example: '2024-01', description: 'Month in YYYY-MM format' })
  month: string;

  @ApiProperty({ example: 50000, description: 'Sales amount' })
  sales: number;

  @ApiProperty({ example: 30000, description: 'Purchases amount' })
  purchases: number;
}

export class AuditLogDto {
  @ApiProperty({ example: 'Drug', description: 'Entity name' })
  entityName: string;

  @ApiProperty({ example: 'CREATE', description: 'Action performed' })
  action: string;

  @ApiProperty({ example: '2024-01-15T10:30:00Z', description: 'Timestamp' })
  timestamp: Date;

  @ApiProperty({
    example: 'Created new drug: Paracetamol',
    description: 'Change summary',
  })
  changeSummary: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'User who performed the action',
  })
  userName: string;

  @ApiProperty({ example: 1, description: 'User ID' })
  userId: number;
}

export class DashboardDataDto {
  @ApiProperty({
    type: [DashboardCardDto],
    description: 'Dashboard cards data',
  })
  cards: DashboardCardDto[];

  @ApiProperty({
    type: [TopSellingDrugDto],
    description: 'Top 6 selling drugs',
  })
  topSellingDrugs: TopSellingDrugDto[];

  @ApiProperty({
    type: [InventoryDistributionDto],
    description: 'Inventory distribution by category',
  })
  inventoryDistribution: InventoryDistributionDto[];

  @ApiProperty({
    type: [MonthlyDataDto],
    description: 'Monthly sales and purchases data',
  })
  monthlyData: MonthlyDataDto[];

  @ApiProperty({ type: [AuditLogDto], description: 'Latest 3 audit logs' })
  recentAuditLogs: AuditLogDto[];
}
