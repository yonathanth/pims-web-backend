import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigStoreService } from '../general-configs/config-store.service';
import { isAutoSyncEnabled } from '../common/cloud-sync';

interface SaleApprovedEvent {
  eventId: string; // stable per sale, so the cloud can drop retried duplicates
  saleRef: string;
  total: number;
  currency: string;
  itemCount: number;
  items: { name: string; quantity: number }[];
  approvedAt: string;
}

interface QueuedEvent {
  event: SaleApprovedEvent;
  queuedAt: number;
  attempts: number;
}

const MAX_QUEUE = 500;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS_IN_EVENT = 20;

/**
 * Tells the cloud API about each approved sale so it can send the owner a push
 * notification. Sending never blocks or fails a sale: events go to an
 * in-memory queue that is retried every minute while offline. Events still
 * queued when the app restarts are lost, but those sales still reach the cloud
 * through the regular analytics snapshot.
 */
@Injectable()
export class SalePushService {
  private readonly logger = new Logger(SalePushService.name);
  private readonly queue: QueuedEvent[] = [];
  private flushing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configStore: ConfigStoreService,
  ) {}

  // Approved group sale (several lines under one Sale)
  notifySaleGroupApproved(saleId: number): void {
    void this.enqueue(`sale-${saleId}`, `Sale #${saleId}`, { saleId });
  }

  // Approved single sale transaction (not part of a group)
  notifyTransactionApproved(transactionId: number): void {
    void this.enqueue(`txn-${transactionId}`, `Sale #T${transactionId}`, {
      id: transactionId,
    });
  }

  private async enqueue(
    eventId: string,
    saleRef: string,
    where: { saleId: number } | { id: number },
  ): Promise<void> {
    try {
      if (!this.isConfigured()) return;

      const lines = await this.prisma.transaction.findMany({
        where: { ...where, status: 'approved' },
        select: {
          quantity: true,
          unitPrice: true,
          updatedAt: true,
          batch: {
            select: {
              unitPrice: true,
              drug: { select: { genericName: true, tradeName: true } },
            },
          },
        },
      });
      if (lines.length === 0) return;

      // Combine lines of the same product (e.g. sold from two batches)
      const byName = new Map<string, number>();
      let total = 0;
      for (const line of lines) {
        const { genericName, tradeName } = line.batch.drug;
        const name = tradeName?.trim()
          ? `${genericName} (${tradeName})`
          : genericName;
        byName.set(name, (byName.get(name) ?? 0) + line.quantity);
        total += line.quantity * (line.unitPrice ?? line.batch.unitPrice ?? 0);
      }

      const items = [...byName.entries()].map(([name, quantity]) => ({
        name,
        quantity,
      }));
      const event: SaleApprovedEvent = {
        eventId,
        saleRef,
        total: Math.round(total * 100) / 100,
        currency: (await this.configStore.getString('currency')) || 'ETB',
        itemCount: items.length,
        items: items.slice(0, MAX_ITEMS_IN_EVENT),
        approvedAt: lines
          .reduce(
            (a, l) => (l.updatedAt > a ? l.updatedAt : a),
            lines[0].updatedAt,
          )
          .toISOString(),
      };

      if (this.queue.length >= MAX_QUEUE) this.queue.shift();
      this.queue.push({ event, queuedAt: Date.now(), attempts: 0 });
      await this.flush();
    } catch (e) {
      this.logger.warn(
        `Could not queue push for ${eventId}: ${(e as Error).message}`,
      );
    }
  }

  // Retries anything that failed while offline
  @Cron(CronExpression.EVERY_MINUTE)
  async retry(): Promise<void> {
    if (this.queue.length > 0) await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing || !this.isConfigured()) return;
    this.flushing = true;
    try {
      const now = Date.now();
      while (this.queue.length > 0) {
        const next = this.queue[0];
        if (now - next.queuedAt > MAX_AGE_MS) {
          this.queue.shift(); // too old to be useful as a notification
          continue;
        }
        try {
          await this.send(next.event);
          this.queue.shift();
        } catch (e: any) {
          next.attempts++;
          const status = e?.response?.status;
          // 4xx (except 408/429) means the cloud rejected it; retrying won't help
          if (
            status &&
            status >= 400 &&
            status < 500 &&
            ![408, 429].includes(status)
          ) {
            this.logger.warn(
              `Cloud rejected push for ${next.event.eventId} (${status}); dropping it`,
            );
            this.queue.shift();
            continue;
          }
          this.logger.debug(
            `Push for ${next.event.eventId} failed (attempt ${next.attempts}); will retry`,
          );
          break; // keep order; try again on the next retry tick
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async send(event: SaleApprovedEvent): Promise<void> {
    const baseUrl = process.env.REMOTE_ANALYTICS_BASE_URL!.replace(/\/$/, '');
    const pharmacyId = encodeURIComponent(
      process.env.REMOTE_ANALYTICS_PHARMACY_ID!,
    );
    await axios.post(`${baseUrl}/api/notify/sale/${pharmacyId}`, event, {
      headers: { 'x-api-key': process.env.REMOTE_ANALYTICS_API_KEY! },
      timeout: 15000,
    });
  }

  // Same cloud settings and on/off switch as the analytics uploads
  private isConfigured(): boolean {
    return (
      isAutoSyncEnabled() &&
      !!process.env.REMOTE_ANALYTICS_BASE_URL &&
      !!process.env.REMOTE_ANALYTICS_API_KEY &&
      !!process.env.REMOTE_ANALYTICS_PHARMACY_ID
    );
  }
}
