import { PartialType } from '@nestjs/swagger';
import { CreateGeneralConfigDto } from './create-general-config.dto';

export class UpdateGeneralConfigDto extends PartialType(
  CreateGeneralConfigDto,
) {}












