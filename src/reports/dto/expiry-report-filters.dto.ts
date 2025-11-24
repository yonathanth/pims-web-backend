import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class ExpiryReportFiltersDto {
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
    description: 'Supplier filter for expiry reports',
    example: 'PharmaCorp Inc.',
    required: false,
  })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiProperty({
    description: 'Days threshold for expiry reports (default: 30)',
    example: 30,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  daysThreshold?: number;
}

