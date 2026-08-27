import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrandPreset } from '@cms-ng/shared';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateBrandSettingsDto {
  @ApiProperty({ enum: BrandPreset, example: BrandPreset.CMS_NG })
  @IsEnum(BrandPreset)
  preset: BrandPreset;

  @ApiPropertyOptional({
    description: 'Custom system name; required when preset is CUSTOM',
    minLength: 2,
    maxLength: 40,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name?: string;
}
