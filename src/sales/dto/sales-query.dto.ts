import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SalesStatus {
  ALL = 'all',
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
}

export class SalesQueryDto {
  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    required: false,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({
    description: 'Filter by sales status',
    enum: SalesStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(SalesStatus)
  status?: SalesStatus = SalesStatus.ALL;

  @ApiProperty({
    description: 'Search term for drug name ',
    example: 'aspirin',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
