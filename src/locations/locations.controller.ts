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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
  ListLocationsDto,
  PaginatedResult,
} from './dto';
import { Location } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('locations')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Create a new location' })
  @ApiResponse({ status: 201, description: 'Location created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Location name already exists' })
  create(@Body() createLocationDto: CreateLocationDto): Promise<Location> {
    return this.locationsService.create(createLocationDto);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'PHARMACIST', 'SELLER')
  @ApiOperation({
    summary: 'Get all locations with pagination, search, and sorting',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'locationType', required: false, type: String })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['name', 'locationType', 'currentQty', 'maxCapacity'],
  })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Locations retrieved successfully' })
  findAll(
    @Query() query: ListLocationsDto,
  ): Promise<PaginatedResult<Location>> {
    return this.locationsService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'PHARMACIST', 'SELLER')
  @ApiOperation({ summary: 'Get a location by ID' })
  @ApiResponse({ status: 200, description: 'Location retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Location> {
    return this.locationsService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Update a location' })
  @ApiResponse({ status: 200, description: 'Location updated successfully' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  @ApiResponse({ status: 409, description: 'Location name already exists' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateLocationDto: UpdateLocationDto,
  ): Promise<Location> {
    return this.locationsService.update(id, updateLocationDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a location' })
  @ApiResponse({ status: 200, description: 'Location deleted successfully' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete location with batches',
  })
  remove(@Param('id', ParseIntPipe) id: number): Promise<Location> {
    return this.locationsService.remove(id);
  }

  @Get('batch/:batchId')
  @Roles('ADMIN', 'MANAGER', 'PHARMACIST', 'SELLER')
  @ApiOperation({ summary: 'Get locations where a batch is stored' })
  @ApiResponse({ status: 200, description: 'Locations retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  getLocationsByBatch(
    @Param('batchId', ParseIntPipe) batchId: number,
  ): Promise<Location[]> {
    return this.locationsService.findByBatch(batchId);
  }
}
