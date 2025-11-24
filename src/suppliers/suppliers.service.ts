import {
  Injectable,
  ConflictException,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Supplier, Prisma, PurchaseOrder } from '@prisma/client';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  ListSuppliersDto,
  ListSupplierOrdersDto,
  PaginatedResult,
} from './dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';

@Injectable({ scope: Scope.REQUEST })
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  @Audit({
    entityName: 'Supplier',
    action: 'CREATE',
    changeSummary: (result) => `Created supplier "${result.name}"`,
  })
  async create(data: CreateSupplierDto): Promise<Supplier> {
    // Check for existing supplier name
    const byName = await this.prisma.supplier.findFirst({
      where: { name: data.name },
    });
    if (byName) {
      throw new ConflictException('Supplier with this name already exists');
    }
    // Check for existing supplier email (if provided)
    if (data.email) {
      const byEmail = await this.prisma.supplier.findFirst({
        where: { email: data.email },
      });
      if (byEmail) {
        throw new ConflictException('Supplier with this email already exists');
      }
    }

    return await this.prisma.supplier.create({
      data,
    });
  }

  async findAll(query?: ListSuppliersDto): Promise<PaginatedResult<Supplier>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;
    const sortBy = query?.sortBy ?? 'id';
    const sortDir = query?.sortDir ?? 'desc';

    const where: Prisma.SupplierWhereInput = {};
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { contactName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [totalItems, data] = await this.prisma.$transaction([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
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

  async findOne(id: number): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    return supplier;
  }

  @Audit({
    entityName: 'Supplier',
    action: 'UPDATE',
    changeSummary: (result) => `Updated supplier "${result.name}"`,
  })
  async update(id: number, data: UpdateSupplierDto): Promise<Supplier> {
    try {
      // If updating name or email, ensure uniqueness separately
      if (data.name || data.email) {
        const current = await this.prisma.supplier.findUnique({
          where: { id },
        });
        if (!current) {
          throw new NotFoundException(`Supplier with ID ${id} not found`);
        }
        if (data.name && data.name !== current.name) {
          const nameConflict = await this.prisma.supplier.findFirst({
            where: { name: data.name, NOT: { id } },
          });
          if (nameConflict) {
            throw new ConflictException(
              'Supplier with this name already exists',
            );
          }
        }
        if (data.email && data.email !== current.email) {
          const emailConflict = await this.prisma.supplier.findFirst({
            where: { email: data.email, NOT: { id } },
          });
          if (emailConflict) {
            throw new ConflictException(
              'Supplier with this email already exists',
            );
          }
        }
      }
      return await this.prisma.supplier.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Supplier with ID ${id} not found`);
      }
      if (error.code === 'P2002') {
        const target = (error.meta?.target as string[]) ?? [];
        if (Array.isArray(target) && target.includes('name')) {
          throw new ConflictException('Supplier with this name already exists');
        }
        if (Array.isArray(target) && target.includes('email')) {
          throw new ConflictException(
            'Supplier with this email already exists',
          );
        }
        throw new ConflictException(
          'Supplier with provided unique field already exists',
        );
      }
      throw error;
    }
  }

  @Audit({
    entityName: 'Supplier',
    action: 'DELETE',
    changeSummary: (result) => `Deleted supplier "${result.name}"`,
  })
  async remove(id: number): Promise<Supplier> {
    try {
      // Check if supplier has associated batches or purchase orders
      const supplierWithRelations = await this.prisma.supplier.findUnique({
        where: { id },
        include: {
          batches: true,
          purchaseOrders: true,
        },
      });

      if (
        supplierWithRelations?.batches &&
        supplierWithRelations.batches.length > 0
      ) {
        throw new ConflictException(
          'Cannot delete supplier with associated batches. Please remove or reassign batches first.',
        );
      }

      if (
        supplierWithRelations?.purchaseOrders &&
        supplierWithRelations.purchaseOrders.length > 0
      ) {
        throw new ConflictException(
          'Cannot delete supplier with associated purchase orders. Please remove or reassign purchase orders first.',
        );
      }

      return await this.prisma.supplier.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Supplier with ID ${id} not found`);
      }
      throw error;
    }
  }

  async getSupplierOrders(
    supplierId: number,
    query: ListSupplierOrdersDto = new ListSupplierOrdersDto(),
  ): Promise<{
    data: (PurchaseOrder & { _count: { items: number } })[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    // First verify the supplier exists
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    // Map sort field names to Prisma field names
    const sortFieldMap: Record<string, string> = {
      created_at: 'createdDate',
      expected_date: 'expectedDate',
      createdDate: 'createdDate',
      expectedDate: 'expectedDate',
    };
    const sortBy =
      sortFieldMap[query.sort_by ?? 'createdDate'] ?? 'createdDate';
    const sortDir = query.descending ? 'desc' : 'asc';

    const where: Prisma.PurchaseOrderWhereInput = {
      supplierId,
    };

    if (query.status) {
      where.status = {
        contains: query.status,
        mode: 'insensitive',
      };
    }

    const [totalItems, data] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: limit,
        include: {
          _count: {
            select: { items: true },
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
}
