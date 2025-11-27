import { PartialType } from '@nestjs/swagger';
import { CreateUnitTypeDto } from './create-unit-type.dto';

export class UpdateUnitTypeDto extends PartialType(CreateUnitTypeDto) {}

