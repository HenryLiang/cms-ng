import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Platform } from '@cms-ng/shared';

export class GenerateAdaptationDto {
  @IsEnum(Platform)
  platform: Platform;

  @IsString()
  @IsOptional()
  customPrompt?: string;
}
