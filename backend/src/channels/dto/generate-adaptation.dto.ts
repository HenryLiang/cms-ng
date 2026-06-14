import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Platform } from '@cms-ng/shared';

export class GenerateAdaptationDto {
  @ApiProperty({
    description: 'Target platform the article should be adapted for',
    enum: Platform,
    example: Platform.WEBSITE,
  })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty({
    description: 'Optional custom prompt to guide the adaptation',
    example: 'Use a more casual tone for social audiences',
    required: false,
  })
  @IsString()
  @IsOptional()
  customPrompt?: string;
}
