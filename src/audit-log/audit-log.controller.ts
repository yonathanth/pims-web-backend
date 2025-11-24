import {
  Controller,
  Get,
  Param,
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
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsDto, PaginatedResult } from './dto';
import { AuditLog } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('audit-logs')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Get all audit logs with pagination and filtering',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'entityName', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'entityId', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully',
  })
  findAll(
    @Query() query: ListAuditLogsDto,
  ): Promise<PaginatedResult<AuditLog>> {
    return this.auditLogService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get an audit log by ID' })
  @ApiResponse({
    status: 200,
    description: 'Audit log retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<AuditLog> {
    return this.auditLogService.findOne(id);
  }

  @Get('entity/:entityName/:entityId')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Get audit logs for a specific entity' })
  @ApiResponse({
    status: 200,
    description: 'Entity audit logs retrieved successfully',
  })
  findByEntity(
    @Param('entityName') entityName: string,
    @Param('entityId', ParseIntPipe) entityId: number,
  ): Promise<AuditLog[]> {
    return this.auditLogService.findByEntity(entityName, entityId);
  }
}
