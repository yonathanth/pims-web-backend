import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryStatus, PurchaseOrderStatus } from '../types/report.types';

export class ReportFiltersDto {
  @ApiProperty({
    description: 'Start date for the report (ISO 8601 format)',
    example: '2024-01-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiProperty({
    description: 'End date for the report (ISO 8601 format)',
    example: '2024-12-31',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiProperty({
    description: 'Category filter for the report',
    example: 'Antibiotic',
    required: false,
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({
    description: 'Status filter for inventory reports',
    enum: InventoryStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @ApiProperty({
    description: 'Supplier filter for purchase reports',
    example: 'PharmaCorp Inc.',
    required: false,
  })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiProperty({
    description: 'Drug ID filter for sales reports',
    example: 123,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  drugId?: number;

  @ApiProperty({
    description: 'Days threshold for expiry reports (default: 30)',
    example: 30,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  daysThreshold?: number;

  @ApiProperty({
    description: 'Order status filter for purchase reports',
    enum: PurchaseOrderStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  orderStatus?: PurchaseOrderStatus;
}
