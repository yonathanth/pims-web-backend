import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEmail, ValidateIf } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({
    description: 'Supplier name',
    example: 'MedSupply Co.',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Contact person name',
    example: 'John Smith',
    required: false,
  })
  @IsString()
  @IsOptional()
  contactName?: string;

  @ApiProperty({
    description: 'Phone number',
    example: '+1-555-123-4567',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    description: 'Email address',
    example: 'contact@medsupply.com',
    required: false,
  })
  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Physical address',
    example: '123 Medical St, Health City, HC 12345',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;
}
