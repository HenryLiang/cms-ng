import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

  // NOTE (issue #105): no `role` field on purpose. Public registration always
  // creates a REPORTER; privileged accounts are provisioned out-of-band
  // (admin bootstrap script / DB ops). (ValidationPipe whitelist would strip
  // it anyway, but keeping it out of the DTO keeps it out of the API
  // contract/Swagger.)
}
