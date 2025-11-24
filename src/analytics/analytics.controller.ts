import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseBoolPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsUploaderService } from './analytics.uploader';
import {
  AnalyticsUploadStatusDto,
  TriggerUploadResponseDto,
} from './dto/analytics-upload-status.dto';
import { AnalyticsQueryDto, AnalyticsResponse } from './dto/analytics.dto';

@ApiTags('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly analyticsUploader: AnalyticsUploaderService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Get analytics data' })
  @ApiResponse({
    status: 200,
    description: 'Analytics data retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async getAnalytics(
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsResponse> {
    return this.analyticsService.getAnalytics(query);
  }

  @Get('upload/status')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Get analytics uploader status' })
  @ApiResponse({
    status: 200,
    type: AnalyticsUploadStatusDto,
    description: 'Uploader status retrieved successfully',
  })
  getUploadStatus(): AnalyticsUploadStatusDto {
    return this.analyticsUploader.getStatus();
  }

  @Post('upload/trigger')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Manually trigger an analytics upload',
    description:
      'Forces the uploader to run immediately. Pass force=true to bypass hash deduplication.',
  })
  @ApiResponse({
    status: 200,
    type: TriggerUploadResponseDto,
    description: 'Upload attempt result',
  })
  async triggerUpload(
    @Query('force', new DefaultValuePipe(false), ParseBoolPipe) force: boolean,
  ): Promise<TriggerUploadResponseDto> {
    const result = await this.analyticsUploader.triggerUpload(force);
    return {
      outcome: result.outcome,
      message: result.message,
      status: this.analyticsUploader.getStatus(),
    };
  }
}
