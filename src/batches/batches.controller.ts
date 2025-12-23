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
  UseInterceptors,
} from '@nestjs/common';
import { BatchesService } from './batches.service';
import { CreateBatchDto, UpdateBatchDto, ListBatchesDto } from './dto';
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
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@ApiTags('batches')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT')
@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Create a new batch' })
  @ApiResponse({ status: 201, description: 'Batch created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @ApiResponse({ status: 409, description: 'Duplicate request detected.' })
  create(@Body() dto: CreateBatchDto) {
    return this.batchesService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Get all batches with enhanced data (paginated)' })
  @ApiResponse({
    status: 200,
    description: 'Batches retrieved successfully with drug and supplier names.',
  })
  findAll(@Query() query: ListBatchesDto) {
    return this.batchesService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Get batch by id with enhanced data' })
  @ApiResponse({
    status: 200,
    description: 'Batch retrieved successfully with drug and supplier names.',
  })
  @ApiResponse({ status: 404, description: 'Batch not found.' })
  findOne(@Param('id') id: string) {
    return this.batchesService.findOne(+id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Update batch by id' })
  @ApiResponse({ status: 200, description: 'Batch updated successfully.' })
  @ApiResponse({ status: 404, description: 'Batch not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return this.batchesService.update(+id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete batch by id' })
  @ApiResponse({ status: 200, description: 'Batch deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Batch not found.' })
  remove(@Param('id') id: string) {
    return this.batchesService.remove(+id);
  }
}
