import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionStatus } from '../types/report.types';

export class SalesReportFiltersDto {
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
    description: 'Transaction status filter for sales reports',
    enum: TransactionStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiProperty({
    description: 'Drug ID filter for sales reports',
    example: 123,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  drugId?: number;
}

