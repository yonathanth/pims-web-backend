import {
  Injectable,
  ConflictException,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UnitType, Prisma } from '@prisma/client';
import {
  CreateUnitTypeDto,
  UpdateUnitTypeDto,
  ListUnitTypesDto,
  PaginatedResult,
} from './dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';

@Injectable({ scope: Scope.REQUEST })
export class UnitTypesService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  @Audit({
    entityName: 'UnitType',
    action: 'CREATE',
    changeSummary: (result) => `Created unit type "${result.name}"`,
  })
  async create(data: CreateUnitTypeDto): Promise<UnitType> {
    try {
      // Pre-check: ensure unit type name is unique
      const existing = await this.prisma.unitType.findUnique({
        where: { name: data.name },
      });
      if (existing) {
        throw new ConflictException('Unit type with this name already exists');
      }
      return await this.prisma.unitType.create({
        data: {
          name: data.name,
          description: data.description,
          isActive: data.isActive ?? true,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Unit type with this name already exists');
      }
      throw error;
    }
  }

  async findAll(
    query?: ListUnitTypesDto,
  ): Promise<PaginatedResult<UnitType & { batchCount: number }>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;
    const sortBy = query?.sortBy ?? 'id';
    const sortDir = query?.sortDir ?? 'desc';

    const where: Prisma.UnitTypeWhereInput = {};
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    // Build orderBy clause
    let orderBy: any;
    if (sortBy === 'batchCount') {
      // For relation count sorting, order by related model count
      orderBy = { batches: { _count: sortDir } } as any;
    } else {
      orderBy = { [sortBy]: sortDir };
    }

    const [totalItems, rawData] = await this.prisma.$transaction([
      this.prisma.unitType.count({ where }),
      this.prisma.unitType.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              batches: true,
            },
          },
        },
      }),
    ]);

    // Transform data to include batchCount
    const data = rawData.map((unitType) => ({
      ...unitType,
      batchCount: unitType._count.batches,
      _count: undefined, // Remove the _count object
    })) as (UnitType & { batchCount: number })[];

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

  async findOne(id: number): Promise<UnitType> {
    const unitType = await this.prisma.unitType.findUnique({
      where: { id },
    });

    if (!unitType) {
      throw new NotFoundException(`Unit type with ID ${id} not found`);
    }

    return unitType;
  }

  @Audit({
    entityName: 'UnitType',
    action: 'UPDATE',
    changeSummary: (result) => `Updated unit type "${result.name}"`,
  })
  async update(id: number, data: UpdateUnitTypeDto): Promise<UnitType> {
    try {
      // If updating name, ensure uniqueness
      if (data.name) {
        const current = await this.prisma.unitType.findUnique({
          where: { id },
        });
        if (!current) {
          throw new NotFoundException(`Unit type with ID ${id} not found`);
        }
        if (current.name !== data.name) {
          const conflict = await this.prisma.unitType.findUnique({
            where: { name: data.name },
          });
          if (conflict && conflict.id !== id) {
            throw new ConflictException(
              'Unit type with this name already exists',
            );
          }
        }
      }
      return await this.prisma.unitType.update({
        where: { id },
        data,
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Unit type with ID ${id} not found`);
      }
      if (error.code === 'P2002') {
        throw new ConflictException('Unit type with this name already exists');
      }
      throw error;
    }
  }

  @Audit({
    entityName: 'UnitType',
    action: 'DELETE',
    changeSummary: (result) => `Deleted unit type "${result.name}"`,
  })
  async remove(id: number): Promise<UnitType> {
    try {
      // Check if unit type has associated batches
      const unitTypeWithBatches = await this.prisma.unitType.findUnique({
        where: { id },
        include: { batches: true },
      });

      if (unitTypeWithBatches?.batches && unitTypeWithBatches.batches.length > 0) {
        throw new ConflictException(
          'Cannot delete unit type with associated batches. Please remove or reassign batches first.',
        );
      }

      return await this.prisma.unitType.delete({
        where: { id },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Unit type with ID ${id} not found`);
      }
      throw error;
    }
  }
}

