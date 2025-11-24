import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({
    description: 'New password (leave empty to keep current password)',
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.password && o.password.length > 0)
  @MinLength(4, { message: 'Password must be at least 4 characters long' })
  password?: string;
}
