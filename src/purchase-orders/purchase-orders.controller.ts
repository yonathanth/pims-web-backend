import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ListPurchaseOrdersDto,
  CreatePurchaseOrderItemDto,
  UpdatePurchaseOrderItemDto,
  PaginatedResult,
} from './dto';
import { CreatePurchaseOrderWithItemsDto } from './dto/create-purchase-order-with-items.dto';
import { PurchaseOrder, PurchaseOrderItem } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@ApiTags('purchase-orders')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Create a new purchase order' })
  @ApiResponse({
    status: 201,
    description: 'Purchase order created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate request detected',
  })
  create(
    @Body() createPurchaseOrderDto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    return this.purchaseOrdersService.create(createPurchaseOrderDto);
  }

  @Post('with-items')
  @UseInterceptors(IdempotencyInterceptor)
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Create a new purchase order with items (atomic operation)',
  })
  @ApiResponse({
    status: 201,
    description: 'Purchase order with items created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({
    status: 404,
    description: 'Supplier, drug, or batch not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Duplicate request detected',
  })
  createWithItems(
    @Body() createPurchaseOrderWithItemsDto: CreatePurchaseOrderWithItemsDto,
  ): Promise<PurchaseOrder & { items: PurchaseOrderItem[] }> {
    return this.purchaseOrdersService.createWithItems(
      createPurchaseOrderWithItemsDto,
    );
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'SELLER')
  @ApiOperation({
    summary: 'Get all purchase orders with pagination, search, and filtering',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'supplierId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'createdFrom', required: false, type: String })
  @ApiQuery({ name: 'createdTo', required: false, type: String })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdDate', 'expectedDate', 'status'],
  })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({
    status: 200,
    description: 'Purchase orders retrieved successfully',
  })
  findAll(
    @Query() query: ListPurchaseOrdersDto,
  ): Promise<PaginatedResult<PurchaseOrder>> {
    return this.purchaseOrdersService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'SELLER')
  @ApiOperation({ summary: 'Get a purchase order by ID' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PurchaseOrder> {
    return this.purchaseOrdersService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Update a purchase order' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePurchaseOrderDto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    return this.purchaseOrdersService.update(id, updatePurchaseOrderDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a purchase order' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete purchase order with items',
  })
  remove(@Param('id', ParseIntPipe) id: number): Promise<PurchaseOrder> {
    return this.purchaseOrdersService.remove(id);
  }

  // Purchase Order Items endpoints
  @Post(':id/items')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Add an item to a purchase order' })
  @ApiResponse({
    status: 201,
    description: 'Purchase order item created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({
    status: 404,
    description: 'Purchase order, drug, or batch not found',
  })
  createItem(
    @Param('id', ParseIntPipe) purchaseOrderId: number,
    @Body() createPurchaseOrderItemDto: CreatePurchaseOrderItemDto,
  ): Promise<PurchaseOrderItem> {
    return this.purchaseOrdersService.createItem(
      purchaseOrderId,
      createPurchaseOrderItemDto,
    );
  }

  @Patch('items/:itemId')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Update a purchase order item' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order item updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Purchase order item not found' })
  updateItem(
    @Param('itemId', ParseIntPipe) id: number,
    @Body() updatePurchaseOrderItemDto: UpdatePurchaseOrderItemDto,
  ): Promise<PurchaseOrderItem> {
    return this.purchaseOrdersService.updateItem(
      id,
      updatePurchaseOrderItemDto,
    );
  }

  @Delete('items/:itemId')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Delete a purchase order item' })
  @ApiResponse({
    status: 200,
    description: 'Purchase order item deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Purchase order item not found' })
  removeItem(
    @Param('itemId', ParseIntPipe) id: number,
  ): Promise<PurchaseOrderItem> {
    return this.purchaseOrdersService.removeItem(id);
  }
}
