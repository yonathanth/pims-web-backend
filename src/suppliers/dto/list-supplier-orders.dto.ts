import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, IsString, IsBoolean, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ListSupplierOrdersDto {
  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiProperty({
    description: 'Field to sort by',
    example: 'createdDate',
    enum: ['createdDate', 'expectedDate'],
    required: false,
  })
  @IsOptional()
  @IsString()
  sort_by?: 'createdDate' | 'expectedDate' = 'createdDate';

  @ApiProperty({
    description: 'Sort in descending order',
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  descending?: boolean = false;

  @ApiProperty({
    description: 'Filter by order status',
    example: 'pending',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: string;
}
