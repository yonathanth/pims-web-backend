import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsDateString,
  IsIn,
  Min,
} from 'class-validator';

export class CreatePurchaseOrderItemDto {
  @ApiProperty({
    description: 'Drug ID',
    example: 1,
  })
  @IsInt()
  drugId: number;

  @ApiPropertyOptional({
    description: 'Batch ID (if known)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  batchId?: number;

  @ApiProperty({
    description: 'Quantity ordered',
    example: 100,
  })
  @IsInt()
  @Min(1)
  quantityOrdered: number;

  @ApiPropertyOptional({
    description: 'Quantity received so far',
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  quantityReceived?: number;

  @ApiPropertyOptional({
    description: 'Manufacture date',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  manufactureDate?: string;

  @ApiPropertyOptional({
    description: 'Expiry date',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiProperty({
    description: 'Unit cost',
    example: 10.5,
  })
  @IsNumber()
  @Min(0)
  unitCost: number;

  @ApiProperty({
    description: 'Item status',
    example: 'Pending',
    enum: ['Complete', 'Pending', 'Partially Received', 'Cancelled'],
  })
  @IsString()
  @IsIn(['Complete', 'Pending', 'Partially Received', 'Cancelled'])
  status: string;
}
