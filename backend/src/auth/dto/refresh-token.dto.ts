import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for POST /auth/refresh (issue #49).
 *
 * Accepts the existing (possibly expired) access token. The endpoint re-issues
 * a fresh one if the signature is valid and the user is still active.
 */
export class RefreshTokenDto {
  @ApiProperty({
    description:
      'Existing JWT access token to refresh (looks too short if not a JWT)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
    minLength: 10,
  })
  @IsString()
  @MinLength(10, { message: 'token looks too short to be a JWT' })
  token: string;
}
