import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { TrendingTopicsService } from './trending-topics.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { GoogleTrendsQueryDto } from './dto/google-trends-query.dto';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('trending-topics')
export class TrendingTopicsController {
  private readonly SOURCE_KEYS = [
    'google-trends', 'sina', 'people', 'bbc', 'chinanews',
    'guardian', 'nytimes', 'economist', 'ft', 'zaobao',
    '36kr', 'huxiu', 'douban-movie',
  ];
  private readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchGoogleTrends(query.geo || 'HK', query.timeRange || '24h', page, limit);
  }

  @Get('all-news')
  fetchAllTrendingNews(@Query() query: GoogleTrendsQueryDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 20));
    return this.topicsService.fetchAllTrendingNews(query.geo || 'HK', page, limit);
  }

  @Get('sina')
  fetchSinaNews(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('sina', page, limit);
  }

  @Get('people')
  fetchPeopleNews(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('people', page, limit);
  }

  @Get('bbc')
  fetchBBCNews(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('bbc', page, limit);
  }

  @Get('chinanews')
  fetchChinanews(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('chinanews', page, limit);
  }

  @Get('guardian')
  fetchGuardian(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('guardian', page, limit);
  }

  @Get('nytimes')
  fetchNYTimes(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('nytimes', page, limit);
  }

  @Get('economist')
  fetchEconomist(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('economist', page, limit);
  }

  @Get('ft')
  fetchFT(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('ft', page, limit);
  }

  @Get('zaobao')
  fetchZaobao(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('zaobao', page, limit);
  }

  @Get('weibo-hot')
  fetchWeiboHot(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('weibo-hot', page, limit);
  }

  @Get('zhihu-hot')
  fetchZhihuHot(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('zhihu-hot', page, limit);
  }

  @Get('36kr')
  fetch36kr(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('36kr', page, limit);
  }

  @Get('huxiu')
  fetchHuxiu(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('huxiu', page, limit);
  }

  @Get('douban-movie')
  fetchDoubanMovie(@Query() query: any) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return this.topicsService.fetchNewsBySource('douban-movie', page, limit);
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
    if (this.SOURCE_KEYS.includes(id)) {
      throw new BadRequestException(`Invalid topic ID: '${id}' is a data source name`);
    }
    if (!this.UUID_REGEX.test(id)) {
      throw new BadRequestException(`Unknown data source: ${id}`);
    }
    return this.topicsService.findOne(id);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.topicsService.update(id, dto, userId, role);
  }

  @Delete(':id')
  remove(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
  ) {
    return this.topicsService.remove(id, userId, role);
  }

  @Post(':id/adopt')
  adoptTopic(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.topicsService.adoptTopic(id, userId);
  }
}
