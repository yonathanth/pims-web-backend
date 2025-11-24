import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsDateString,
  IsIn,
} from 'class-validator';

export class CreatePurchaseOrderDto {
  @ApiProperty({
    description: 'Supplier ID',
    example: 1,
  })
  @IsInt()
  supplierId: number;

  @ApiPropertyOptional({
    description: 'Creation date/time of the order',
    example: '2024-11-01T12:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdDate?: string;

  @ApiPropertyOptional({
    description: 'Expected delivery date',
    example: '2024-12-31T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiProperty({
    description: 'Order status',
    example: 'Pending',
    enum: ['Complete', 'Pending', 'Partially Received', 'Cancelled'],
  })
  @IsString()
  @IsIn(['Complete', 'Pending', 'Partially Received', 'Cancelled'])
  status: string;
}
