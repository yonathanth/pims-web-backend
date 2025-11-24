import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  UseGuards,
  Req,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import {
  CreateTransactionDto,
  ListTransactionsDto,
  TransactionResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('transactions')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Create a transaction and adjust batch quantity' })
  @ApiResponse({ status: 201, description: 'Transaction created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Insufficient quantity or bad request',
  })
  create(@Body() dto: CreateTransactionDto, @Req() req: any) {
    const userId = req.user?.userId as number;
    return this.transactionsService.create(dto, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.SELLER)
  @ApiOperation({
    summary: 'Get all transactions with filtering, sorting, and pagination',
    description:
      'Retrieve transactions with optional filters by type, batch, user, locations, date range, and search in notes',
  })
  @ApiResponse({
    status: 200,
    description: 'List of transactions retrieved successfully',
  })
  findAll(@Query() query: ListTransactionsDto) {
    return this.transactionsService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.SELLER)
  @ApiOperation({
    summary: 'Get transaction by ID',
    description:
      'Retrieve a single transaction with enhanced details including drug, supplier, user, and location information',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction not found',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.findOne(id);
  }

  @Get('pending-sales')
  @Roles(UserRole.SELLER, UserRole.PHARMACIST, UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get pending sales',
    description: 'Retrieve all pending sale transactions awaiting completion',
  })
  @ApiResponse({
    status: 200,
    description: 'List of pending sales',
    type: [TransactionResponseDto],
  })
  async getPendingSales(): Promise<TransactionResponseDto[]> {
    return this.transactionsService.getPendingSales();
  }

  @Patch(':id/status')
  @Roles(UserRole.SELLER)
  @ApiOperation({
    summary: 'Update transaction status',
    description:
      'Seller updates the status of a pending sale transaction (completed or declined)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction status updated successfully',
    type: TransactionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid status or transaction not pending',
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction not found',
  })
  async updateTransactionStatus(
    @Param('id', ParseIntPipe) transactionId: number,
    @Body() body: { status: string; notes?: string },
  ): Promise<TransactionResponseDto> {
    await this.transactionsService.updateTransactionStatus(
      transactionId,
      body.status,
      body.notes,
    );
    return this.transactionsService.findOne(transactionId);
  }
}
