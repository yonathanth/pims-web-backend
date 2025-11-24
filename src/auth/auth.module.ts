import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { SetupService } from './setup.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { UsersModule } from '../users/users.module';
import { GeneralConfigsModule } from '../general-configs/general-configs.module';
import { RequestContextService } from '../common/request-context.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_jwt_secret',
      signOptions: { expiresIn: '7d' },
    }),
    PrismaModule,
    AuditLogModule,
    UsersModule,
    GeneralConfigsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, SetupService, JwtStrategy, RequestContextService],
  exports: [AuthService, SetupService, JwtModule, PassportModule],
})
export class AuthModule {}
