import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  Length,
} from 'class-validator';

export class SystemConfigDto {
  @ApiProperty({
    description: 'Name of the pharmacy',
    example: 'Downtown Pharmacy',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100, {
    message: 'Pharmacy name must be between 2 and 100 characters',
  })
  pharmacyName: string;

  @ApiPropertyOptional({
    description: 'Address of the pharmacy',
    example: '123 Main Street, City, State 12345',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @Length(0, 255, { message: 'Address cannot exceed 255 characters' })
  pharmacyAddress?: string;

  @ApiPropertyOptional({
    description: 'Phone number of the pharmacy',
    example: '+1-555-123-4567',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @Length(0, 20, { message: 'Phone number cannot exceed 20 characters' })
  pharmacyPhone?: string;

  @ApiPropertyOptional({
    description: 'City where the pharmacy operates',
    example: 'Addis Ababa',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(0, 100, { message: 'City cannot exceed 100 characters' })
  pharmacyCity?: string;

  @ApiPropertyOptional({
    description: 'API base URL configured during onboarding',
    example: 'http://localhost:3000/api',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @Length(0, 255, { message: 'API URL cannot exceed 255 characters' })
  apiUrl?: string;

  @ApiPropertyOptional({
    description: 'Low stock threshold for inventory alerts',
    example: 10,
    minimum: 1,
    maximum: 1000,
  })
  @IsOptional()
  @IsInt({ message: 'Low stock threshold must be a number' })
  @Min(1, { message: 'Low stock threshold must be at least 1' })
  @Max(1000, { message: 'Low stock threshold cannot exceed 1000' })
  lowStockThreshold?: number;

  @ApiPropertyOptional({
    description: 'Days before expiry to show warning',
    example: 30,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @IsInt({ message: 'Expiry warning days must be a number' })
  @Min(1, { message: 'Expiry warning days must be at least 1' })
  @Max(365, { message: 'Expiry warning days cannot exceed 365' })
  expiryWarningDays?: number;

  @ApiPropertyOptional({
    description: 'Currency code for the pharmacy',
    example: 'ETB',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @Length(1, 10, { message: 'Currency must be between 1 and 10 characters' })
  currency?: string;

  @ApiPropertyOptional({
    description: 'Timezone for the pharmacy',
    example: 'Africa/Addis_Ababa',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @Length(1, 50, { message: 'Timezone must be between 1 and 50 characters' })
  timezone?: string;
}
