import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({
    description: 'Whether the account is active (true) or disabled (false)',
    example: false,
  })
  @IsBoolean()
  isActive: boolean;
}
