import { Controller, Get, Param, Patch, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
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
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}
