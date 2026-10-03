import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Minimal read/write access to general configs for background work.
 *
 * GeneralConfigsService is request-scoped (it needs the current user for
 * audit logs), and anything that injects it becomes request-scoped too, which
 * stops Nest from running its @Cron jobs and lifecycle hooks. Schedulers and
 * other singletons use this instead.
 */
@Injectable()
export class ConfigStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async getString(key: string): Promise<string | null> {
    const config = await this.prisma.generalConfig.findUnique({
      where: { key },
      select: { value: true },
    });
    return config?.value ?? null;
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const value = Number(await this.getString(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  // Same upsert as GeneralConfigsService.setTypedValue for string values
  async setString(key: string, value: string): Promise<void> {
    await this.prisma.generalConfig.upsert({
      where: { key },
      update: { value, dataType: 'string' },
      create: {
        key,
        value,
        dataType: 'string',
        category: 'system',
        description: `Auto-generated configuration for ${key}`,
      },
    });
  }
}
