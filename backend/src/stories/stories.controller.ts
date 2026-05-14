import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@cms-ng/shared';

@Controller('stories')
export class StoriesController {
  constructor(private storiesService: StoriesService) {}

  @Post()
  create(@CurrentUser('userId') reporterId: string, @Body() dto: CreateStoryDto) {
    return this.storiesService.create(reporterId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: { userId: string; role: string }) {
    return this.storiesService.findAll(user);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: { userId: string; role: string }) {
    const story = await this.storiesService.findOne(id);
    // Only author, assigned editor, or admin can view
    const canAccess =
      user.role === UserRole.ADMIN ||
      story.reporterId === user.userId ||
      story.editorId === user.userId;
    if (!canAccess) {
      throw new ForbiddenException('You do not have permission to view this story');
    }
    return story;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStoryDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    await this.storiesService.verifyAccess(id, user);
    return this.storiesService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: { userId: string; role: string }) {
    await this.storiesService.verifyAccess(id, user);
    return this.storiesService.remove(id);
  }

  @Roles(UserRole.EDITOR, UserRole.ADMIN)
  @Patch(':id/assign-editor')
  async assignEditor(
    @Param('id') id: string,
    @Body('editorId') editorId: string,
  ) {
    return this.storiesService.assignEditor(id, editorId);
  }
}
