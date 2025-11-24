import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Scope,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeneralConfig, Prisma } from '@prisma/client';
import {
  CreateGeneralConfigDto,
  UpdateGeneralConfigDto,
  ListGeneralConfigsDto,
} from './dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Audit } from '../audit-log/audit.decorator';
import { RequestContextService } from '../common/request-context.service';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable({ scope: Scope.REQUEST })
export class GeneralConfigsService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private requestContext: RequestContextService,
  ) {}

  getCurrentUserId(): number | null {
    return this.requestContext.getCurrentUserId();
  }

  @Audit({
    entityName: 'GeneralConfig',
    action: 'CREATE',
    changeSummary: (result) =>
      `Created config "${result.key}" in category ${result.category}`,
  })
  async create(data: CreateGeneralConfigDto): Promise<GeneralConfig> {
    try {
      // Validate data type and value consistency
      this.validateDataTypeAndValue(data.dataType, data.value);

      const config = await this.prisma.generalConfig.create({
        data: {
          key: data.key,
          value: data.value,
          dataType: data.dataType,
          category: data.category,
          description: data.description,
        },
      });

      return config;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Configuration with key "${data.key}" already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(
    query: ListGeneralConfigsDto,
  ): Promise<PaginatedResult<GeneralConfig>> {
    const { page = 1, limit = 10, category, dataType, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.GeneralConfigWhereInput = {};

    if (category) {
      where.category = category;
    }

    if (dataType) {
      where.dataType = dataType;
    }

    if (search) {
      where.OR = [
        { key: { contains: search, mode: 'insensitive' } },
        { value: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.generalConfig.findMany({
        where,
        skip,
        take: limit,
        orderBy: { key: 'asc' },
      }),
      this.prisma.generalConfig.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<GeneralConfig> {
    const config = await this.prisma.generalConfig.findUnique({
      where: { id },
    });

    if (!config) {
      throw new NotFoundException(`Configuration with ID ${id} not found`);
    }

    return config;
  }

  async findByKey(key: string): Promise<GeneralConfig> {
    const config = await this.prisma.generalConfig.findUnique({
      where: { key },
    });

    if (!config) {
      throw new NotFoundException(`Configuration with key "${key}" not found`);
    }

    return config;
  }

  async findByCategory(category: string): Promise<GeneralConfig[]> {
    return this.prisma.generalConfig.findMany({
      where: { category },
      orderBy: { key: 'asc' },
    });
  }

  @Audit({
    entityName: 'GeneralConfig',
    action: 'UPDATE',
    changeSummary: (result) => `Updated config "${result.key}"`,
  })
  async update(
    id: number,
    data: UpdateGeneralConfigDto,
  ): Promise<GeneralConfig> {
    try {
      // Validate data type and value consistency if both are provided
      if (data.dataType && data.value) {
        this.validateDataTypeAndValue(data.dataType, data.value);
      }

      // If updating key, ensure uniqueness
      if (data.key) {
        const existing = await this.prisma.generalConfig.findUnique({
          where: { key: data.key },
        });
        if (existing && existing.id !== id) {
          throw new ConflictException(
            `Configuration with key "${data.key}" already exists`,
          );
        }
      }

      const config = await this.prisma.generalConfig.update({
        where: { id },
        data,
      });

      return config;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Configuration with ID ${id} not found`);
      }
      throw error;
    }
  }

  @Audit({
    entityName: 'GeneralConfig',
    action: 'DELETE',
    changeSummary: (result) => `Deleted config "${result.key}"`,
  })
  async remove(id: number): Promise<GeneralConfig> {
    try {
      return await this.prisma.generalConfig.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Configuration with ID ${id} not found`);
      }
      throw error;
    }
  }

  // Utility method to get typed configuration values
  async getTypedValue<T>(key: string, expectedType: string): Promise<T> {
    const config = await this.findByKey(key);

    if (config.dataType !== expectedType) {
      throw new BadRequestException(
        `Configuration "${key}" is of type ${config.dataType}, expected ${expectedType}`,
      );
    }

    return this.parseValue<T>(config.value, config.dataType);
  }

  // Utility method to set configuration value with type validation
  async setTypedValue(
    key: string,
    value: any,
    dataType: string,
  ): Promise<GeneralConfig> {
    this.validateDataTypeAndValue(dataType, value);

    const stringValue = this.stringifyValue(value, dataType);

    try {
      return await this.prisma.generalConfig.upsert({
        where: { key },
        update: { value: stringValue, dataType },
        create: {
          key,
          value: stringValue,
          dataType,
          category: 'system',
          description: `Auto-generated configuration for ${key}`,
        },
      });
    } catch (error) {
      throw new BadRequestException(
        `Failed to set configuration "${key}": ${error.message}`,
      );
    }
  }

  // Helper method to validate data type and value consistency
  private validateDataTypeAndValue(dataType: string, value: string): void {
    try {
      switch (dataType) {
        case 'number':
          const num = parseFloat(value);
          if (isNaN(num)) {
            throw new BadRequestException(
              `Value "${value}" is not a valid number`,
            );
          }
          break;
        case 'boolean':
          if (!['true', 'false'].includes(value.toLowerCase())) {
            throw new BadRequestException(
              `Value "${value}" is not a valid boolean (true/false)`,
            );
          }
          break;
        case 'json':
          JSON.parse(value);
          break;
        case 'string':
          // String values are always valid
          break;
        default:
          throw new BadRequestException(`Invalid data type: ${dataType}`);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new BadRequestException(`Value "${value}" is not valid JSON`);
      }
      throw error;
    }
  }

  // Helper method to parse string value to typed value
  private parseValue<T>(value: string, dataType: string): T {
    switch (dataType) {
      case 'number':
        return parseFloat(value) as T;
      case 'boolean':
        return (value.toLowerCase() === 'true') as T;
      case 'json':
        return JSON.parse(value) as T;
      case 'string':
      default:
        return value as T;
    }
  }

  // Helper method to stringify typed value
  private stringifyValue(value: any, dataType: string): string {
    switch (dataType) {
      case 'number':
        return value.toString();
      case 'boolean':
        return value.toString();
      case 'json':
        return JSON.stringify(value);
      case 'string':
      default:
        return value.toString();
    }
  }
}
