import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationSeverity, NotificationType } from './dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WARNING_DAYS = 30;
// Reminder stages before expiry; each batch is notified once per stage
const NEAR_EXPIRY_STAGES = [1, 3, 7, 14, 30];

const formatDay = (d: Date) => d.toISOString().slice(0, 10);

interface ExpiryNotification {
  notificationType: NotificationType;
  severity: NotificationSeverity;
  message: string;
  expiresAt: Date | null;
}

/**
 * Creates near-expiry and expired notifications for batches with stock.
 *
 * This is a singleton on purpose: NotificationsService is request-scoped, and
 * Nest never runs lifecycle hooks or @Cron jobs on request-scoped providers,
 * so expiry scans there never ran.
 *
 * The scan is idempotent: every notification has a fixed message per batch and
 * stage, and a message that already exists (read or unread) is not repeated.
 */
@Injectable()
export class ExpiryScannerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpiryScannerService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    // Don't block startup on the scan
    void this.bootstrap();
  }

  private async bootstrap() {
    try {
      await this.ensureNotificationDefaults();
    } catch (e) {
      this.logger.warn(
        `ensureNotificationDefaults failed: ${(e as Error).message}`,
      );
    }
    await this.scan();
  }

  // Hourly so the scan still happens when the app isn't running at midnight
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledScan() {
    await this.scan();
  }

  async scan(): Promise<{ created: number }> {
    if (this.running) return { created: 0 };
    this.running = true;
    try {
      const created = await this.performScan();
      this.logger.log(`Expiry scan done, ${created} notification(s) created`);
      return { created };
    } catch (e) {
      this.logger.error(`Expiry scan failed: ${(e as Error).message}`);
      return { created: 0 };
    } finally {
      this.running = false;
    }
  }

  private async performScan(): Promise<number> {
    const warningDays = await this.getWarningDays();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const stages = [
      ...NEAR_EXPIRY_STAGES.filter((s) => s < warningDays),
      warningDays,
    ];

    const batches = await this.prisma.batch.findMany({
      where: {
        currentQty: { gt: 0 },
        expiryDate: {
          lte: new Date(startOfToday.getTime() + (warningDays + 1) * DAY_MS),
        },
      },
      select: {
        id: true,
        batchNumber: true,
        expiryDate: true,
        drug: { select: { genericName: true, tradeName: true } },
      },
    });

    const candidates = batches.flatMap((batch): ExpiryNotification[] => {
      const label = `Batch ${batch.batchNumber ? `#${batch.batchNumber}` : `#${batch.id}`} (${
        batch.drug.tradeName?.trim()
          ? `${batch.drug.genericName} (${batch.drug.tradeName})`
          : batch.drug.genericName
      })`;
      const expiry = formatDay(batch.expiryDate);

      if (batch.expiryDate < now) {
        return [
          {
            notificationType: NotificationType.EXPIRED,
            severity: NotificationSeverity.HIGH,
            message: `${label} expired on ${expiry}`,
            expiresAt: null,
          },
        ];
      }

      const daysLeft = Math.max(
        0,
        Math.ceil(
          (batch.expiryDate.getTime() - startOfToday.getTime()) / DAY_MS,
        ),
      );
      const stage = stages.find((s) => daysLeft <= s);
      if (stage === undefined) return [];

      return [
        {
          notificationType: NotificationType.NEAR_EXPIRY,
          severity:
            stage <= 1
              ? NotificationSeverity.HIGH
              : stage <= 7
                ? NotificationSeverity.MEDIUM
                : NotificationSeverity.LOW,
          message: `${label} expires within ${stage} day${stage > 1 ? 's' : ''} (on ${expiry})`,
          expiresAt: batch.expiryDate,
        },
      ];
    });

    if (candidates.length === 0) return 0;

    // Skip messages that already exist, read or unread, so each batch is
    // notified once per stage
    const existing = await this.prisma.notification.findMany({
      where: {
        notificationType: {
          in: [NotificationType.NEAR_EXPIRY, NotificationType.EXPIRED],
        },
        message: { in: candidates.map((c) => c.message) },
      },
      select: { notificationType: true, message: true },
    });
    const seen = new Set(
      existing.map((n) => `${n.notificationType}|${n.message}`),
    );
    const toCreate = candidates.filter(
      (c) => !seen.has(`${c.notificationType}|${c.message}`),
    );
    if (toCreate.length === 0) return 0;

    const result = await this.prisma.notification.createMany({
      data: toCreate.map((c) => ({ ...c, isRead: false, readAt: null })),
    });
    return result.count;
  }

  private async getWarningDays(): Promise<number> {
    const config = await this.prisma.generalConfig.findUnique({
      where: { key: 'expiry_warning_days' },
      select: { value: true },
    });
    const days = Number(config?.value);
    return Number.isInteger(days) && days > 0 ? days : DEFAULT_WARNING_DAYS;
  }

  // Some legacy rows may have isRead = NULL; force them to false
  // and ensure readAt is null when isRead is false
  private async ensureNotificationDefaults(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'UPDATE "notifications" SET "isRead" = false WHERE "isRead" IS NULL',
    );
    await this.prisma.$executeRawUnsafe(
      'UPDATE "notifications" SET "readAt" = NULL WHERE "isRead" = false',
    );
  }
}
