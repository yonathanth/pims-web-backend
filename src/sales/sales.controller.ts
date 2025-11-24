import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApproveSaleDto, DeclineSaleDto, SalesQueryDto } from './dto';

@ApiTags('Sales')
@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('pending')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pending sales for approval' })
  @ApiResponse({
    status: 200,
    description: 'Pending sales retrieved successfully',
  })
  async getPendingSales() {
    try {
      return await this.salesService.getPendingSales();
    } catch (error) {
      throw new HttpException(
        `Failed to get pending sales: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all sales with pagination' })
  @ApiResponse({
    status: 200,
    description: 'Sales retrieved successfully',
  })
  async getSales(@Query() query: SalesQueryDto) {
    try {
      return await this.salesService.getSales(query);
    } catch (error) {
      throw new HttpException(
        `Failed to get sales: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/approve')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve a pending sale' })
  @ApiParam({ name: 'id', description: 'Sale transaction ID' })
  @ApiBody({ type: ApproveSaleDto })
  @ApiResponse({
    status: 200,
    description: 'Sale approved successfully',
  })
  async approveSale(
    @Param('id') id: string,
    @Body() approveSaleDto: ApproveSaleDto,
  ) {
    try {
      return await this.salesService.approveSale(parseInt(id), approveSaleDto);
    } catch (error) {
      throw new HttpException(
        `Failed to approve sale: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/decline')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Decline a pending sale' })
  @ApiParam({ name: 'id', description: 'Sale transaction ID' })
  @ApiBody({ type: DeclineSaleDto })
  @ApiResponse({
    status: 200,
    description: 'Sale declined successfully',
  })
  async declineSale(
    @Param('id') id: string,
    @Body() declineSaleDto: DeclineSaleDto,
  ) {
    try {
      return await this.salesService.declineSale(parseInt(id), declineSaleDto);
    } catch (error) {
      throw new HttpException(
        `Failed to decline sale: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
