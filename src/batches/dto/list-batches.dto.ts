import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ListBatchesDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Search across drug name/sku or supplier name',
    example: 'amox',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by supplierId', example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  supplierId?: number;

  @ApiPropertyOptional({ description: 'Filter by drugId', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  drugId?: number;

  @ApiPropertyOptional({
    description: 'Filter by expiry date from',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsDateString()
  expiryFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter by expiry date to',
    example: '2025-12-31',
  })
  @IsOptional()
  @IsDateString()
  expiryTo?: string;

  @ApiPropertyOptional({
    enum: ['purchaseDate', 'expiryDate', 'currentQty', 'drugName', 'sku', 'id'],
    description: 'Sort by field',
  })
  @IsOptional()
  @IsIn(['purchaseDate', 'expiryDate', 'currentQty', 'drugName', 'sku', 'id'])
  sortBy?:
    | 'purchaseDate'
    | 'expiryDate'
    | 'currentQty'
    | 'drugName'
    | 'sku'
    | 'id' = 'id';

  @ApiPropertyOptional({
    enum: [
      'All',
      'In stock',
      'Out of Stock',
      'Low Stock',
      'Expired',
      'Near-Expiry',
    ],
    description: 'Filter by stock status',
  })
  @IsOptional()
  @IsIn([
    'All',
    'In stock',
    'Out of Stock',
    'Low Stock',
    'Expired',
    'Near-Expiry',
  ])
  stockStatus?:
    | 'All'
    | 'In stock'
    | 'Out of Stock'
    | 'Low Stock'
    | 'Expired'
    | 'Near-Expiry' = 'All';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';
}

export type PaginatedResult<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};
