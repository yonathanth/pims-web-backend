import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({
    description: 'Location name',
    example: 'Main Storage Room',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Location description',
    example: 'Primary storage area for pharmaceutical products',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Maximum capacity of the location',
    example: '1000',
  })
  @IsOptional()
  @IsString()
  maxCapacity?: string;

  @ApiProperty({
    description: 'Type of location',
    example: 'storage',
    enum: [
      'storage',
      'dispensary',
      'quarantine',
      'office',
      'shelf',
      'fridge',
      'others',
    ],
  })
  @IsString()
  @IsIn([
    'storage',
    'dispensary',
    'quarantine',
    'office',
    'shelf',
    'fridge',
    'others',
  ])
  locationType: string;
}
