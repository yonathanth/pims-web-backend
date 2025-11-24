import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from './create-transaction.dto';

export class TransactionResponseDto {
  @ApiProperty({ description: 'Transaction ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Batch ID', example: 1 })
  batchId: number;

  @ApiProperty({
    description: 'Transaction type',
    enum: [
      TransactionType.SALE,
      TransactionType.INBOUND,
      TransactionType.POSITIVE_RETURN,
      TransactionType.NEGATIVE_RETURN,
    ],
    example: TransactionType.SALE,
  })
  transactionType: TransactionType;

  @ApiProperty({ description: 'Transaction quantity', example: 5 })
  quantity: number;

  @ApiProperty({
    description: 'Transaction date',
    example: '2024-01-20T10:30:00.000Z',
  })
  transactionDate: Date;

  @ApiPropertyOptional({
    description: 'User ID who created the transaction',
    example: 1,
  })
  userId?: number;

  @ApiPropertyOptional({
    description: 'Transaction notes',
    example: 'Customer sale',
  })
  notes?: string;

  @ApiPropertyOptional({ description: 'From location ID', example: 1 })
  fromLocationId?: number;

  @ApiPropertyOptional({ description: 'To location ID', example: 2 })
  toLocationId?: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-20T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-20T10:30:00.000Z',
  })
  updatedAt: Date;

  // Enhanced fields
  @ApiProperty({ description: 'Drug SKU', example: 'AM-1' })
  drugSku: string;

  @ApiProperty({ description: 'Drug name', example: 'Amoxicillin' })
  drugName: string;

  @ApiProperty({ description: 'Supplier name', example: 'MedSupply Co.' })
  supplierName: string;

  @ApiProperty({
    description: 'User who created the transaction',
    example: 'admin',
  })
  username: string;

  @ApiPropertyOptional({
    description: 'From location name',
    example: 'Main Store',
  })
  fromLocationName?: string;

  @ApiPropertyOptional({
    description: 'To location name',
    example: 'Branch Store',
  })
  toLocationName?: string;
}

export class PaginatedTransactionResult {
  @ApiProperty({
    type: [TransactionResponseDto],
    description: 'Array of transactions',
  })
  data: TransactionResponseDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    example: {
      page: 1,
      limit: 20,
      totalItems: 100,
      totalPages: 5,
    },
  })
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}
