import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { WordPressService } from './wordpress.service';
import { GenerateAdaptationDto } from './dto/generate-adaptation.dto';
import { UpdatePublishDto } from './dto/update-publish.dto';
import { PublishWordPressDto } from './dto/publish-wordpress.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@cms-ng/shared';

@ApiTags('channels')
@ApiBearerAuth('bearer')
@Controller('channels')
export class ChannelsController {
  constructor(
    private channelsService: ChannelsService,
    private wordPressService: WordPressService,
  ) {}

  @Get('platforms')
  @ApiOperation({ summary: 'List all supported publishing platforms' })
  getPlatforms() {
    return this.channelsService.getPlatforms();
  }

  @Get(':articleId/publishes')
  @ApiOperation({ summary: 'List per-platform publish records for an article' })
  async getPublishes(
    @Param('articleId') articleId: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    await this.channelsService.verifyAccess(articleId, user);
    return this.channelsService.getPublishes(articleId);
  }

  @Post(':articleId/adapt')
  @ApiOperation({
    summary: 'Generate a platform-adapted version of the article',
  })
  async generateAdaptation(
    @CurrentUser() user: { userId: string; role: string },
    @Param('articleId') articleId: string,
    @Body() dto: GenerateAdaptationDto,
  ) {
    await this.channelsService.verifyAccess(articleId, user);
    return this.channelsService.generateAdaptation(
      user.userId,
      articleId,
      dto.platform,
      dto.customPrompt,
    );
  }

  @Patch(':articleId/publishes/:publishId')
  @ApiOperation({ summary: 'Update a per-platform publish record' })
  async updatePublish(
    @CurrentUser() user: { userId: string; role: string },
    @Param('articleId') articleId: string,
    @Param('publishId') publishId: string,
    @Body() dto: UpdatePublishDto,
  ) {
    await this.channelsService.verifyAccess(articleId, user);
    return this.channelsService.updatePublish(articleId, publishId, dto);
  }

  @Post(':articleId/publish-wordpress')
  @ApiOperation({ summary: 'Publish the article to a WordPress site' })
  async publishToWordPress(
    @CurrentUser() user: { userId: string; role: string },
    @Param('articleId') articleId: string,
    @Body() dto: PublishWordPressDto,
  ) {
    await this.channelsService.verifyAccess(articleId, user);
    return this.wordPressService.publish(articleId, dto.wpStatus || 'publish');
  }

  @Delete(':articleId/publishes/:publishId')
  @ApiOperation({ summary: 'Delete a per-platform publish record' })
  async deletePublish(
    @CurrentUser() user: { userId: string; role: string },
    @Param('articleId') articleId: string,
    @Param('publishId') publishId: string,
  ) {
    await this.channelsService.verifyAccess(articleId, user);
    return this.channelsService.deletePublish(articleId, publishId);
  }
}
