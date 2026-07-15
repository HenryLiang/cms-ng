import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'The current password for verification',
    example: 'old-password',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiProperty({
    description: 'The new password (must differ from the current one)',
    example: 'new-password',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
