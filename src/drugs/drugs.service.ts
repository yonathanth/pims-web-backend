import {
  Injectable,
  ConflictException,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Drug, Prisma } from '@prisma/client';
import {
  CreateDrugDto,
  UpdateDrugDto,
  ListDrugsDto,
  PaginatedResult,
} from './dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';

@Injectable({ scope: Scope.REQUEST })
export class DrugsService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  @Audit({
    entityName: 'Drug',
    action: 'CREATE',
    changeSummary: (result) =>
      `Created drug "${result.genericName}" (SKU: ${result.sku})`,
  })
  async create(data: CreateDrugDto): Promise<Drug> {
    // Ensure category exists
    const category = await this.prisma.category.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Category with ID ${data.categoryId} not found`,
      );
    }
    // If SKU provided, enforce uniqueness
    if (data.sku) {
      const bySku = await this.prisma.drug.findUnique({
        where: { sku: data.sku },
      });
      if (bySku) {
        throw new ConflictException('Drug with this SKU already exists');
      }
    }
    // Create with provisional SKU if missing, then backfill with final SKU including id
    const { sku, ...rest } = data as any;
    if (!sku) {
      const baseName = rest.tradeName ?? rest.genericName ?? 'DR';
      const initials = this.generateBrandInitials(baseName);
      // Generate a provisional SKU to satisfy DB NOT NULL/unique
      let provisionalSku = `${initials}-TMP-${Date.now().toString().slice(-6)}`;
      const existingProv = await this.prisma.drug.findUnique({
        where: { sku: provisionalSku },
      });
      if (existingProv) {
        provisionalSku = `${initials}-TMP-${Date.now().toString().slice(-6)}-${Math.random()
          .toString(36)
          .slice(2, 6)
          .toUpperCase()}`;
      }
      const created = await this.prisma.drug.create({
        data: { ...rest, sku: provisionalSku },
      });
      const candidate = `${initials}-${created.id}`;
      const conflict = await this.prisma.drug.findUnique({
        where: { sku: candidate },
      });
      const finalSku = conflict
        ? `${candidate}-${Date.now().toString().slice(-4)}`
        : candidate;
      return await this.prisma.drug.update({
        where: { id: created.id },
        data: { sku: finalSku },
      });
    } else {
      return await this.prisma.drug.create({ data: { ...rest, sku } });
    }
  }

  private generateBrandInitials(name: string): string {
    const words = (name || 'DR').trim().split(/\s+/);
    if (words.length === 1) {
      return words[0]
        .slice(0, 2)
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase();
    }
    const firstTwo = words
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('');
    return firstTwo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  async findAll(
    query?: ListDrugsDto,
  ): Promise<PaginatedResult<Drug & { categoryName: string }>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;
    const sortBy = query?.sortBy ?? 'id';
    const sortDir = query?.sortDir ?? 'desc';

    const where: Prisma.DrugWhereInput = {};
    if (query?.search) {
      where.OR = [
        { sku: { contains: query.search, mode: 'insensitive' } },
        { genericName: { contains: query.search, mode: 'insensitive' } },
        { tradeName: { contains: query.search, mode: 'insensitive' } },
        { strength: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query?.categoryId) {
      where.categoryId = query.categoryId;
    }

    const [totalItems, rawData] = await this.prisma.$transaction([
      this.prisma.drug.count({ where }),
      this.prisma.drug.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
        include: {
          category: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    // Transform data to include categoryName
    const data = rawData.map((drug) => ({
      ...drug,
      categoryName: drug.category.name,
      category: undefined, // Remove the category object
    })) as (Drug & { categoryName: string })[];

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

  async findOne(id: number): Promise<Drug & { categoryName: string }> {
    const drug = await this.prisma.drug.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            name: true,
          },
        },
      },
    });
    if (!drug) {
      throw new NotFoundException(`Drug with ID ${id} not found`);
    }

    return {
      ...drug,
      categoryName: drug.category.name,
      category: undefined, // Remove the category object
    } as Drug & { categoryName: string };
  }

  @Audit({
    entityName: 'Drug',
    action: 'UPDATE',
    changeSummary: (result) =>
      `Updated drug "${result.genericName}" (SKU: ${result.sku})`,
  })
  async update(id: number, data: UpdateDrugDto): Promise<Drug> {
    try {
      if (data.sku) {
        const conflict = await this.prisma.drug.findUnique({
          where: { sku: data.sku },
        });
        if (conflict && conflict.id !== id) {
          throw new ConflictException('Drug with this SKU already exists');
        }
      }
      if (data.categoryId) {
        const category = await this.prisma.category.findUnique({
          where: { id: data.categoryId },
        });
        if (!category) {
          throw new NotFoundException(
            `Category with ID ${data.categoryId} not found`,
          );
        }
      }
      return await this.prisma.drug.update({ where: { id }, data });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Drug with ID ${id} not found`);
      }
      if (error.code === 'P2002') {
        throw new ConflictException('Drug with this SKU already exists');
      }
      throw error;
    }
  }

  @Audit({
    entityName: 'Drug',
    action: 'DELETE',
    changeSummary: (result) =>
      `Deleted drug "${result.genericName}" (SKU: ${result.sku})`,
  })
  async remove(id: number): Promise<Drug> {
    // Prevent delete if batches exist
    const hasBatches = await this.prisma.batch.findFirst({
      where: { drugId: id },
    });
    if (hasBatches) {
      throw new ConflictException('Cannot delete drug with associated batches');
    }
    try {
      return await this.prisma.drug.delete({ where: { id } });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Drug with ID ${id} not found`);
      }
      throw error;
    }
  }
}
