import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryStatus } from '../types/report.types';

export class InventoryReportFiltersDto {
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
    description: 'Supplier filter for inventory reports',
    example: 'PharmaCorp Inc.',
    required: false,
  })
  @IsOptional()
  @IsString()
  supplier?: string;
}

