import {
  Injectable,
  ConflictException,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Category, Prisma } from '@prisma/client';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ListCategoriesDto,
  PaginatedResult,
} from './dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';

@Injectable({ scope: Scope.REQUEST })
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  @Audit({
    entityName: 'Category',
    action: 'CREATE',
    changeSummary: (result) => `Created category "${result.name}"`,
  })
  async create(data: CreateCategoryDto): Promise<Category> {
    try {
      // Pre-check: ensure category name is unique
      const existing = await this.prisma.category.findUnique({
        where: { name: data.name },
      });
      if (existing) {
        throw new ConflictException('Category with this name already exists');
      }
      return await this.prisma.category.create({
        data,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Category with this name already exists');
      }
      throw error;
    }
  }

  async findAll(
    query?: ListCategoriesDto,
  ): Promise<PaginatedResult<Category & { drugCount: number }>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;
    const sortBy = query?.sortBy ?? 'id';
    const sortDir = query?.sortDir ?? 'desc';

    const where: Prisma.CategoryWhereInput = {};
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy clause
    let orderBy: any;
    if (sortBy === 'drugCount') {
      // For relation count sorting, order by related model count
      orderBy = { drugs: { _count: sortDir } } as any;
    } else {
      orderBy = { [sortBy]: sortDir };
    }

    const [totalItems, rawData] = await this.prisma.$transaction([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              drugs: true,
            },
          },
        },
      }),
    ]);

    // Transform data to include drugCount
    const data = rawData.map((category) => ({
      ...category,
      drugCount: category._count.drugs,
      _count: undefined, // Remove the _count object
    })) as (Category & { drugCount: number })[];

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

  async findOne(id: number): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  @Audit({
    entityName: 'Category',
    action: 'UPDATE',
    changeSummary: (result) => `Updated category "${result.name}"`,
  })
  async update(id: number, data: UpdateCategoryDto): Promise<Category> {
    try {
      // If updating name, ensure uniqueness
      if (data.name) {
        const current = await this.prisma.category.findUnique({
          where: { id },
        });
        if (!current) {
          throw new NotFoundException(`Category with ID ${id} not found`);
        }
        if (current.name !== data.name) {
          const conflict = await this.prisma.category.findUnique({
            where: { name: data.name },
          });
          if (conflict && conflict.id !== id) {
            throw new ConflictException(
              'Category with this name already exists',
            );
          }
        }
      }
      return await this.prisma.category.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }
      if (error.code === 'P2002') {
        throw new ConflictException('Category with this name already exists');
      }
      throw error;
    }
  }

  @Audit({
    entityName: 'Category',
    action: 'DELETE',
    changeSummary: (result) => `Deleted category "${result.name}"`,
  })
  async remove(id: number): Promise<Category> {
    try {
      // Check if category has associated drugs
      const categoryWithDrugs = await this.prisma.category.findUnique({
        where: { id },
        include: { drugs: true },
      });

      if (categoryWithDrugs?.drugs && categoryWithDrugs.drugs.length > 0) {
        throw new ConflictException(
          'Cannot delete category with associated drugs. Please remove or reassign drugs first.',
        );
      }

      return await this.prisma.category.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }
      throw error;
    }
  }
}
