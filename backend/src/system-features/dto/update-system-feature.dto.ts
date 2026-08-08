import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSystemFeatureDto {
  @ApiProperty({ description: 'Whether the feature is globally open' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({
    description: 'Audit reason; required when closing a feature',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
