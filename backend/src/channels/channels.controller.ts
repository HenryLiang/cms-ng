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
import { ChannelsService } from './channels.service';
import { GenerateAdaptationDto } from './dto/generate-adaptation.dto';
import { UpdatePublishDto } from './dto/update-publish.dto';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('channels')
export class ChannelsController {
  constructor(private channelsService: ChannelsService) {}

  @Get('platforms')
  getPlatforms() {
    return this.channelsService.getPlatforms();
  }

  @Get(':articleId/publishes')
  getPublishes(@Param('articleId') articleId: string) {
    return this.channelsService.getPublishes(articleId);
  }

  @Post(':articleId/adapt')
  async generateAdaptation(
    @CurrentUser('userId') userId: string,
    @Param('articleId') articleId: string,
    @Body() dto: GenerateAdaptationDto,
  ) {
    return this.channelsService.generateAdaptation(
      userId,
      articleId,
      dto.platform,
      dto.customPrompt,
    );
  }

  @Patch(':articleId/publishes/:publishId')
  async updatePublish(
    @Param('articleId') articleId: string,
    @Param('publishId') publishId: string,
    @Body() dto: UpdatePublishDto,
  ) {
    return this.channelsService.updatePublish(articleId, publishId, dto);
  }

  @Delete(':articleId/publishes/:publishId')
  async deletePublish(
    @Param('articleId') articleId: string,
    @Param('publishId') publishId: string,
  ) {
    return this.channelsService.deletePublish(articleId, publishId);
  }
}
