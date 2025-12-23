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
import { DrugsService } from './drugs.service';
import { CreateDrugDto, UpdateDrugDto, ListDrugsDto } from './dto';
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

@ApiTags('drugs')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT')
@Controller('drugs')
export class DrugsController {
  constructor(private readonly drugsService: DrugsService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Create a new drug' })
  @ApiResponse({ status: 201, description: 'Drug created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @ApiResponse({
    status: 409,
    description: 'Drug with this SKU already exists or duplicate request detected.',
  })
  create(@Body() dto: CreateDrugDto) {
    return this.drugsService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.SELLER)
  @ApiOperation({ summary: 'Get all drugs (paginated)' })
  @ApiResponse({ status: 200, description: 'Drugs retrieved successfully.' })
  findAll(@Query() query: ListDrugsDto) {
    return this.drugsService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.SELLER)
  @ApiOperation({ summary: 'Get drug by id' })
  @ApiResponse({ status: 200, description: 'Drug retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Drug not found.' })
  findOne(@Param('id') id: string) {
    return this.drugsService.findOne(+id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Update drug by id' })
  @ApiResponse({ status: 200, description: 'Drug updated successfully.' })
  @ApiResponse({ status: 404, description: 'Drug not found.' })
  @ApiResponse({
    status: 409,
    description: 'Drug with this SKU already exists.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateDrugDto) {
    return this.drugsService.update(+id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete drug by id' })
  @ApiResponse({ status: 200, description: 'Drug deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Drug not found.' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete drug with associated batches.',
  })
  remove(@Param('id') id: string) {
    return this.drugsService.remove(+id);
  }
}
