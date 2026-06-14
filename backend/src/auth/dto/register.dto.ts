import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address used for registration',
    example: 'test@example.com',
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
    description: 'Plain-text password (min 6 chars, hashed server-side)',
    example: 'password123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({
    description: 'User role determining permissions',
    enum: UserRole,
    example: UserRole.REPORTER,
    required: false,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
