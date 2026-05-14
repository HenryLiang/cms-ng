import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('stories')
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private storiesService: StoriesService) {}

  @Post()
  create(@CurrentUser('userId') reporterId: string, @Body() dto: CreateStoryDto) {
    return this.storiesService.create(reporterId, dto);
  }

  @Get()
  findAll(@CurrentUser('userId') reporterId: string, @Query('all') all?: string) {
    // Editors/admins can pass ?all=true to see all stories
    return this.storiesService.findAll(all === 'true' ? undefined : reporterId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storiesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStoryDto) {
    return this.storiesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.storiesService.remove(id);
  }
}
