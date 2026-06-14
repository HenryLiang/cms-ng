import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ContentLanguage } from '@cms-ng/shared';

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
    description: 'Preferred content language for the user',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsEnum(ContentLanguage)
  @IsOptional()
  preferredLanguage?: ContentLanguage;
}
