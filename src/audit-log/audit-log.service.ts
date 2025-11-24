import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLog, Prisma } from '@prisma/client';
import { ListAuditLogsDto, PaginatedResult } from './dto';

export interface AuditLogData {
  action: string;
  entityName: string;
  entityId: number;
  userId: number | null;
  changeSummary?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async log(data: AuditLogData): Promise<AuditLog> {
    try {
      return await this.prisma.auditLog.create({
        data: {
          action: data.action,
          entityName: data.entityName,
          entityId: data.entityId,
          userId: data.userId,
          changeSummary: data.changeSummary,
        },
      });
    } catch (error) {
      // If there's a foreign key constraint error, try again with null userId
      if (error.code === 'P2003' && data.userId !== null) {
        console.warn(
          `Audit log failed due to invalid userId ${data.userId}, retrying with null`,
        );
        return await this.prisma.auditLog.create({
          data: {
            action: data.action,
            entityName: data.entityName,
            entityId: data.entityId,
            userId: null,
            changeSummary: data.changeSummary,
          },
        });
      }
      throw error;
    }
  }

  async logAsync(data: AuditLogData): Promise<void> {
    // Fire and forget - doesn't block the main operation
    this.log(data).catch(console.error);
  }

  async findAll(query?: ListAuditLogsDto): Promise<PaginatedResult<AuditLog>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortBy = query?.sortBy ?? 'id';
    const sortDir = query?.sortDir ?? 'desc';

    const where: Prisma.AuditLogWhereInput = {};

    if (query?.entityName) where.entityName = query.entityName;
    if (query?.action) where.action = query.action;
    if (query?.userId) where.userId = query.userId;
    if (query?.entityId) where.entityId = query.entityId;

    if (query?.startDate || query?.endDate) {
      where.timestamp = {};
      if (query.startDate) {
        where.timestamp.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.timestamp.lte = new Date(query.endDate);
      }
    }

    const [totalItems, data] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, username: true, fullName: true },
          },
        },
      }),
    ]);

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

  async findOne(id: number): Promise<AuditLog> {
    const auditLog = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, username: true, fullName: true },
        },
      },
    });

    if (!auditLog) {
      throw new NotFoundException(`Audit log with ID ${id} not found`);
    }

    return auditLog;
  }

  async findByEntity(
    entityName: string,
    entityId: number,
  ): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: {
        entityName,
        entityId,
      },
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: { id: true, username: true, fullName: true },
        },
      },
    });
  }
}
