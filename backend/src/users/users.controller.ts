import { Controller, Get, Param, Patch, Body, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRole } from '@cms-ng/shared';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
@Roles(UserRole.EDITOR, UserRole.ADMIN)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users (editor/admin only)' })
  async findAll() {
    return this.usersService.findAll();
  }

  @Get('editors')
  @ApiOperation({ summary: 'List all editor-role users' })
  async findEditors() {
    return this.usersService.findEditors();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user by id' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a user (self for non-admins; any user for admins)' })
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
}