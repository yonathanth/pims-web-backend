import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { UnitTypesService } from './unit-types.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { CreateUnitTypeDto, UpdateUnitTypeDto, ListUnitTypesDto } from './dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('unit-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT')
@Controller('unit-types')
export class UnitTypesController {
  constructor(private readonly unitTypesService: UnitTypesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new unit type' })
  @ApiResponse({ status: 201, description: 'Unit type created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @ApiResponse({
    status: 409,
    description: 'Unit type with this name already exists.',
  })
  create(@Body() createUnitTypeDto: CreateUnitTypeDto) {
    return this.unitTypesService.create(createUnitTypeDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.SELLER)
  @ApiOperation({ summary: 'Get all unit types with batch count' })
  @ApiResponse({
    status: 200,
    description: 'Unit types retrieved successfully with batch count.',
  })
  findAll(@Query() query: ListUnitTypesDto) {
    return this.unitTypesService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.SELLER)
  @ApiOperation({ summary: 'Get unit type by id' })
  @ApiResponse({ status: 200, description: 'Unit type retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Unit type not found.' })
  findOne(@Param('id') id: string) {
    return this.unitTypesService.findOne(+id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update unit type by id' })
  @ApiResponse({ status: 200, description: 'Unit type updated successfully.' })
  @ApiResponse({ status: 404, description: 'Unit type not found.' })
  @ApiResponse({
    status: 409,
    description: 'Unit type with this name already exists.',
  })
  update(
    @Param('id') id: string,
    @Body() updateUnitTypeDto: UpdateUnitTypeDto,
  ) {
    return this.unitTypesService.update(+id, updateUnitTypeDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete unit type by id' })
  @ApiResponse({ status: 200, description: 'Unit type deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Unit type not found.' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete unit type with associated batches.',
  })
  remove(@Param('id') id: string) {
    return this.unitTypesService.remove(+id);
  }
}

