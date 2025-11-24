import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Scope,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Location, Prisma } from '@prisma/client';
import {
  CreateLocationDto,
  UpdateLocationDto,
  ListLocationsDto,
  PaginatedResult,
} from './dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';

@Injectable({ scope: Scope.REQUEST })
export class LocationsService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  @Audit({
    entityName: 'Location',
    action: 'CREATE',
    changeSummary: (result) =>
      `Created location "${result.name}" of type ${result.locationType}`,
  })
  async create(data: CreateLocationDto): Promise<Location> {
    // Check if location name already exists
    const existing = await this.prisma.location.findUnique({
      where: { name: data.name },
    });
    if (existing) {
      throw new ConflictException(
        `Location with name "${data.name}" already exists`,
      );
    }

    return this.prisma.location.create({
      data: {
        name: data.name,
        description: data.description,
        maxCapacity: data.maxCapacity,
        locationType: data.locationType,
        currentQty: 0, // Always start with 0
      },
    });
  }

  async findAll(query?: ListLocationsDto): Promise<PaginatedResult<Location>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;
    const sortBy = query?.sortBy ?? 'id';
    const sortDir = query?.sortDir ?? 'desc';

    const where: Prisma.LocationWhereInput = {};

    // Search functionality
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { locationType: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Filter by location type
    if (query?.locationType) {
      where.locationType = {
        contains: query.locationType,
        mode: 'insensitive',
      };
    }

    const [totalItems, data] = await this.prisma.$transaction([
      this.prisma.location.count({ where }),
      this.prisma.location.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
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

  async findOne(id: number): Promise<Location> {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new NotFoundException(`Location with ID ${id} not found`);
    }
    return location;
  }

  @Audit({
    entityName: 'Location',
    action: 'UPDATE',
    changeSummary: (result) => `Updated location "${result.name}"`,
  })
  async update(id: number, data: UpdateLocationDto): Promise<Location> {
    try {
      // Check if location exists
      const existing = await this.findOne(id);

      // If updating name, check for conflicts
      if (data.name && data.name !== existing.name) {
        const nameConflict = await this.prisma.location.findUnique({
          where: { name: data.name },
        });
        if (nameConflict) {
          throw new ConflictException(
            `Location with name "${data.name}" already exists`,
          );
        }
      }

      return await this.prisma.location.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Location with ID ${id} not found`);
      }
      throw error;
    }
  }

  @Audit({
    entityName: 'Location',
    action: 'DELETE',
    changeSummary: (result) => `Deleted location "${result.name}"`,
  })
  async remove(id: number): Promise<Location> {
    try {
      // Check if location has any batches
      const locationBatches = await this.prisma.locationBatch.findFirst({
        where: { locationId: id },
      });
      if (locationBatches) {
        throw new BadRequestException(
          'Cannot delete location that has batches. Please move or delete batches first.',
        );
      }

      return await this.prisma.location.delete({ where: { id } });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Location with ID ${id} not found`);
      }
      throw error;
    }
  }

  async findByBatch(batchId: number): Promise<Location[]> {
    // Ensure batch exists
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${batchId} not found`);
    }

    const mappings = await this.prisma.locationBatch.findMany({
      where: { batchId },
      include: { location: true },
    });
    return mappings.map((m) => m.location);
  }
}
