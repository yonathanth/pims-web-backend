import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir = path.join(process.cwd(), 'backups');

  constructor(private prisma: PrismaService) {
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async createBackup(): Promise<{ filePath: string; fileName: string; size: number }> {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not configured');
    }

    // Parse database connection details
    const url = new URL(dbUrl);
    const dbName = url.pathname.slice(1).split('?')[0];
    const dbHost = url.hostname;
    const dbPort = url.port || '5432';
    const dbUser = url.username;
    const dbPassword = url.password;

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const fileName = `pims_backup_${timestamp}.dump`;
    const filePath = path.join(this.backupDir, fileName);

    this.logger.log(`Creating backup: ${dbName}@${dbHost}:${dbPort}`);

    try {
      // Create backup using pg_dump (custom format)
      const command = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -F c -f "${filePath}"`;
      
      await execAsync(command);
      
      const stats = fs.statSync(filePath);
      const sizeInMB = stats.size / (1024 * 1024);

      this.logger.log(`Backup created: ${fileName} (${sizeInMB.toFixed(2)} MB)`);

      return {
        filePath,
        fileName,
        size: stats.size,
      };
    } catch (error) {
      this.logger.error('Backup failed:', error);
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  async checkExistingData(): Promise<{ hasData: boolean; recordCounts: any }> {
    try {
      // Check multiple tables to see if database has data
      const [transactions, drugs, batches, users] = await Promise.all([
        this.prisma.transaction.count(),
        this.prisma.drug.count(),
        this.prisma.batch.count(),
        this.prisma.user.count(),
      ]);

      const hasData = transactions > 0 || drugs > 0 || batches > 0 || users > 1; // > 1 because there might be a default admin

      return {
        hasData,
        recordCounts: {
          transactions,
          drugs,
          batches,
          users,
        },
      };
    } catch (error) {
      this.logger.error('Failed to check existing data:', error);
      // If we can't check, assume no data to be safe
      return { hasData: false, recordCounts: {} };
    }
  }

  async restoreBackup(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new Error('Backup file not found');
    }

    // Check if database has existing data
    const { hasData } = await this.checkExistingData();
    if (hasData) {
      throw new BadRequestException(
        'Cannot restore backup: Database already contains data. Please use an empty database or contact support.',
      );
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not configured');
    }

    const url = new URL(dbUrl);
    const dbName = url.pathname.slice(1).split('?')[0];
    const dbHost = url.hostname;
    const dbPort = url.port || '5432';
    const dbUser = url.username;
    const dbPassword = url.password;

    this.logger.log(`Restoring backup to: ${dbName}@${dbHost}:${dbPort}`);

    try {
      // Drop and recreate database
      this.logger.log('Dropping existing database...');
      try {
        await execAsync(
          `PGPASSWORD="${dbPassword}" psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d postgres -c "DROP DATABASE IF EXISTS ${dbName};"`,
        );
      } catch (e) {
        // Ignore if database doesn't exist
      }

      this.logger.log('Creating new database...');
      await execAsync(
        `PGPASSWORD="${dbPassword}" psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d postgres -c "CREATE DATABASE ${dbName};"`,
      );

      this.logger.log('Restoring data from backup...');
      const restoreCommand = `PGPASSWORD="${dbPassword}" pg_restore -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -c "${filePath}"`;
      
      await execAsync(restoreCommand);
      
      this.logger.log('Database restored successfully');
    } catch (error) {
      this.logger.error('Restore failed:', error);
      throw new Error(`Failed to restore backup: ${error.message}`);
    }
  }

  getBackupFile(filePath: string): Buffer {
    if (!fs.existsSync(filePath)) {
      throw new Error('Backup file not found');
    }
    return fs.readFileSync(filePath);
  }
}




