import { Controller, Get, Param, Patch, Body, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRole } from '@cms-ng/shared';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@Roles(UserRole.EDITOR, UserRole.ADMIN)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  async findAll() {
    return this.usersService.findAll();
  }

  @Get('editors')
  async findEditors() {
    return this.usersService.findEditors();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN)
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
