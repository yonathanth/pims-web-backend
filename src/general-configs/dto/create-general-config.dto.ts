import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class CreateGeneralConfigDto {
  @ApiProperty({
    description: 'Configuration key (must be unique)',
    example: 'low_stock_threshold',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'Configuration value',
    example: '10',
  })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiProperty({
    description: 'Data type of the configuration value',
    enum: ['string', 'number', 'boolean', 'json'],
    example: 'number',
  })
  @IsString()
  @IsIn(['string', 'number', 'boolean', 'json'])
  dataType: string;

  @ApiProperty({
    description: 'Category for grouping configurations',
    example: 'inventory',
  })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({
    description: 'Description of what this configuration does',
    example: 'Default threshold for low stock notifications',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
}












