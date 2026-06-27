import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleRegistrationDto {
  @ApiProperty({
    description: 'true = 开放注册，false = 关闭注册',
    example: false,
  })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    description: '切换原因（可选，审计用）',
    example: '正式上线前收口',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
