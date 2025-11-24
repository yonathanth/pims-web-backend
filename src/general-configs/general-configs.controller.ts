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
  ApiBody,
} from '@nestjs/swagger';
import { GeneralConfigsService } from './general-configs.service';
import {
  CreateGeneralConfigDto,
  UpdateGeneralConfigDto,
  ListGeneralConfigsDto,
  SetTypedValueDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('General Configs')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('general-configs')
export class GeneralConfigsController {
  constructor(private readonly generalConfigsService: GeneralConfigsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new general configuration' })
  @ApiResponse({
    status: 201,
    description: 'Configuration created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Configuration key already exists' })
  async create(@Body() createGeneralConfigDto: CreateGeneralConfigDto) {
    return this.generalConfigsService.create(createGeneralConfigDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Get all general configurations with filtering' })
  @ApiResponse({
    status: 200,
    description: 'Configurations retrieved successfully',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'dataType', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(@Query() query: ListGeneralConfigsDto) {
    return this.generalConfigsService.findAll(query);
  }

  @Get('category/:category')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Get configurations by category' })
  @ApiResponse({
    status: 200,
    description: 'Configurations retrieved successfully',
  })
  async findByCategory(@Param('category') category: string) {
    return this.generalConfigsService.findByCategory(category);
  }

  @Get('key/:key')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Get configuration by key' })
  @ApiResponse({
    status: 200,
    description: 'Configuration retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async findByKey(@Param('key') key: string) {
    return this.generalConfigsService.findByKey(key);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Get configuration by ID' })
  @ApiResponse({
    status: 200,
    description: 'Configuration retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.generalConfigsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a general configuration' })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  @ApiResponse({ status: 409, description: 'Configuration key already exists' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateGeneralConfigDto: UpdateGeneralConfigDto,
  ) {
    return this.generalConfigsService.update(id, updateGeneralConfigDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a general configuration' })
  @ApiResponse({
    status: 200,
    description: 'Configuration deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.generalConfigsService.remove(id);
  }

  // Utility endpoints for typed configuration access
  @Get('typed/:key/:type')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Get typed configuration value by key' })
  @ApiResponse({
    status: 200,
    description: 'Typed configuration value retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  @ApiResponse({ status: 400, description: 'Type mismatch' })
  async getTypedValue(@Param('key') key: string, @Param('type') type: string) {
    return this.generalConfigsService.getTypedValue(key, type);
  }

  @Post('typed/:key/:type')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Set typed configuration value by key',
    description:
      'Accepts value directly or wrapped in { "value": "..." } object',
  })
  @ApiBody({
    description: 'The configuration value to set',
    schema: {
      type: 'object',
      properties: {
        value: {
          type: 'string',
          description: 'The value to set for the configuration',
          example: 'Hello World',
        },
      },
      required: ['value'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Typed configuration value set successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid value or type' })
  async setTypedValue(
    @Param('key') key: string,
    @Param('type') type: string,
    @Body() body: SetTypedValueDto | any,
  ) {
    // Handle different body structures - body might be the value directly or have a value property
    const value =
      body && typeof body === 'object' && 'value' in body ? body.value : body;
    return this.generalConfigsService.setTypedValue(key, value, type);
  }
}
