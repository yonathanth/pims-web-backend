import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateBatchDto {
  @ApiProperty({ description: 'Drug ID' })
  @IsInt()
  @Min(1)
  drugId: number;

  @ApiProperty({ description: 'Supplier ID' })
  @IsInt()
  @Min(1)
  supplierId: number;

  @ApiProperty({ description: 'Manufacture date', example: '2024-01-15' })
  @IsDateString()
  manufactureDate: string;

  @ApiProperty({ description: 'Expiry date', example: '2026-01-15' })
  @IsDateString()
  expiryDate: string;

  @ApiProperty({ description: 'Unit price', example: 12.0 })
  @IsNumber()
  unitPrice: number;

  @ApiProperty({ description: 'Unit cost', example: 10.5 })
  @IsNumber()
  unitCost: number;

  @ApiProperty({ description: 'Purchase date', example: '2024-01-20' })
  @IsDateString()
  purchaseDate: string;

  @ApiProperty({ description: 'Initial quantity', example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  currentQty?: number;

  @ApiProperty({
    description:
      'Location ID(s) where this batch will be stored initially. Accepts number or array of numbers.',
    required: false,
    oneOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }],
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    value === undefined || value === null
      ? undefined
      : Array.isArray(value)
        ? value
        : [value],
  )
  @IsInt({ each: true })
  locationIds?: number[];

  @ApiProperty({
    description: 'Low stock threshold for this batch',
    example: 10,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}
