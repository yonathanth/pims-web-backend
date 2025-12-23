import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import * as multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('Backup')
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post('create')
  @ApiOperation({ summary: 'Create database backup (Public endpoint)' })
  @ApiResponse({ status: 200, description: 'Backup created successfully' })
  @ApiResponse({ status: 500, description: 'Backup failed' })
  async createBackup(@Res() res: Response) {
    try {
      const { filePath, fileName, size } = await this.backupService.createBackup();

      // Read the backup file
      const fileBuffer = this.backupService.getBackupFile(filePath);

      // Set response headers for file download
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', size);

      // Send file
      res.send(fileBuffer);
    } catch (error) {
      throw new HttpException(
        `Failed to create backup: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('check-existing-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Check if database has existing data' })
  @ApiResponse({ status: 200, description: 'Data check completed' })
  async checkExistingData() {
    return await this.backupService.checkExistingData();
  }

  @Post('restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Restore database from backup file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Database restored successfully' })
  @ApiResponse({ status: 400, description: 'Invalid backup file or database has existing data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin or Manager role required' })
  @ApiResponse({ status: 500, description: 'Restore failed' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const uploadDir = path.join(process.cwd(), 'backups', 'uploads');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `restore_${uniqueSuffix}${path.extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (
          file.mimetype === 'application/octet-stream' ||
          file.originalname.endsWith('.dump')
        ) {
          cb(null, true);
        } else {
          cb(new Error('Only .dump backup files are allowed'), false);
        }
      },
      limits: {
        fileSize: 1024 * 1024 * 1024, // 1GB limit
      },
    }),
  )
  async restoreBackup(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new HttpException('No backup file provided', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.backupService.restoreBackup(file.path);

      // Clean up uploaded file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      res.status(200).json({
        message: 'Database restored successfully',
      });
    } catch (error) {
      // Clean up uploaded file on error
      if (file?.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Failed to restore backup: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

