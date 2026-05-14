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
import { TrendingTopicsService } from './trending-topics.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { GoogleTrendsQueryDto } from './dto/google-trends-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('trending-topics')
@UseGuards(JwtAuthGuard)
export class TrendingTopicsController {
  constructor(private topicsService: TrendingTopicsService) {}

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateTopicDto) {
    return this.topicsService.create(userId, dto);
  }

  @Get()
  findAll() {
    return this.topicsService.findAll();
  }

  @Post('suggestions')
  generateSuggestions(@CurrentUser('userId') userId: string) {
    return this.topicsService.generateAISuggestions(userId);
  }

  @Get('google-trends')
  fetchGoogleTrends(@Query() query: GoogleTrendsQueryDto) {
    return this.topicsService.fetchGoogleTrends(query.geo || 'HK', query.timeRange || '24h');
  }

  @Post('import-google-trend')
  importGoogleTrend(
    @CurrentUser('userId') userId: string,
    @Body() data: any,
  ) {
    return this.topicsService.importFromGoogleTrends(userId, data);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.topicsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTopicDto) {
    return this.topicsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.topicsService.remove(id);
  }

  @Post(':id/adopt')
  adoptTopic(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.topicsService.adoptTopic(id, userId);
  }
}
