import { Controller, Post, Body, Get, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@cms-ng/shared';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ToggleRegistrationDto } from './dto/toggle-registration.dto';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with email + password' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // issue #49 — JWT refresh endpoint
  // Accepts the existing (possibly expired) access token, re-issues a fresh
  // one if the signature is valid and the user is still active.
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh an existing (possibly expired) access token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.token);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the currently authenticated user profile' })
  async getMe(@CurrentUser('userId') userId: string) {
    return this.authService.getCurrentUser(userId);
  }

  // ===== 注册功能开放开关 =====
  @Public()
  @Get('registration/status')
  @ApiOperation({ summary: 'Check whether registration is open (public)' })
  async registrationStatus() {
    return this.authService.getRegistrationStatus();
  }

  @Post('registration/toggle')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Open/close registration (admin only)' })
  async toggleRegistration(
    @CurrentUser('userId') userId: string,
    @Body() dto: ToggleRegistrationDto,
  ) {
    return this.authService.setRegistrationStatus(dto.enabled, userId, dto.reason);
  }
}