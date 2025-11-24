import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';

export enum TransactionType {
  SALE = 'sale',
  INBOUND = 'inbound',
  POSITIVE_RETURN = 'positive return',
  NEGATIVE_RETURN = 'negative return',
}

export class CreateTransactionDto {
  @ApiProperty({ description: 'Batch ID', example: 1 })
  @IsInt()
  @Min(1)
  batchId: number;

  @ApiProperty({
    description: 'Type of transaction',
    enum: [
      TransactionType.SALE,
      TransactionType.INBOUND,
      TransactionType.POSITIVE_RETURN,
      TransactionType.NEGATIVE_RETURN,
    ],
  })
  @IsEnum(TransactionType)
  transactionType: TransactionType;

  @ApiProperty({
    description: 'Quantity affected by the transaction',
    example: 5,
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Optional notes' })
  @IsOptional()
  @IsNotEmpty()
  notes?: string;
}
