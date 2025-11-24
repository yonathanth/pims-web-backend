import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
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
import { NotificationsService } from './notifications.service';
import {
  CreateNotificationDto,
  ListNotificationsDto,
  NotificationCountsDto,
} from './dto';
import { Notification } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('notifications')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Create a new notification' })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  create(
    @Body() createNotificationDto: CreateNotificationDto,
  ): Promise<Notification> {
    return this.notificationsService.create(createNotificationDto);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'PHARMACIST', 'SELLER')
  @ApiOperation({
    summary: 'Get all notifications with pagination and filtering',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['out_of_stock', 'low_stock', 'expired', 'near_expiry'],
  })
  @ApiQuery({
    name: 'severity',
    required: false,
    enum: ['high', 'medium', 'low'],
  })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
  })
  findAll(@Query() query: ListNotificationsDto) {
    // Diagnostic logging to trace filter parsing
    try {
      const rawIsRead = (query as any)?.isRead;
      console.log('[NotificationsController] findAll query:', {
        page: query.page,
        limit: query.limit,
        type: query.type,
        severity: query.severity,
        isRead: rawIsRead,
        isReadType: typeof rawIsRead,
      });
    } catch {}
    return this.notificationsService.findAll(query);
  }

  @Get('counts')
  @Roles('ADMIN', 'MANAGER', 'PHARMACIST', 'SELLER')
  @ApiOperation({ summary: 'Get notification counts by type and severity' })
  @ApiResponse({
    status: 200,
    description: 'Notification counts retrieved successfully',
  })
  getCounts(): Promise<NotificationCountsDto> {
    return this.notificationsService.getCounts();
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'PHARMACIST', 'SELLER')
  @ApiOperation({ summary: 'Get a notification by ID' })
  @ApiResponse({
    status: 200,
    description: 'Notification retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Notification> {
    return this.notificationsService.findOne(id);
  }

  @Patch(':id/read')
  @Roles('ADMIN', 'MANAGER', 'PHARMACIST', 'SELLER')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  markAsRead(@Param('id', ParseIntPipe) id: number): Promise<Notification> {
    return this.notificationsService.markAsRead(id);
  }

  @Patch('mark-all-read')
  @Roles('ADMIN', 'MANAGER', 'PHARMACIST', 'SELLER')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  markAllAsRead(): Promise<{ count: number }> {
    return this.notificationsService.markAllAsRead();
  }
}
