import {
  Injectable,
  ConflictException,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto, UpdateUserDto } from './dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';

@Injectable({ scope: Scope.REQUEST })
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  @Audit({
    entityName: 'User',
    action: 'CREATE',
    changeSummary: (result) =>
      `Created user "${result.username}" with role ${result.role}`,
  })
  async create(data: CreateUserDto): Promise<Partial<User>> {
    try {
      // Pre-check: ensure username and email are unique
      const whereConditions: any[] = [{ username: data.username }];
      if (data.email) {
        whereConditions.push({ email: data.email });
      }

      const existing = await this.prisma.user.findFirst({
        where: {
          OR: whereConditions,
        },
      });
      if (existing) {
        if (existing.username === data.username) {
          throw new ConflictException('User with this username already exists');
        }
        if (data.email && existing.email === data.email) {
          throw new ConflictException('User with this email already exists');
        }
        throw new ConflictException(
          'User with provided unique field already exists',
        );
      }
      const { password, ...rest } = data;
      const passwordHash = await bcrypt.hash(password, 10);
      const created = await this.prisma.user.create({
        data: { ...(rest as any), passwordHash },
      });
      // remove passwordHash from response
      const { passwordHash: _, ...safe } = created as any;
      return safe as Partial<User>;
    } catch (error) {
      if (error.code === 'P2002') {
        const target = (error.meta?.target as string[]) ?? [];
        if (Array.isArray(target) && target.includes('username')) {
          throw new ConflictException('User with this username already exists');
        }
        if (Array.isArray(target) && target.includes('email')) {
          throw new ConflictException('User with this email already exists');
        }
        // Fallback when target is not provided
        throw new ConflictException(
          'User with provided unique field already exists',
        );
      }
      throw error;
    }
  }

  async findAll(
    limit?: number,
  ): Promise<{ data: Partial<User>[]; meta: { totalItems: number } }> {
    const users = await this.prisma.user.findMany({
      ...(limit ? { take: limit } : {}),
    });
    const cleanUsers = users.map(({ passwordHash, ...u }) => u);
    return {
      data: cleanUsers,
      meta: {
        totalItems: cleanUsers.length,
      },
    };
  }

  async findOne(id: number): Promise<Partial<User>> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { passwordHash, ...safe } = user as any;
    return safe;
  }

  @Audit({
    entityName: 'User',
    action: 'UPDATE',
    changeSummary: (result) => `Updated user "${result.username}"`,
  })
  async update(id: number, data: UpdateUserDto): Promise<Partial<User>> {
    try {
      // If updating username/email, ensure uniqueness
      if (data.username || data.email) {
        const current = await this.prisma.user.findUnique({ where: { id } });
        if (!current) {
          throw new NotFoundException(`User with ID ${id} not found`);
        }
        const usernameToCheck = data.username ?? current.username;
        const emailToCheck = data.email ?? current.email;
        const conflict = await this.prisma.user.findFirst({
          where: {
            OR: [{ username: usernameToCheck }, { email: emailToCheck }],
            NOT: { id },
          },
        });
        if (conflict) {
          if (conflict.username === usernameToCheck) {
            throw new ConflictException(
              'User with this username already exists',
            );
          }
          if (conflict.email === emailToCheck) {
            throw new ConflictException('User with this email already exists');
          }
          throw new ConflictException(
            'User with provided unique field already exists',
          );
        }
      }
      const { password, ...rest } = data as any;
      const updateData: any = { ...rest };
      if (password) {
        updateData.passwordHash = await bcrypt.hash(password, 10);
      }
      const updated = await this.prisma.user.update({
        where: { id },
        data: updateData,
      });
      const { passwordHash, ...safe } = updated as any;
      return safe;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      if (error.code === 'P2002') {
        const target = (error.meta?.target as string[]) ?? [];
        if (Array.isArray(target) && target.includes('username')) {
          throw new ConflictException('User with this username already exists');
        }
        if (Array.isArray(target) && target.includes('email')) {
          throw new ConflictException('User with this email already exists');
        }
        throw new ConflictException(
          'User with provided unique field already exists',
        );
      }
      throw error;
    }
  }

  @Audit({
    entityName: 'User',
    action: 'DELETE',
    changeSummary: (result) => `Deleted user "${result.username}"`,
  })
  async remove(id: number): Promise<User> {
    try {
      // First, get the user to return it later
      const user = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      // Use a transaction to handle related records
      const result = await this.prisma.$transaction(async (tx) => {
        // Option 1: Set userId to null in transactions (preserves transaction history)
        await tx.transaction.updateMany({
          where: { userId: id },
          data: { userId: null as any },
        });

        // Option 2: Set userId to null in audit logs (preserves audit trail)
        await tx.auditLog.updateMany({
          where: { userId: id },
          data: { userId: null as any },
        });

        // Option 3: Set userId to null in notifications (preserves notification history)
        await tx.notification.updateMany({
          where: { userId: id },
          data: { userId: null },
        });

        // Alternative approaches (uncomment if you prefer to delete instead of nullify):
        // await tx.transaction.deleteMany({ where: { userId: id } });
        // await tx.auditLog.deleteMany({ where: { userId: id } });
        // await tx.notification.deleteMany({ where: { userId: id } });

        // Now delete the user
        return await tx.user.delete({
          where: { id },
        });
      });

      const { passwordHash, ...safe } = result as any;
      return safe as any;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      throw error;
    }
  }
}
