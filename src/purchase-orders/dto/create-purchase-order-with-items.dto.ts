import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePurchaseOrderDto } from './create-purchase-order.dto';
import { CreatePurchaseOrderItemDto } from './create-purchase-order-item.dto';

export class CreatePurchaseOrderWithItemsDto extends CreatePurchaseOrderDto {
  @ApiProperty({
    description: 'Array of items to be included in the purchase order',
    type: [CreatePurchaseOrderItemDto],
    example: [
      {
        drugId: 1,
        quantityOrdered: 100,
        unitCost: 10.5,
        status: 'Pending',
      },
      {
        drugId: 2,
        quantityOrdered: 50,
        unitCost: 15.0,
        status: 'Pending',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}

