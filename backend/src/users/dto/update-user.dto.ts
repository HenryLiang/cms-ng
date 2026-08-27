import { IsString, IsEnum, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ContentLanguage,
  DISPLAY_LANGUAGES,
  type DisplayLanguage,
} from '@cms-ng/shared';

export class UpdateUserDto {
  @ApiProperty({
    description: 'Display name of the user',
    example: 'John Doe',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Department or team the user belongs to',
    example: 'Newsroom',
    required: false,
  })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({
    description:
      'Preferred CMS display language; null inherits the system default',
    enum: DISPLAY_LANGUAGES,
    nullable: true,
    required: false,
  })
  @IsIn(DISPLAY_LANGUAGES)
  @IsOptional()
  displayLanguage?: DisplayLanguage | null;

  @ApiProperty({
    description:
      'Preferred AI content language; null inherits the system default',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    nullable: true,
    required: false,
  })
  @IsEnum(ContentLanguage)
  @IsOptional()
  preferredLanguage?: ContentLanguage | null;
}
