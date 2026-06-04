import { Controller, Post, Body, Get, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // issue #49 — JWT refresh endpoint
  // Accepts the existing (possibly expired) access token, re-issues a fresh
  // one if the signature is valid and the user is still active.
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.token);
  }

  @Get('me')
  async getMe(@CurrentUser('userId') userId: string) {
    return this.authService.getCurrentUser(userId);
  }
}
