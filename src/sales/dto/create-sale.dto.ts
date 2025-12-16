import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaleItemDto {
  @ApiProperty({ description: 'Batch ID for the sold item', example: 1 })
  @IsInt()
  @Min(1)
  batchId: number;

  @ApiProperty({ description: 'Quantity to sell from this batch', example: 2 })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({
    description: 'Optional notes specific to this line item',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lineNotes?: string;
}

export class CreateSaleDto {
  @ApiProperty({
    description: 'Optional notes for the entire sale',
    required: false,
    example: 'Walk-in customer sale',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({
    description: 'Line items for this sale',
    type: [CreateSaleItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];
}


