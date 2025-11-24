import { ApiProperty } from '@nestjs/swagger';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SetupAdminDto } from './setup-admin.dto';
import { SystemConfigDto } from './system-config.dto';

export class CompleteSetupDto {
  @ApiProperty({
    description: 'Admin user information',
    type: SetupAdminDto,
  })
  @ValidateNested()
  @Type(() => SetupAdminDto)
  admin: SetupAdminDto;

  @ApiProperty({
    description: 'System configuration',
    type: SystemConfigDto,
  })
  @ValidateNested()
  @Type(() => SystemConfigDto)
  systemConfig: SystemConfigDto;
}
