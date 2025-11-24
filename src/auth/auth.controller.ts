import { Body, Controller, Post, UseGuards, Req, Get } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { SetupService } from './setup.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiOkResponse } from '@nestjs/swagger';
import { CompleteSetupDto, SetupAdminDto, SystemConfigDto } from './dto/index';
import { ConflictException } from '@nestjs/common';

class LoginDto {
  @IsString()
  @IsNotEmpty()
  usernameOrEmail: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly setupService: SetupService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Login and obtain JWT access token' })
  @ApiResponse({ status: 201, description: 'Logged in successfully' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiBody({
    description: 'Provide username or email and password',
    schema: {
      type: 'object',
      properties: {
        usernameOrEmail: { type: 'string', example: 'admin' },
        password: { type: 'string', example: 'password123' },
      },
      required: ['usernameOrEmail', 'password'],
    },
  })
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.usernameOrEmail, body.password);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout and audit the action' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Req() req: any) {
    const userId = req.user?.userId as number;
    await this.authService.logout(userId);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get current authenticated user info' })
  @ApiOkResponse({ description: 'Current user returned' })
  async me(@Req() req: any) {
    return {
      userId: req.user?.userId,
      role: req.user?.role,
      username: req.user?.username,
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'System setup status and initialization state' })
  @ApiOkResponse({
    description:
      'Returns detailed setup status including users, configs, and system readiness',
    schema: {
      type: 'object',
      properties: {
        initialized: {
          type: 'boolean',
          description: 'Whether system has been initialized',
        },
        hasUsers: { type: 'boolean', description: 'Whether any users exist' },
        hasAdminUsers: {
          type: 'boolean',
          description: 'Whether any admin users exist',
        },
        hasConfigs: {
          type: 'boolean',
          description: 'Whether system configs exist',
        },
        hasCategories: {
          type: 'boolean',
          description: 'Whether default categories exist',
        },
        hasSuppliers: {
          type: 'boolean',
          description: 'Whether default suppliers exist',
        },
        hasLocations: {
          type: 'boolean',
          description: 'Whether default locations exist',
        },
        setupComplete: {
          type: 'boolean',
          description: 'Whether complete setup is done',
        },
      },
    },
  })
  async status() {
    return await this.setupService.getSetupStatus();
  }

  @Post('setup')
  @ApiOperation({
    summary: 'Complete system setup (one-time only)',
    description:
      'Sets up the entire system including admin user, system configurations, default categories, suppliers, and locations',
  })
  @ApiResponse({
    status: 201,
    description: 'System setup completed successfully',
    schema: {
      type: 'object',
      properties: {
        adminUser: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            fullName: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string' },
          },
        },
        systemConfig: { type: 'object' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'System has already been initialized',
  })
  @ApiResponse({ status: 400, description: 'Invalid setup data provided' })
  async setupSystem(@Body() body: CompleteSetupDto) {
    return await this.setupService.setupSystem(body.admin, body.systemConfig);
  }

  @Post('setup-admin')
  @ApiOperation({
    summary: 'Legacy admin setup (deprecated - use /setup instead)',
    description:
      'This endpoint is deprecated. Use /setup for complete system initialization.',
  })
  @ApiResponse({ status: 201, description: 'Admin user created' })
  @ApiResponse({ status: 409, description: 'Admin already set up' })
  @ApiResponse({ status: 410, description: 'This endpoint is deprecated' })
  async setupAdmin(@Body() body: SetupAdminDto) {
    // Check if system is already initialized
    const status = await this.setupService.getSetupStatus();
    if (status.initialized) {
      throw new ConflictException(
        'System has already been initialized. Please use the complete setup flow.',
      );
    }

    const user = await this.authService.setupAdmin({
      username: body.username,
      password: body.password,
      fullName: body.fullName,
      email: body.email,
    });
    return user;
  }
}
