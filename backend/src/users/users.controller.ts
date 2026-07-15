import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRole } from '@cms-ng/shared';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
@Roles(UserRole.EDITOR, UserRole.ADMIN)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all users (admin only; returns balance)' })
  async findAll() {
    return this.usersService.findAll();
  }

  @Get('editors')
  @ApiOperation({ summary: 'List all editor-role users' })
  async findEditors() {
    return this.usersService.findEditors();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a single user by id (admin only)' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update a user (self for non-admins; any user for admins)',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    if (user.role !== UserRole.ADMIN && id !== user.userId) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.usersService.update(id, dto);
  }

  // ─── Account management (admin only) ───

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Create a new account (admin only). Returns a one-time random password.',
  })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Enable/disable an account (admin only)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('userId') operatorId: string,
  ) {
    return this.usersService.setStatus(id, dto, operatorId);
  }

  @Post(':id/reset-password')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Reset a user password (admin only). Returns a one-time random password.',
  })
  async resetPassword(@Param('id') id: string) {
    return this.usersService.resetPassword(id);
  }

  @Get(':id/consumption')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a user consumption summary (admin only)' })
  async getConsumption(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.usersService.getConsumption(
      id,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  // ─── Self-service ───

  @Post('me/password')
  @Roles(UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Change the current user password (self only)' })
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(userId, dto);
    return { success: true };
  }
}
