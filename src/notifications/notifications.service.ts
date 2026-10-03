import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Scope,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Notification, Prisma } from '@prisma/client';
import {
  CreateNotificationDto,
  ListNotificationsDto,
  PaginatedResult,
  NotificationType,
  NotificationSeverity,
  NotificationCountsDto,
} from './dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';

// Expiry scans live in ExpiryScannerService: lifecycle hooks and @Cron jobs
// never run on request-scoped providers like this one
@Injectable({ scope: Scope.REQUEST })
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  async create(
    data: CreateNotificationDto,
    userId?: number,
  ): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        notificationType: data.notificationType,
        message: data.message,
        severity: data.severity,
        userId,
        isRead: false,
        readAt: null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
  }

  // matchText identifies the entity inside existing messages, e.g. "Batch #B12 ("
  async createIfNotExists(
    data: CreateNotificationDto,
    userId?: number,
    matchText?: string,
  ): Promise<Notification | null> {
    // Check if similar notification already exists and is unread
    const existing = await this.prisma.notification.findFirst({
      where: {
        notificationType: data.notificationType,
        isRead: false,
        ...(matchText
          ? { message: { contains: matchText } }
          : data.entityName && data.entityId
            ? { message: { contains: `#${data.entityId}` } }
            : {}),
      },
    });

    if (existing) {
      return null; // Don't create duplicate
    }

    return this.create(data, userId);
  }

  async findAll(
    query?: ListNotificationsDto,
  ): Promise<PaginatedResult<Notification>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {};

    if (query?.type) where.notificationType = query.type;
    if (query?.severity) where.severity = query.severity;
    if (query?.isRead !== undefined) where.isRead = query.isRead;

    // Diagnostic logging of filters
    try {
      console.log('[NotificationsService] findAll filters:', {
        input: {
          page,
          limit,
          type: query?.type,
          severity: query?.severity,
          isRead: query?.isRead,
        },
        where,
      });
    } catch {}

    // Show all notifications including expired ones

    const [totalItems, data] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, username: true, fullName: true },
          },
        },
      }),
    ]);

    try {
      console.log('[NotificationsService] results:', {
        totalItems,
        page,
        limit,
        returned: data.length,
        first: data[0]?.id,
        isReadStats: {
          unread: data.filter((n) => !n.isRead).length,
          read: data.filter((n) => n.isRead).length,
        },
      });
    } catch {}

    return {
      data,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      },
    };
  }

  async findOne(id: number): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, username: true, fullName: true },
        },
      },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    return notification;
  }

  @Audit({
    entityName: 'Notification',
    action: 'MARK_AS_READ',
    changeSummary: (result) => `Marked notification #${result.id} as read`,
  })
  async markAsRead(id: number): Promise<Notification> {
    try {
      return await this.prisma.notification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Notification with ID ${id} not found`);
      }
      throw error;
    }
  }

  @Audit({
    entityName: 'Notification',
    action: 'MARK_ALL_AS_READ',
    changeSummary: (result) => `Marked ${result.count} notifications as read`,
  })
  async markAllAsRead(): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { count: result.count };
  }

  async getCounts(): Promise<NotificationCountsDto> {
    const [total, unread, bySeverity, byType] = await this.prisma.$transaction([
      this.prisma.notification.count(),
      this.prisma.notification.count({ where: { isRead: false } }),
      // Count ALL notifications by severity (not just unread)
      this.prisma.notification.groupBy({
        by: ['severity'],
        _count: { severity: true },
        orderBy: { severity: 'asc' },
      }),
      // Count ALL notifications by type (not just unread)
      this.prisma.notification.groupBy({
        by: ['notificationType'],
        _count: { notificationType: true },
        orderBy: { notificationType: 'asc' },
      }),
    ]);

    const severityCounts = bySeverity.reduce(
      (acc, item) => {
        acc[item.severity as NotificationSeverity] =
          (item._count as any)?.severity || 0;
        return acc;
      },
      {} as Record<NotificationSeverity, number>,
    );

    const typeCounts = byType.reduce(
      (acc, item) => {
        acc[item.notificationType as NotificationType] =
          (item._count as any)?.notificationType || 0;
        return acc;
      },
      {} as Record<NotificationType, number>,
    );

    return {
      total,
      unread,
      bySeverity: {
        [NotificationSeverity.HIGH]:
          severityCounts[NotificationSeverity.HIGH] || 0,
        [NotificationSeverity.MEDIUM]:
          severityCounts[NotificationSeverity.MEDIUM] || 0,
        [NotificationSeverity.LOW]:
          severityCounts[NotificationSeverity.LOW] || 0,
      },
      byType: {
        [NotificationType.OUT_OF_STOCK]:
          typeCounts[NotificationType.OUT_OF_STOCK] || 0,
        [NotificationType.LOW_STOCK]:
          typeCounts[NotificationType.LOW_STOCK] || 0,
        [NotificationType.EXPIRED]: typeCounts[NotificationType.EXPIRED] || 0,
        [NotificationType.NEAR_EXPIRY]:
          typeCounts[NotificationType.NEAR_EXPIRY] || 0,
      },
    };
  }

  // Stock evaluation methods
  async evaluateBatchStock(batchId: number): Promise<void> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { drug: true },
    });

    if (!batch) return;

    // Use batch-specific low stock threshold
    const lowStockThreshold = batch.lowStockThreshold;
    // Messages name the batch by its number when it has one, so match on the
    // same label (a bare "#id" never matched those and "#1" also matched "#12")
    const batchRef = `Batch ${batch.batchNumber ? `#${batch.batchNumber}` : `#${batch.id}`} (`;

    if (batch.currentQty === 0) {
      // Out of stock
      await this.createIfNotExists(
        {
          notificationType: NotificationType.OUT_OF_STOCK,
          severity: NotificationSeverity.HIGH,
          message: `${batchRef}${batch.drug.tradeName ? `${batch.drug.genericName} (${batch.drug.tradeName})` : batch.drug.genericName}) is out of stock`,
          entityName: 'Batch',
          entityId: batch.id,
        },
        undefined,
        batchRef,
      );
    } else if (batch.currentQty <= lowStockThreshold) {
      // Low stock
      await this.createIfNotExists(
        {
          notificationType: NotificationType.LOW_STOCK,
          severity: NotificationSeverity.MEDIUM,
          message: `${batchRef}${batch.drug.tradeName ? `${batch.drug.genericName} (${batch.drug.tradeName})` : batch.drug.genericName}) is running low on stock (${batch.currentQty} remaining)`,
          entityName: 'Batch',
          entityId: batch.id,
        },
        undefined,
        batchRef,
      );
    }

    // If stock increased above threshold, mark low stock notifications as read
    if (batch.currentQty > lowStockThreshold) {
      await this.prisma.notification.updateMany({
        where: {
          notificationType: NotificationType.LOW_STOCK,
          isRead: false,
          message: { contains: batchRef },
        },
        data: { isRead: true, readAt: new Date() },
      });
    }

    // If stock increased above 0, mark out of stock notifications as read
    if (batch.currentQty > 0) {
      await this.prisma.notification.updateMany({
        where: {
          notificationType: NotificationType.OUT_OF_STOCK,
          isRead: false,
          message: { contains: batchRef },
        },
        data: { isRead: true, readAt: new Date() },
      });
    }

    // Once a batch is sold out its expiry alerts no longer need attention
    if (batch.currentQty === 0) {
      await this.prisma.notification.updateMany({
        where: {
          notificationType: {
            in: [NotificationType.NEAR_EXPIRY, NotificationType.EXPIRED],
          },
          isRead: false,
          message: { contains: batchRef },
        },
        data: { isRead: true, readAt: new Date() },
      });
    }
  }
}
