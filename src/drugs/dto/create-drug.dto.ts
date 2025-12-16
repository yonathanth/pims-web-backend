import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateDrugDto {
  @ApiProperty({
    description: 'Unique SKU (optional)',
    example: 'AMOX-500',
    required: false,
  })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiProperty({ description: 'Generic name', example: 'Amoxicillin' })
  @IsString()
  @IsNotEmpty()
  genericName: string;

  @ApiProperty({ description: 'Trade name (brand name)', example: 'Amoxil' })
  @IsString()
  @IsOptional()
  tradeName?: string;

  @ApiProperty({ description: 'Strength', example: '500mg' })
  @IsString()
  @IsNotEmpty()
  strength: string;

  @ApiProperty({ description: 'Description', example: 'Antibiotic', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Category ID' })
  @IsInt()
  @Min(1)
  categoryId: number;
}
