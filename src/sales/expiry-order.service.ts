import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const EXPIRY_ORDER_POLICY_KEY = 'sale_expiry_order_policy';
export const EXPIRY_ORDER_POLICIES = ['off', 'warn', 'block'] as const;
export type ExpiryOrderPolicy = (typeof EXPIRY_ORDER_POLICIES)[number];
const DEFAULT_POLICY: ExpiryOrderPolicy = 'warn';

export interface SoonerBatch {
  batchId: number;
  batchNumber: string | null;
  expiryDate: Date;
  availableQty: number; // stock left in that batch after this sale
}

export interface ExpiryOrderConflict {
  batchId: number;
  batchNumber: string | null;
  drugName: string;
  expiryDate: Date;
  soonerBatches: SoonerBatch[];
}

export interface ExpiryOrderCheckResult {
  policy: ExpiryOrderPolicy;
  conflicts: ExpiryOrderConflict[];
}

// Calendar day key so batches expiring on the same day never conflict
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Checks that sales take stock from the soonest-expiring batch first (FEFO).
 * A sale line conflicts when another non-expired batch of the same drug
 * expires on an earlier day and still has stock left after this sale.
 */
@Injectable()
export class ExpiryOrderService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpiryOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Make the setting visible on the settings page for existing installs too
  async onApplicationBootstrap() {
    try {
      await this.ensurePolicyConfig();
    } catch (e) {
      this.logger.warn(
        `Could not create ${EXPIRY_ORDER_POLICY_KEY} setting: ${(e as Error).message}`,
      );
    }
  }

  async getPolicy(): Promise<ExpiryOrderPolicy> {
    const config = await this.prisma.generalConfig.findUnique({
      where: { key: EXPIRY_ORDER_POLICY_KEY },
      select: { value: true },
    });
    const value = config?.value?.trim().toLowerCase();
    return (EXPIRY_ORDER_POLICIES as readonly string[]).includes(value ?? '')
      ? (value as ExpiryOrderPolicy)
      : DEFAULT_POLICY;
  }

  // Creates the setting with the default value if it doesn't exist yet
  async ensurePolicyConfig(): Promise<void> {
    await this.prisma.generalConfig.upsert({
      where: { key: EXPIRY_ORDER_POLICY_KEY },
      update: {},
      create: {
        key: EXPIRY_ORDER_POLICY_KEY,
        value: DEFAULT_POLICY,
        dataType: 'string',
        category: 'sales',
        description:
          'When selling from a batch while the same product has a batch expiring sooner: off, warn, or block',
      },
    });
  }

  async check(
    items: { batchId: number; quantity: number }[],
  ): Promise<ExpiryOrderCheckResult> {
    const policy = await this.getPolicy();
    if (policy === 'off' || items.length === 0) {
      return { policy, conflicts: [] };
    }

    // Total quantity this sale takes from each batch
    const requested = new Map<number, number>();
    for (const item of items) {
      requested.set(
        item.batchId,
        (requested.get(item.batchId) ?? 0) + item.quantity,
      );
    }

    const soldBatches = await this.prisma.batch.findMany({
      where: { id: { in: [...requested.keys()] } },
      select: {
        id: true,
        drugId: true,
        batchNumber: true,
        expiryDate: true,
        drug: { select: { genericName: true, tradeName: true } },
      },
    });
    if (soldBatches.length === 0) return { policy, conflicts: [] };

    // One query for every in-stock, non-expired batch of the drugs being sold
    const candidates = await this.prisma.batch.findMany({
      where: {
        drugId: { in: [...new Set(soldBatches.map((b) => b.drugId))] },
        currentQty: { gt: 0 },
        expiryDate: { gte: new Date() },
      },
      orderBy: { expiryDate: 'asc' },
      select: {
        id: true,
        drugId: true,
        batchNumber: true,
        expiryDate: true,
        currentQty: true,
      },
    });

    const conflicts: ExpiryOrderConflict[] = [];
    for (const sold of soldBatches) {
      const soonerBatches = candidates
        .filter(
          (c) =>
            c.drugId === sold.drugId &&
            c.id !== sold.id &&
            dayKey(c.expiryDate) < dayKey(sold.expiryDate),
        )
        .map((c) => ({
          batchId: c.id,
          batchNumber: c.batchNumber,
          expiryDate: c.expiryDate,
          availableQty: c.currentQty - (requested.get(c.id) ?? 0),
        }))
        .filter((c) => c.availableQty > 0);

      if (soonerBatches.length > 0) {
        const { genericName, tradeName } = sold.drug;
        conflicts.push({
          batchId: sold.id,
          batchNumber: sold.batchNumber,
          drugName: tradeName?.trim()
            ? `${genericName} (${tradeName})`
            : genericName,
          expiryDate: sold.expiryDate,
          soonerBatches,
        });
      }
    }

    return { policy, conflicts };
  }

  // Human-readable summary used in the error when the policy blocks a sale
  describe(conflicts: ExpiryOrderConflict[]): string {
    return conflicts
      .map((c) => {
        const label = c.batchNumber ? `#${c.batchNumber}` : `#${c.batchId}`;
        const sooner = c.soonerBatches
          .map(
            (s) =>
              `${s.batchNumber ? `#${s.batchNumber}` : `#${s.batchId}`} (expires ${dayKey(s.expiryDate)}, ${s.availableQty} left)`,
          )
          .join(', ');
        return `${c.drugName} batch ${label} expires ${dayKey(c.expiryDate)}, but these batches expire sooner: ${sooner}`;
      })
      .join('; ');
  }
}
