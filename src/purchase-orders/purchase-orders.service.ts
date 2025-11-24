import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Scope,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrder, PurchaseOrderItem, Prisma } from '@prisma/client';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ListPurchaseOrdersDto,
  CreatePurchaseOrderItemDto,
  UpdatePurchaseOrderItemDto,
  PaginatedResult,
} from './dto';
import { CreatePurchaseOrderWithItemsDto } from './dto/create-purchase-order-with-items.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';

@Injectable({ scope: Scope.REQUEST })
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  @Audit({
    entityName: 'PurchaseOrder',
    action: 'CREATE',
    changeSummary: (result) =>
      `Created purchase order #${result.orderNumber} for supplier ${result.supplierId}`,
  })
  async create(data: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const toDate = (value?: string): Date | undefined => {
      if (!value) return undefined;
      const trimmed = value.trim();
      // Accept ISO strings directly (assumed UTC if ending with Z)
      if (trimmed.includes('T')) {
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? undefined : d;
      }
      // Accept 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DD' as UTC (not local)
      const parts = trimmed.split(' ');
      const [y, m, d] = parts[0].split('-').map((n) => parseInt(n, 10));
      let hh = 0,
        mm = 0,
        ss = 0;
      if (parts[1]) {
        const t = parts[1].split(':').map((n) => parseInt(n, 10));
        hh = t[0] || 0;
        mm = t[1] || 0;
        ss = t[2] || 0;
      }
      const utcMs = Date.UTC(
        y,
        (m || 1) - 1,
        d || 1,
        hh || 0,
        mm || 0,
        ss || 0,
      );
      const date = new Date(utcMs);
      return isNaN(date.getTime()) ? undefined : date;
    };
    // Validate supplier exists
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: data.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException(
        `Supplier with ID ${data.supplierId} not found`,
      );
    }

    return this.prisma.purchaseOrder.create({
      data: {
        supplierId: data.supplierId,
        createdDate: toDate(data.createdDate),
        expectedDate: toDate(data.expectedDate),
        status: data.status,
      },
    });
  }

  @Audit({
    entityName: 'PurchaseOrder',
    action: 'CREATE_WITH_ITEMS',
    changeSummary: (result) =>
      `Created purchase order #${result.id} for supplier ${result.supplierId} with ${result.items?.length || 0} items`,
  })
  async createWithItems(
    data: CreatePurchaseOrderWithItemsDto,
  ): Promise<PurchaseOrder & { items: PurchaseOrderItem[] }> {
    const toDate = (value?: string): Date | undefined => {
      if (!value) return undefined;
      const trimmed = value.trim();
      // Accept ISO strings directly (assumed UTC if ending with Z)
      if (trimmed.includes('T')) {
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? undefined : d;
      }
      // Accept 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DD' as UTC (not local)
      const parts = trimmed.split(' ');
      const [y, m, d] = parts[0].split('-').map((n) => parseInt(n, 10));
      let hh = 0,
        mm = 0,
        ss = 0;
      if (parts[1]) {
        const t = parts[1].split(':').map((n) => parseInt(n, 10));
        hh = t[0] || 0;
        mm = t[1] || 0;
        ss = t[2] || 0;
      }
      const utcMs = Date.UTC(
        y,
        (m || 1) - 1,
        d || 1,
        hh || 0,
        mm || 0,
        ss || 0,
      );
      const date = new Date(utcMs);
      return isNaN(date.getTime()) ? undefined : date;
    };

    // Validate supplier exists
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: data.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException(
        `Supplier with ID ${data.supplierId} not found`,
      );
    }

    // Validate all items before creating anything
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException(
        'Purchase order must have at least one item',
      );
    }

    // Validate all drugs exist
    const drugIds = data.items.map((item) => item.drugId);
    const existingDrugs = await this.prisma.drug.findMany({
      where: { id: { in: drugIds } },
      select: { id: true },
    });
    const existingDrugIds = new Set(existingDrugs.map((drug) => drug.id));
    const missingDrugIds = drugIds.filter((id) => !existingDrugIds.has(id));
    if (missingDrugIds.length > 0) {
      throw new NotFoundException(
        `Drugs with IDs ${missingDrugIds.join(', ')} not found`,
      );
    }

    // Validate all batches exist (if specified)
    const batchIds = data.items
      .filter((item) => item.batchId)
      .map((item) => item.batchId!);
    if (batchIds.length > 0) {
      const existingBatches = await this.prisma.batch.findMany({
        where: { id: { in: batchIds } },
        select: { id: true },
      });
      const existingBatchIds = new Set(
        existingBatches.map((batch) => batch.id),
      );
      const missingBatchIds = batchIds.filter(
        (id) => !existingBatchIds.has(id),
      );
      if (missingBatchIds.length > 0) {
        throw new NotFoundException(
          `Batches with IDs ${missingBatchIds.join(', ')} not found`,
        );
      }
    }

    // Use transaction to ensure atomicity
    return await this.prisma.$transaction(async (prisma) => {
      // Create the purchase order
      const purchaseOrder = await prisma.purchaseOrder.create({
        data: {
          supplierId: data.supplierId,
          createdDate: toDate(data.createdDate),
          expectedDate: toDate(data.expectedDate),
          status: data.status,
        },
      });

      // Create all items
      const items = await Promise.all(
        data.items.map((item) =>
          prisma.purchaseOrderItem.create({
            data: {
              purchaseOrderId: purchaseOrder.id,
              drugId: item.drugId,
              batchId: item.batchId,
              quantityOrdered: item.quantityOrdered,
              quantityReceived:
                typeof item.quantityReceived === 'number'
                  ? item.quantityReceived
                  : 0,
              manufactureDate: item.manufactureDate
                ? new Date(item.manufactureDate)
                : null,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
              unitCost: item.unitCost,
              status: item.status,
            },
            include: {
              drug: true,
              batch: true,
            },
          }),
        ),
      );

      return {
        ...purchaseOrder,
        items,
      };
    });
  }

  async findAll(
    query?: ListPurchaseOrdersDto,
  ): Promise<PaginatedResult<PurchaseOrder>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;
    const sortBy = query?.sortBy ?? 'id';
    const sortDir = query?.sortDir ?? 'desc';

    const where: Prisma.PurchaseOrderWhereInput = {};

    // Filters
    if (query?.supplierId) where.supplierId = query.supplierId;
    if (query?.status)
      (where as any).status = { equals: query.status, mode: 'insensitive' };

    // Date range filter
    if (query?.createdFrom || query?.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        (where.createdAt as any).gte = new Date(query.createdFrom);
      }
      if (query.createdTo) {
        (where.createdAt as any).lte = new Date(query.createdTo);
      }
    }

    // Search functionality
    if (query?.search) {
      where.OR = [
        { status: { contains: query.search, mode: 'insensitive' } },
        {
          supplier: {
            name: { contains: query.search, mode: 'insensitive' },
          } as any,
        },
      ];
    }

    const [totalItems, data] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: true,
          items: {
            include: {
              drug: true,
              batch: true,
            },
          },
        },
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

  async findOne(id: number): Promise<PurchaseOrder> {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: {
            drug: true,
            batch: true,
          },
        },
      },
    });
    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }
    return purchaseOrder;
  }

  @Audit({
    entityName: 'PurchaseOrder',
    action: 'UPDATE',
    changeSummary: (result) => `Updated purchase order #${result.orderNumber}`,
  })
  async update(
    id: number,
    data: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    try {
      const toDate = (value?: string): Date | undefined => {
        if (!value) return undefined;
        const trimmed = value.trim();
        if (trimmed.includes('T')) {
          const d = new Date(trimmed);
          return isNaN(d.getTime()) ? undefined : d;
        }
        const parts = trimmed.split(' ');
        const [y, m, d] = parts[0].split('-').map((n) => parseInt(n, 10));
        let hh = 0,
          mm = 0,
          ss = 0;
        if (parts[1]) {
          const t = parts[1].split(':').map((n) => parseInt(n, 10));
          hh = t[0] || 0;
          mm = t[1] || 0;
          ss = t[2] || 0;
        }
        const utcMs = Date.UTC(
          y,
          (m || 1) - 1,
          d || 1,
          hh || 0,
          mm || 0,
          ss || 0,
        );
        const date = new Date(utcMs);
        return isNaN(date.getTime()) ? undefined : date;
      };
      // Validate supplier if updating
      if (data.supplierId) {
        const supplier = await this.prisma.supplier.findUnique({
          where: { id: data.supplierId },
        });
        if (!supplier) {
          throw new NotFoundException(
            `Supplier with ID ${data.supplierId} not found`,
          );
        }
      }

      return await this.prisma.purchaseOrder.update({
        where: { id },
        data: {
          ...data,
          createdDate: toDate(data.createdDate),
          expectedDate: toDate(data.expectedDate),
        },
      });
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundException(`Purchase order with ID ${id} not found`);
      }
      throw error;
    }
  }

  @Audit({
    entityName: 'PurchaseOrder',
    action: 'DELETE',
    changeSummary: (result) =>
      `Deleted purchase order #${result.orderNumber} and all its items`,
  })
  async remove(id: number): Promise<PurchaseOrder> {
    try {
      // With cascade delete, we can directly delete the purchase order
      // and all its items will be automatically deleted by the database
      return await this.prisma.purchaseOrder.delete({ where: { id } });
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundException(`Purchase order with ID ${id} not found`);
      }
      throw error;
    }
  }

  // Purchase Order Items methods
  @Audit({
    entityName: 'PurchaseOrderItem',
    action: 'CREATE',
    changeSummary: (result) =>
      `Added item to purchase order #${result.purchaseOrderId}`,
  })
  async createItem(
    purchaseOrderId: number,
    data: CreatePurchaseOrderItemDto,
  ): Promise<PurchaseOrderItem> {
    // Validate purchase order exists
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
    });
    if (!purchaseOrder) {
      throw new NotFoundException(
        `Purchase order with ID ${purchaseOrderId} not found`,
      );
    }

    // Validate drug exists
    const drug = await this.prisma.drug.findUnique({
      where: { id: data.drugId },
    });
    if (!drug) {
      throw new NotFoundException(`Drug with ID ${data.drugId} not found`);
    }

    // Validate batch if provided
    if (data.batchId) {
      const batch = await this.prisma.batch.findUnique({
        where: { id: data.batchId },
      });
      if (!batch) {
        throw new NotFoundException(`Batch with ID ${data.batchId} not found`);
      }
    }

    // Validate dates if provided
    if (data.manufactureDate && data.expiryDate) {
      const mfg = new Date(data.manufactureDate);
      const exp = new Date(data.expiryDate);
      if (exp <= mfg) {
        throw new BadRequestException(
          'Expiry date must be after manufacture date',
        );
      }
    }

    return this.prisma.purchaseOrderItem.create({
      data: {
        purchaseOrderId,
        drugId: data.drugId,
        batchId: data.batchId,
        quantityOrdered: data.quantityOrdered,
        quantityReceived:
          typeof data.quantityReceived === 'number' ? data.quantityReceived : 0,
        manufactureDate: data.manufactureDate
          ? new Date(data.manufactureDate)
          : null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        unitCost: data.unitCost,
        status: data.status,
      },
      include: {
        drug: true,
        batch: true,
      },
    });
  }

  @Audit({
    entityName: 'PurchaseOrderItem',
    action: 'UPDATE',
    changeSummary: (result) =>
      `Updated item in purchase order #${result.purchaseOrderId}`,
  })
  async updateItem(
    id: number,
    data: UpdatePurchaseOrderItemDto,
  ): Promise<PurchaseOrderItem> {
    try {
      // Validate drug if updating
      if (data.drugId) {
        const drug = await this.prisma.drug.findUnique({
          where: { id: data.drugId },
        });
        if (!drug) {
          throw new NotFoundException(`Drug with ID ${data.drugId} not found`);
        }
      }

      // Validate batch if updating
      if (data.batchId) {
        const batch = await this.prisma.batch.findUnique({
          where: { id: data.batchId },
        });
        if (!batch) {
          throw new NotFoundException(
            `Batch with ID ${data.batchId} not found`,
          );
        }
      }

      // Validate dates if provided
      if (data.manufactureDate && data.expiryDate) {
        const mfg = new Date(data.manufactureDate);
        const exp = new Date(data.expiryDate);
        if (exp <= mfg) {
          throw new BadRequestException(
            'Expiry date must be after manufacture date',
          );
        }
      }

      return await this.prisma.purchaseOrderItem.update({
        where: { id },
        data: {
          ...data,
          manufactureDate: data.manufactureDate
            ? new Date(data.manufactureDate)
            : undefined,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        },
        include: {
          drug: true,
          batch: true,
        },
      });
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundException(
          `Purchase order item with ID ${id} not found`,
        );
      }
      throw error;
    }
  }

  @Audit({
    entityName: 'PurchaseOrderItem',
    action: 'DELETE',
    changeSummary: (result) =>
      `Removed item from purchase order #${result.purchaseOrderId}`,
  })
  async removeItem(id: number): Promise<PurchaseOrderItem> {
    try {
      return await this.prisma.purchaseOrderItem.delete({ where: { id } });
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundException(
          `Purchase order item with ID ${id} not found`,
        );
      }
      throw error;
    }
  }
}
