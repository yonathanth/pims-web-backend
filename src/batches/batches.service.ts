import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Batch, Prisma } from '@prisma/client';
import {
  CreateBatchDto,
  UpdateBatchDto,
  ListBatchesDto,
  PaginatedResult,
} from './dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';

@Injectable()
export class BatchesService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
  ) {}

  @Audit({
    entityName: 'Batch',
    action: 'CREATE',
    changeSummary: (result) => `Created batch #${result.id}`,
  })
  async create(data: CreateBatchDto): Promise<Batch> {
    // Validate drug exists
    const drug = await this.prisma.drug.findUnique({
      where: { id: data.drugId },
    });
    if (!drug)
      throw new NotFoundException(`Drug with ID ${data.drugId} not found`);

    // Validate supplier exists
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: data.supplierId },
    });
    if (!supplier)
      throw new NotFoundException(
        `Supplier with ID ${data.supplierId} not found`,
      );

    // Expiry after manufacture
    const mfg = new Date(data.manufactureDate);
    const exp = new Date(data.expiryDate);
    if (exp <= mfg) {
      throw new BadRequestException(
        'Expiry date must be after manufacture date',
      );
    }

    // If locations are provided, validate them and create mapping rows
    if (data.locationIds && data.locationIds.length > 0) {
      // Ensure all provided locations exist
      const uniqueLocationIds = Array.from(new Set(data.locationIds));
      const locations = await this.prisma.location.findMany({
        where: { id: { in: uniqueLocationIds } },
        select: { id: true },
      });
      const foundIds = new Set(locations.map((l) => l.id));
      const missing = uniqueLocationIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new NotFoundException(
          `Location(s) not found: ${missing.join(', ')}`,
        );
      }

      // Create batch and mappings in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.batch.create({
          data: {
            drugId: data.drugId,
            supplierId: data.supplierId,
            manufactureDate: new Date(data.manufactureDate),
            expiryDate: new Date(data.expiryDate),
            unitPrice: data.unitPrice,
            unitCost: data.unitCost,
            purchaseDate: new Date(data.purchaseDate),
            currentQty: data.currentQty ?? 0,
            lowStockThreshold: data.lowStockThreshold ?? 10,
          },
        });

        if (uniqueLocationIds.length > 0) {
          await tx.locationBatch.createMany({
            data: uniqueLocationIds.map((locationId) => ({
              locationId,
              batchId: created.id,
              quantity: Math.floor(
                (data.currentQty ?? 0) / uniqueLocationIds.length,
              ),
            })),
          });
        }

        return created;
      });

      return result;
    } else {
      // Create batch without location mappings
      return this.prisma.batch.create({
        data: {
          drugId: data.drugId,
          supplierId: data.supplierId,
          manufactureDate: new Date(data.manufactureDate),
          expiryDate: new Date(data.expiryDate),
          unitPrice: data.unitPrice,
          unitCost: data.unitCost,
          purchaseDate: new Date(data.purchaseDate),
          currentQty: data.currentQty ?? 0,
          lowStockThreshold: data.lowStockThreshold ?? 10,
        },
      });
    }
  }

  async findAll(
    query?: ListBatchesDto,
  ): Promise<
    PaginatedResult<
      Batch & { drugSku: string; drugName: string; supplierName: string }
    >
  > {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;
    const sortBy = query?.sortBy ?? 'expiryDate';
    const sortDir = query?.sortDir ?? 'asc';
    const stockStatus = query?.stockStatus ?? 'All';

    const where: Prisma.BatchWhereInput = {};
    if (query?.supplierId) where.supplierId = query.supplierId;
    if (query?.drugId) where.drugId = query.drugId;
    if (query?.expiryFrom || query?.expiryTo) {
      where.expiryDate = {};
      if (query.expiryFrom)
        (where.expiryDate as any).gte = new Date(query.expiryFrom);
      if (query.expiryTo)
        (where.expiryDate as any).lte = new Date(query.expiryTo);
    }

    // Add stock status filtering
    if (stockStatus !== 'All') {
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(now.getDate() + 30);

      switch (stockStatus) {
        case 'In stock':
          where.currentQty = { gt: 0 };
          where.expiryDate = { gt: now };
          break;
        case 'Out of Stock':
          where.currentQty = { lte: 0 };
          break;
        case 'Low Stock':
          // Use batch-specific low stock threshold with fallback of 10
          where.currentQty = { gt: 0, lte: 10 }; // This will be refined in the query
          break;
        case 'Expired':
          where.expiryDate = { lt: now };
          where.currentQty = { gt: 0 };
          break;
        case 'Near-Expiry':
          where.expiryDate = {
            gte: now,
            lte: thirtyDaysFromNow,
          };
          where.currentQty = { gt: 0 };
          break;
      }
    }

    // Search via relations (drug.sku/name or supplier.name)
    if (query?.search) {
      where.OR = [
        {
          drug: { sku: { contains: query.search, mode: 'insensitive' } } as any,
        },
        {
          drug: {
            genericName: { contains: query.search, mode: 'insensitive' },
          } as any,
        },
        {
          drug: {
            tradeName: { contains: query.search, mode: 'insensitive' },
          } as any,
        },
        {
          supplier: {
            name: { contains: query.search, mode: 'insensitive' },
          } as any,
        },
      ];
    }

    // Build orderBy clause
    let orderBy: any;
    if (sortBy === 'drugName') {
      orderBy = { drug: { tradeName: sortDir } };
    } else if (sortBy === 'sku') {
      orderBy = { drug: { sku: sortDir } };
    } else {
      orderBy = { [sortBy]: sortDir };
    }

    const [totalItems, rawData] = await this.prisma.$transaction([
      this.prisma.batch.count({ where }),
      this.prisma.batch.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          drug: {
            select: {
              sku: true,
              genericName: true,
              tradeName: true,
            },
          },
          supplier: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    // Transform data and apply low stock filtering if needed
    let data = rawData.map((batch) => ({
      ...batch,
      drugSku: batch.drug.sku,
      drugName: batch.drug.tradeName ?? batch.drug.genericName,
      supplierName: batch.supplier.name,
      drug: undefined, // Remove the drug object
      supplier: undefined, // Remove the supplier object
    })) as (Batch & {
      drugSku: string;
      drugName: string;
      supplierName: string;
    })[];

    // Apply low stock filtering with batch-specific thresholds
    if (stockStatus === 'Low Stock') {
      data = data.filter((batch) => {
        const threshold = batch.lowStockThreshold || 10; // fallback to 10
        return batch.currentQty > 0 && batch.currentQty <= threshold;
      });
    }

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

  async findOne(
    id: number,
  ): Promise<
    Batch & { drugSku: string; drugName: string; supplierName: string }
  > {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: {
        drug: {
          select: {
            sku: true,
            genericName: true,
          },
        },
        supplier: {
          select: {
            name: true,
          },
        },
      },
    });
    if (!batch) throw new NotFoundException(`Batch with ID ${id} not found`);

    return {
      ...batch,
      drugSku: batch.drug.sku,
      drugName: batch.drug.genericName,
      supplierName: batch.supplier.name,
      drug: undefined, // Remove the drug object
      supplier: undefined, // Remove the supplier object
    } as Batch & { drugSku: string; drugName: string; supplierName: string };
  }

  @Audit({
    entityName: 'Batch',
    action: 'UPDATE',
    changeSummary: (result) => `Updated batch #${result.id}`,
  })
  async update(id: number, data: UpdateBatchDto): Promise<Batch> {
    try {
      if (data.manufactureDate && data.expiryDate) {
        const mfg = new Date(data.manufactureDate);
        const exp = new Date(data.expiryDate);
        if (exp <= mfg) {
          throw new BadRequestException(
            'Expiry date must be after manufacture date',
          );
        }
      }
      if (data.drugId) {
        const drug = await this.prisma.drug.findUnique({
          where: { id: data.drugId },
        });
        if (!drug)
          throw new NotFoundException(`Drug with ID ${data.drugId} not found`);
      }
      if (data.supplierId) {
        const supplier = await this.prisma.supplier.findUnique({
          where: { id: data.supplierId },
        });
        if (!supplier)
          throw new NotFoundException(
            `Supplier with ID ${data.supplierId} not found`,
          );
      }

      // Extract locationIds before updating batch (not a Batch model field)
      const { locationIds, ...batchData } = data;

      // Handle location updates if provided
      if (locationIds !== undefined) {
        // Validate all provided locations exist
        if (locationIds.length > 0) {
          const uniqueLocationIds = Array.from(new Set(locationIds));
          const locations = await this.prisma.location.findMany({
            where: { id: { in: uniqueLocationIds } },
            select: { id: true },
          });
          const foundIds = new Set(locations.map((l) => l.id));
          const missing = uniqueLocationIds.filter((id) => !foundIds.has(id));
          if (missing.length > 0) {
            throw new NotFoundException(
              `Location(s) not found: ${missing.join(', ')}`,
            );
          }
        }

        // Update batch and location mappings in a transaction
        return await this.prisma.$transaction(async (tx) => {
          // Update the batch
          const updated = await tx.batch.update({
            where: { id },
            data: {
              ...batchData,
              manufactureDate: batchData.manufactureDate
                ? new Date(batchData.manufactureDate)
                : undefined,
              expiryDate: batchData.expiryDate
                ? new Date(batchData.expiryDate)
                : undefined,
              purchaseDate: batchData.purchaseDate
                ? new Date(batchData.purchaseDate)
                : undefined,
            },
          });

          // Remove existing location mappings
          await tx.locationBatch.deleteMany({
            where: { batchId: id },
          });

          // Create new location mappings if any
          if (locationIds.length > 0) {
            await tx.locationBatch.createMany({
              data: locationIds.map((locationId) => ({
                locationId,
                batchId: id,
                quantity: Math.floor(
                  (updated.currentQty || 0) / locationIds.length,
                ),
              })),
            });
          }

          return updated;
        });
      } else {
        // No location updates, just update the batch
        return await this.prisma.batch.update({
          where: { id },
          data: {
            ...batchData,
            manufactureDate: batchData.manufactureDate
              ? new Date(batchData.manufactureDate)
              : undefined,
            expiryDate: batchData.expiryDate
              ? new Date(batchData.expiryDate)
              : undefined,
            purchaseDate: batchData.purchaseDate
              ? new Date(batchData.purchaseDate)
              : undefined,
          },
        });
      }
    } catch (error) {
      if (error.code === 'P2025')
        throw new NotFoundException(`Batch with ID ${id} not found`);
      throw error;
    }
  }

  @Audit({
    entityName: 'Batch',
    action: 'DELETE',
    changeSummary: (result) => `Deleted batch #${result.id}`,
  })
  async remove(id: number): Promise<Batch> {
    try {
      // Check if batch has associated transactions or purchase order items
      const batchWithRelations = await this.prisma.batch.findUnique({
        where: { id },
        include: {
          transactions: true,
          purchaseOrderItems: true,
          locationBatches: true,
        },
      });

      if (!batchWithRelations) {
        throw new NotFoundException(`Batch with ID ${id} not found`);
      }

      if (batchWithRelations.transactions.length > 0) {
        throw new ConflictException(
          'Cannot delete batch with associated transactions',
        );
      }

      if (batchWithRelations.purchaseOrderItems.length > 0) {
        throw new ConflictException(
          'Cannot delete batch with associated purchase order items',
        );
      }

      if (batchWithRelations.locationBatches.length > 0) {
        throw new ConflictException(
          'Cannot delete batch while it has inventory assigned to locations. Move or clear inventory first.',
        );
      }

      return await this.prisma.batch.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Batch with ID ${id} not found`);
      }
      if (error.code === 'P2003') {
        // Foreign key constraint failed
        throw new ConflictException(
          'Cannot delete batch due to related records (transactions, purchase orders, or inventory). Please remove related records first.',
        );
      }
      throw error;
    }
  }
}
