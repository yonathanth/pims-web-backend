import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class DeclineSaleDto {
  @ApiProperty({
    description: 'Reason for declining the sale',
    example: 'Insufficient stock available',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

