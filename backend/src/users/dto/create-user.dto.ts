import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole, ContentLanguage } from '@cms-ng/shared';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address (must be unique)',
    example: 'reporter@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Display name shown in the CMS',
    example: 'John Doe',
    minLength: 2,
  })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({
    description: 'User role determining permissions',
    enum: UserRole,
    example: UserRole.REPORTER,
    required: false,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

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
    example: ContentLanguage.TRADITIONAL_CHINESE_HK,
    required: false,
  })
  @IsEnum(ContentLanguage)
  @IsOptional()
  preferredLanguage?: ContentLanguage;
}
