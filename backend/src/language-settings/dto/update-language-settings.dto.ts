import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn } from 'class-validator';
import {
  ContentLanguage,
  DISPLAY_LANGUAGES,
  type DisplayLanguage,
} from '@cms-ng/shared';

export class UpdateLanguageSettingsDto {
  @ApiProperty({
    description: 'Default CMS display language',
    enum: DISPLAY_LANGUAGES,
    example: 'zh-CN',
  })
  @IsIn(DISPLAY_LANGUAGES)
  displayLanguage: DisplayLanguage;

  @ApiProperty({
    description: 'Default language for AI-generated content',
    enum: ContentLanguage,
    example: ContentLanguage.SIMPLIFIED_CHINESE,
  })
  @IsEnum(ContentLanguage)
  contentLanguage: ContentLanguage;
}
