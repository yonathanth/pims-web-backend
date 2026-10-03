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
import { RequestContextService } from '../common/request-context.service';

@Injectable()
export class BatchesService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  // Helper function to format drug name as "genericName (tradeName)" or just "genericName"
  private formatDrugName(
    genericName: string,
    tradeName?: string | null,
  ): string {
    if (tradeName && tradeName.trim()) {
      return `${genericName} (${tradeName})`;
    }
    return genericName;
  }

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

    // Validate unit type exists
    const unitType = await this.prisma.unitType.findUnique({
      where: { id: data.unitTypeId },
    });
    if (!unitType)
      throw new NotFoundException(
        `Unit type with ID ${data.unitTypeId} not found`,
      );

    // Expiry after manufacture (only validate if manufactureDate is provided)
    if (data.manufactureDate) {
      const mfg = new Date(data.manufactureDate);
      const exp = new Date(data.expiryDate);
      if (exp <= mfg) {
        throw new BadRequestException(
          'Expiry date must be after manufacture date',
        );
      }
    }

    // Normalize batchNumber: convert empty string to null/undefined
    const normalizedBatchNumber =
      data.batchNumber && data.batchNumber.trim()
        ? data.batchNumber.trim()
        : undefined;

    // If batchNumber is provided, check for uniqueness
    if (normalizedBatchNumber) {
      const existing = await this.prisma.batch.findUnique({
        where: { batchNumber: normalizedBatchNumber },
      });
      if (existing) {
        throw new ConflictException(
          `Batch number "${normalizedBatchNumber}" already exists`,
        );
      }
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
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const batchData: any = {
            batchNumber: normalizedBatchNumber,
            drugId: data.drugId,
            supplierId: data.supplierId,
            unitTypeId: data.unitTypeId,
            expiryDate: new Date(data.expiryDate),
            unitPrice: data.unitPrice,
            unitCost: data.unitCost,
            purchaseDate: new Date(data.purchaseDate),
            currentQty: data.currentQty ?? 0,
            lowStockThreshold: data.lowStockThreshold ?? 10,
          };
          if (data.manufactureDate) {
            batchData.manufactureDate = new Date(data.manufactureDate);
          }
          const created = await tx.batch.create({
            data: batchData,
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
      } catch (error: any) {
        if (
          error.code === 'P2002' &&
          error.meta?.target?.includes('batchNumber')
        ) {
          throw new ConflictException(
            normalizedBatchNumber
              ? `Batch number "${normalizedBatchNumber}" already exists`
              : 'A batch with an empty batch number already exists',
          );
        }
        throw error;
      }
    } else {
      // Create batch without location mappings
      try {
        const batchData: any = {
          batchNumber: normalizedBatchNumber,
          drugId: data.drugId,
          supplierId: data.supplierId,
          unitTypeId: data.unitTypeId,
          expiryDate: new Date(data.expiryDate),
          unitPrice: data.unitPrice,
          unitCost: data.unitCost,
          purchaseDate: new Date(data.purchaseDate),
          currentQty: data.currentQty ?? 0,
          lowStockThreshold: data.lowStockThreshold ?? 10,
        };
        if (data.manufactureDate) {
          batchData.manufactureDate = new Date(data.manufactureDate);
        }
        return await this.prisma.batch.create({
          data: batchData,
        });
      } catch (error: any) {
        if (
          error.code === 'P2002' &&
          error.meta?.target?.includes('batchNumber')
        ) {
          throw new ConflictException(
            normalizedBatchNumber
              ? `Batch number "${normalizedBatchNumber}" already exists`
              : 'A batch with an empty batch number already exists',
          );
        }
        throw error;
      }
    }
  }

  async findAll(query?: ListBatchesDto): Promise<
    PaginatedResult<
      Batch & {
        drugSku: string;
        drugName: string;
        supplierName: string;
        unitTypeName?: string;
      }
    >
  > {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;
    const sortBy = query?.sortBy ?? 'expiryDate';
    const sortDir = query?.sortDir ?? 'asc';
    const stockStatus = query?.stockStatus ?? 'All';

    // Conditions are collected in AND so filters combine instead of overwriting each other
    const and: Prisma.BatchWhereInput[] = [];
    if (query?.supplierId) and.push({ supplierId: query.supplierId });
    if (query?.drugId) and.push({ drugId: query.drugId });
    if (query?.expiryFrom || query?.expiryTo) {
      const expiryDate: Prisma.DateTimeFilter = {};
      if (query.expiryFrom) expiryDate.gte = new Date(query.expiryFrom);
      if (query.expiryTo) expiryDate.lte = new Date(query.expiryTo);
      and.push({ expiryDate });
    }

    // Add stock status filtering
    if (stockStatus !== 'All') {
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(now.getDate() + 30);

      switch (stockStatus) {
        case 'In stock':
          // Includes expired batches that still have quantity
          and.push({ currentQty: { gt: 0 } });
          break;
        case 'Out of Stock':
          and.push({ currentQty: { lte: 0 } });
          break;
        case 'Sellable':
          // What a sale can use: has stock and hasn't expired
          and.push({ currentQty: { gt: 0 } });
          and.push({ expiryDate: { gte: now } });
          break;
        case 'Low Stock':
          // Use batch-specific low stock threshold, falling back to 10 when unset (0)
          and.push({ currentQty: { gt: 0 } });
          and.push({
            OR: [
              {
                lowStockThreshold: { gt: 0 },
                currentQty: {
                  lte: this.prisma.batch.fields.lowStockThreshold,
                },
              },
              { lowStockThreshold: { lte: 0 }, currentQty: { lte: 10 } },
            ],
          });
          break;
        case 'Expired':
          and.push({ expiryDate: { lt: now } });
          and.push({ currentQty: { gt: 0 } });
          break;
        case 'Near-Expiry':
          and.push({ expiryDate: { gte: now, lte: thirtyDaysFromNow } });
          and.push({ currentQty: { gt: 0 } });
          break;
      }
    }

    // Search via relations (drug.sku/name, supplier.name, category.name, location.name) or batchNumber
    if (query?.search) {
      and.push({
        OR: [
          {
            drug: {
              sku: { contains: query.search, mode: 'insensitive' },
            } as any,
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
            drug: {
              category: {
                name: { contains: query.search, mode: 'insensitive' },
              },
            } as any,
          },
          {
            supplier: {
              name: { contains: query.search, mode: 'insensitive' },
            } as any,
          },
          {
            batchNumber: { contains: query.search, mode: 'insensitive' },
          },
          {
            locationBatches: {
              some: {
                location: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            },
          },
        ],
      });
    }

    const where: Prisma.BatchWhereInput = and.length ? { AND: and } : {};

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
              strength: true,
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
          supplier: {
            select: {
              name: true,
            },
          },
          unitType: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const data = rawData.map((batch) => ({
      ...batch,
      drugSku: batch.drug.sku,
      drugName: this.formatDrugName(
        batch.drug.genericName,
        batch.drug.tradeName,
      ),
      drugStrength: batch.drug.strength,
      supplierName: batch.supplier.name,
      unitTypeName: batch.unitType?.name,
      drug: undefined, // Remove the drug object
      supplier: undefined, // Remove the supplier object
      unitType: undefined, // Remove the unitType object
    })) as (Batch & {
      drugSku: string;
      drugName: string;
      supplierName: string;
      unitTypeName?: string;
    })[];

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
            tradeName: true,
          },
        },
        supplier: {
          select: {
            name: true,
          },
        },
        unitType: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (!batch) throw new NotFoundException(`Batch with ID ${id} not found`);

    return {
      ...batch,
      drugSku: batch.drug.sku,
      drugName: this.formatDrugName(
        batch.drug.genericName,
        batch.drug.tradeName,
      ),
      supplierName: batch.supplier.name,
      unitTypeName: batch.unitType?.name,
      drug: undefined, // Remove the drug object
      supplier: undefined, // Remove the supplier object
      unitType: undefined, // Remove the unitType object (will be included in response)
    } as Batch & {
      drugSku: string;
      drugName: string;
      supplierName: string;
      unitTypeName?: string;
    };
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
      if (data.unitTypeId) {
        const unitType = await this.prisma.unitType.findUnique({
          where: { id: data.unitTypeId },
        });
        if (!unitType)
          throw new NotFoundException(
            `Unit type with ID ${data.unitTypeId} not found`,
          );
      }

      // Extract locationIds before updating batch (not a Batch model field)
      const { locationIds, ...batchData } = data;

      // Only allow admins to update quantity
      const currentUser = this.requestContext.getCurrentUser();
      if (batchData.currentQty !== undefined && currentUser?.role !== 'ADMIN') {
        throw new BadRequestException(
          'Only administrators can update batch quantity',
        );
      }

      // Normalize batchNumber: convert empty string to null/undefined
      if (batchData.batchNumber !== undefined) {
        const normalizedBatchNumber =
          batchData.batchNumber && batchData.batchNumber.trim()
            ? batchData.batchNumber.trim()
            : undefined;

        // If batchNumber is provided and different from current, check for uniqueness
        if (normalizedBatchNumber) {
          const existing = await this.prisma.batch.findUnique({
            where: { batchNumber: normalizedBatchNumber },
          });
          if (existing && existing.id !== id) {
            throw new ConflictException(
              `Batch number "${normalizedBatchNumber}" already exists`,
            );
          }
        }
        batchData.batchNumber = normalizedBatchNumber;
      }

      // Handle location updates if provided
      if (locationIds !== undefined) {
        const uniqueLocationIds = Array.from(new Set(locationIds));
        // Validate all provided locations exist
        if (uniqueLocationIds.length > 0) {
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

          // Only rebuild mappings when the set of locations actually changed,
          // so unrelated edits keep the per-location quantities intact
          const existing = await tx.locationBatch.findMany({
            where: { batchId: id },
            select: { locationId: true },
          });
          const existingIds = new Set(existing.map((e) => e.locationId));
          const unchanged =
            existingIds.size === uniqueLocationIds.length &&
            uniqueLocationIds.every((locId) => existingIds.has(locId));

          if (!unchanged) {
            await tx.locationBatch.deleteMany({
              where: { batchId: id },
            });

            if (uniqueLocationIds.length > 0) {
              await tx.locationBatch.createMany({
                data: uniqueLocationIds.map((locationId) => ({
                  locationId,
                  batchId: id,
                  quantity: Math.floor(
                    (updated.currentQty || 0) / uniqueLocationIds.length,
                  ),
                })),
              });
            }
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
    } catch (error: any) {
      if (error.code === 'P2025')
        throw new NotFoundException(`Batch with ID ${id} not found`);
      if (
        error.code === 'P2002' &&
        error.meta?.target?.includes('batchNumber')
      ) {
        const batchNumber = data?.batchNumber;
        throw new ConflictException(
          batchNumber
            ? `Batch number "${batchNumber}" already exists. Please use a unique batch number.`
            : 'A batch with an empty batch number already exists. Please use a unique batch number.',
        );
      }
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
      // Check if batch exists
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

      // Deletion is only for correcting mistaken entries. Batches with history
      // (transactions or purchase orders) can't be deleted by anyone, including
      // admins - write off the remaining stock with an adjustment instead.
      if (batchWithRelations.transactions.length > 0) {
        throw new ConflictException(
          'Cannot delete a batch that has transactions. Use a stock adjustment to write off its quantity instead.',
        );
      }

      if (batchWithRelations.purchaseOrderItems.length > 0) {
        throw new ConflictException(
          'Cannot delete a batch that is linked to a purchase order.',
        );
      }

      // Location assignments carry no history, so they are removed with the batch
      return await this.prisma.$transaction(async (tx) => {
        await tx.locationBatch.deleteMany({ where: { batchId: id } });
        return tx.batch.delete({ where: { id } });
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
