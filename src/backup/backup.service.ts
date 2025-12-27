import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { HttpException, HttpStatus } from '@nestjs/common';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupsDir = path.join(process.cwd(), 'backups');

  constructor(private prisma: PrismaService) {
    // Ensure backups directory exists
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  /**
   * Parse DATABASE_URL to extract connection details
   */
  private parseDatabaseUrl(): {
    host: string;
    port: string;
    database: string;
    user: string;
    password: string;
  } {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new HttpException(
        'DATABASE_URL environment variable is not set',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Parse postgresql://user:password@host:port/database?schema=public
    const urlPattern =
      /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?$/;
    const match = databaseUrl.match(urlPattern);

    if (!match) {
      throw new HttpException(
        'Invalid DATABASE_URL format',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      user: match[1],
      password: match[2],
      host: match[3],
      port: match[4],
      database: match[5],
    };
  }

  /**
   * Create a database backup using pg_dump
   */
  async createBackup(): Promise<{
    filePath: string;
    fileName: string;
    size: number;
  }> {
    try {
      const dbConfig = this.parseDatabaseUrl();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `backup_${timestamp}.dump`;
      const filePath = path.join(this.backupsDir, fileName);

      // Set PGPASSWORD environment variable for pg_dump
      const env = {
        ...process.env,
        PGPASSWORD: dbConfig.password,
      };

      // Build pg_dump command
      const command = `pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -F c -f "${filePath}"`;

      this.logger.log(`Creating backup: ${fileName}`);
      await execAsync(command, { env });

      // Check if file was created
      if (!fs.existsSync(filePath)) {
        throw new Error('Backup file was not created');
      }

      const stats = fs.statSync(filePath);
      const size = stats.size;

      this.logger.log(`Backup created successfully: ${fileName} (${size} bytes)`);

      return {
        filePath,
        fileName,
        size,
      };
    } catch (error) {
      this.logger.error(`Failed to create backup: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to create backup: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get backup file buffer
   */
  getBackupFile(filePath: string): Buffer {
    if (!fs.existsSync(filePath)) {
      throw new HttpException(
        'Backup file not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return fs.readFileSync(filePath);
  }

  /**
   * Restore database from backup file using pg_restore
   */
  async restoreBackup(filePath: string): Promise<void> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new HttpException(
          'Backup file not found',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check if database has existing data
      const hasData = await this.checkExistingData();
      if (hasData.hasData) {
        throw new HttpException(
          'Database has existing data. Cannot restore backup. Please clear the database first.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const dbConfig = this.parseDatabaseUrl();

      // Set PGPASSWORD environment variable for pg_restore
      const env = {
        ...process.env,
        PGPASSWORD: dbConfig.password,
      };

      // Build pg_restore command
      // -c: clean (drop) database objects before recreating
      // -d: database name
      const command = `pg_restore -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -c "${filePath}"`;

      this.logger.log(`Restoring backup from: ${filePath}`);
      await execAsync(command, { env });

      this.logger.log('Backup restored successfully');
    } catch (error) {
      this.logger.error(
        `Failed to restore backup: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to restore backup: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Check if database has existing data
   */
  async checkExistingData(): Promise<{
    hasData: boolean;
    counts: {
      drugs: number;
      batches: number;
      transactions: number;
      users: number;
      suppliers: number;
      purchaseOrders: number;
    };
  }> {
    try {
      const [drugs, batches, transactions, users, suppliers, purchaseOrders] =
        await Promise.all([
          this.prisma.drug.count(),
          this.prisma.batch.count(),
          this.prisma.transaction.count(),
          this.prisma.user.count(),
          this.prisma.supplier.count(),
          this.prisma.purchaseOrder.count(),
        ]);

      const counts = {
        drugs,
        batches,
        transactions,
        users,
        suppliers,
        purchaseOrders,
      };

      const hasData =
        drugs > 0 ||
        batches > 0 ||
        transactions > 0 ||
        users > 1 || // More than 1 because there's always at least one admin user
        suppliers > 0 ||
        purchaseOrders > 0;

      return {
        hasData,
        counts,
      };
    } catch (error) {
      this.logger.error(
        `Failed to check existing data: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to check existing data: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

