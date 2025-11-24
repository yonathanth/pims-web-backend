import { Injectable, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GeneralConfigsService } from '../general-configs/general-configs.service';
import { PrismaService } from '../prisma/prisma.service';
import { SetupAdminDto, SystemConfigDto } from './dto';

@Injectable()
export class SetupService {
  constructor(
    private readonly authService: AuthService,
    private readonly generalConfigsService: GeneralConfigsService,
    private readonly prisma: PrismaService,
  ) {}

  async getSetupStatus() {
    // Derive initialization status from real database state
    const hasUsers = await this.safeHasAnyUser();
    const hasAdminUsers = await this.safeHasAdminUser();
    const hasConfigs = await this.safeHasAnyConfig();

    return {
      initialized: hasUsers,
      hasUsers,
      hasAdminUsers,
      hasConfigs,
      hasCategories: false,
      hasSuppliers: false,
      hasLocations: false,
      setupComplete: hasAdminUsers || hasUsers,
    };
  }

  async setupSystem(admin: SetupAdminDto, systemConfig: SystemConfigDto) {
    const hasUsers = await this.safeHasAnyUser();
    if (hasUsers) {
      throw new ConflictException('System has already been initialized');
    }

    // Create initial admin user
    const adminUser = await this.authService.setupAdmin({
      username: admin.username,
      password: admin.password,
      fullName: admin.fullName,
      email: admin.email,
    });

    // Store only specified core configs during onboarding
    try {
      if (systemConfig.pharmacyName) {
        await this.generalConfigsService.create({
          key: 'pharmacy_name',
          value: systemConfig.pharmacyName,
          dataType: 'string',
          category: 'system',
          description: 'Pharmacy display name',
        } as any);
      }

      if (systemConfig.pharmacyAddress) {
        await this.generalConfigsService.create({
          key: 'pharmacy_address',
          value: systemConfig.pharmacyAddress,
          dataType: 'string',
          category: 'system',
          description: 'Pharmacy address',
        } as any);
      }

      if (systemConfig.pharmacyPhone) {
        await this.generalConfigsService.create({
          key: 'pharmacy_phone',
          value: systemConfig.pharmacyPhone,
          dataType: 'string',
          category: 'system',
          description: 'Pharmacy phone',
        } as any);
      }

      if ((systemConfig as any).pharmacyCity) {
        await this.generalConfigsService.create({
          key: 'pharmacy_city',
          value: String((systemConfig as any).pharmacyCity),
          dataType: 'string',
          category: 'system',
          description: 'Pharmacy city',
        } as any);
      }

      if ((systemConfig as any).apiUrl) {
        await this.generalConfigsService.create({
          key: 'api_url',
          value: String((systemConfig as any).apiUrl),
          dataType: 'string',
          category: 'system',
          description: 'API base URL',
        } as any);
      }

      if (systemConfig.lowStockThreshold) {
        await this.generalConfigsService.create({
          key: 'low_stock_threshold',
          value: String(systemConfig.lowStockThreshold),
          dataType: 'number',
          category: 'inventory',
          description: 'Default low stock threshold for batches',
        } as any);
      }

      if (systemConfig.expiryWarningDays) {
        await this.generalConfigsService.create({
          key: 'expiry_warning_days',
          value: String(systemConfig.expiryWarningDays),
          dataType: 'number',
          category: 'inventory',
          description: 'Days before expiry to show warning',
        } as any);
      }

      if (systemConfig.currency) {
        await this.generalConfigsService.create({
          key: 'currency',
          value: systemConfig.currency,
          dataType: 'string',
          category: 'system',
          description: 'Default currency for the pharmacy',
        } as any);
      }

      if (systemConfig.timezone) {
        await this.generalConfigsService.create({
          key: 'timezone',
          value: systemConfig.timezone,
          dataType: 'string',
          category: 'system',
          description: 'Timezone for the pharmacy',
        } as any);
      }
    } catch (e) {
      // Best-effort config creation; rethrow others
      throw e;
    }

    return {
      adminUser,
      systemConfig: {
        pharmacyName: systemConfig.pharmacyName,
        pharmacyAddress: systemConfig.pharmacyAddress,
        pharmacyPhone: systemConfig.pharmacyPhone,
        pharmacyCity: systemConfig.pharmacyCity,
        apiUrl: systemConfig.apiUrl,
        lowStockThreshold: systemConfig.lowStockThreshold,
        expiryWarningDays: systemConfig.expiryWarningDays,
        currency: systemConfig.currency,
        timezone: systemConfig.timezone,
      },
      message: 'System setup completed successfully',
    };
  }

  private async safeHasAnyUser(): Promise<boolean> {
    try {
      if (typeof (this.authService as any).hasAnyUser === 'function') {
        return await (this.authService as any).hasAnyUser();
      }
    } catch {}
    return false;
  }

  private async safeHasAdminUser(): Promise<boolean> {
    try {
      const count = await this.prisma.user.count({
        where: { role: 'ADMIN' as any },
      });
      return count > 0;
    } catch {
      return false;
    }
  }

  private async safeHasAnyConfig(): Promise<boolean> {
    try {
      const count = await this.prisma.generalConfig.count();
      return count > 0;
    } catch {
      return false;
    }
  }
}
