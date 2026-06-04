import { IsString, MinLength } from 'class-validator';

/**
 * Body for POST /auth/refresh (issue #49).
 *
 * Accepts the existing (possibly expired) access token. The endpoint re-issues
 * a fresh one if the signature is valid and the user is still active.
 */
export class RefreshTokenDto {
  @IsString()
  @MinLength(10, { message: 'token looks too short to be a JWT' })
  token: string;
}
