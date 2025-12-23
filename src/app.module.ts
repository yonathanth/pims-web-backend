import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { AuthModule } from './auth/auth.module';
import { DrugsModule } from './drugs/drugs.module';
import { BatchesModule } from './batches/batches.module';
import { LocationsModule } from './locations/locations.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { TransactionsModule } from './transactions/transactions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { GeneralConfigsModule } from './general-configs/general-configs.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SalesModule } from './sales/sales.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { UnitTypesModule } from './unit-types/unit-types.module';
import { BackupModule } from './backup/backup.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    CategoriesModule,
    SuppliersModule,
    AuthModule,
    DrugsModule,
    BatchesModule,
    LocationsModule,
    PurchaseOrdersModule,
    TransactionsModule,
    NotificationsModule,
    AuditLogModule,
    GeneralConfigsModule,
    ReportsModule,
    DashboardModule,
    SalesModule,
    AnalyticsModule,
    UnitTypesModule,
    BackupModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
