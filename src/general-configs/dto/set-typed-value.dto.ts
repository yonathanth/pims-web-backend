import { ApiProperty } from '@nestjs/swagger';

export class SetTypedValueDto {
  @ApiProperty({
    description: 'The value to set for the configuration',
    example: 'Hello World',
    required: true,
  })
  value: any;
}

