import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Scope,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

@Injectable({ scope: Scope.REQUEST })
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
    private readonly usersService: UsersService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  async validateUser(usernameOrEmail: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
      },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  @Audit({
    entityName: 'User',
    action: 'LOGIN',
    changeSummary: (result) => `User logged in successfully`,
  })
  async login(usernameOrEmail: string, password: string) {
    const user = await this.validateUser(usernameOrEmail, password);
    const payload = { sub: user.id, role: user.role, username: user.username };
    const accessToken = await this.jwtService.signAsync(payload);

    // Log the login manually since we need the user ID
    await this.auditLogService.logAsync({
      action: 'LOGIN',
      entityName: 'User',
      entityId: user.id,
      userId: user.id,
      changeSummary: `User ${user.username} logged in successfully`,
    });

    return { accessToken };
  }

  async logout(userId: number) {
    // Log the logout
    await this.auditLogService.logAsync({
      action: 'LOGOUT',
      entityName: 'User',
      entityId: userId,
      userId: userId,
      changeSummary: `User logged out`,
    });
  }

  async hasAnyUser(): Promise<boolean> {
    const count = await this.prisma.user.count();
    return count > 0;
  }

  async setupAdmin(params: {
    username: string;
    password: string;
    fullName?: string;
    email?: string;
  }) {
    const exists = await this.hasAnyUser();
    if (exists) {
      throw new ConflictException('Initial admin already set up');
    }
    const createDto: any = {
      username: params.username,
      password: params.password,
      fullName: params.fullName ?? params.username,
      email: params.email ?? `${params.username}@local`,
      role: 'ADMIN',
    };
    const user = await this.usersService.create(createDto);
    return user;
  }
}
