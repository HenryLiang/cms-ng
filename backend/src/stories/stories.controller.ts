import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { FindAllStoriesDto } from './dto/find-all-stories.dto';
import { GenerateDraftFromResearchKitDto } from './dto/generate-draft.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole, ContentLanguage } from '@cms-ng/shared';

@ApiTags('stories')
@ApiBearerAuth('bearer')
@Controller('stories')
export class StoriesController {
  constructor(private storiesService: StoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new story' })
  create(
    @CurrentUser('userId') reporterId: string,
    @Body() dto: CreateStoryDto,
  ) {
    return this.storiesService.create(reporterId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List stories the current user can access' })
  findAll(
    @CurrentUser() user: { userId: string; role: string },
    @Query() query: FindAllStoriesDto,
  ) {
    return this.storiesService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a story by id (with access check)' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    await this.storiesService.verifyAccess(id, user);
    return this.storiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a story (with access check)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStoryDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    await this.storiesService.verifyAccess(id, user);
    return this.storiesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a story (with access check)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    await this.storiesService.verifyAccess(id, user);
    return this.storiesService.remove(id);
  }

  @Roles(UserRole.EDITOR, UserRole.ADMIN)
  @Patch(':id/assign-editor')
  @ApiOperation({ summary: 'Assign an editor to a story (editor/admin only)' })
  async assignEditor(
    @Param('id') id: string,
    @Body('editorId') editorId: string,
  ) {
    return this.storiesService.assignEditor(id, editorId);
  }

  @Post(':id/research')
  @ApiOperation({ summary: 'Generate a research kit for a story via AI' })
  async generateResearchKit(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string },
    @Query('language') language?: ContentLanguage,
  ) {
    await this.storiesService.verifyAccess(id, user);
    return this.storiesService.generateResearchKit(user.userId, id, language);
  }

  @Post(':id/draft')
  @ApiOperation({ summary: 'Generate an article draft from a research kit' })
  async generateDraftFromResearchKit(
    @Param('id') id: string,
    @Body() dto: GenerateDraftFromResearchKitDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    await this.storiesService.verifyAccess(id, user);
    const article = await this.storiesService.generateDraftFromResearchKit(
      user.userId,
      id,
      dto.researchKit,
      dto.instruction,
      dto.language,
    );
    return { article };
  }
}