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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TrendingTopicsService } from './trending-topics.service';
import { TwitterService } from './twitter.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { GoogleTrendsQueryDto } from './dto/google-trends-query.dto';
import { SourcePaginationDto } from './dto/source-pagination.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@cms-ng/shared';

@ApiTags('trending-topics')
@ApiBearerAuth('bearer')
@Controller('trending-topics')
export class TrendingTopicsController {
  private readonly SOURCE_KEYS = [
    'google-trends',
    'sina',
    'people',
    'bbc',
    'chinanews',
    'guardian',
    'nytimes',
    'economist',
    'ft',
    'zaobao',
    '36kr',
    'huxiu',
    'douban-movie',
    'x-trends',
    'x-accounts',
  ];
  private readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(
    private topicsService: TrendingTopicsService,
    private twitterService: TwitterService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a curated trending topic' })
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateTopicDto) {
    return this.topicsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all curated trending topics' })
  findAll() {
    return this.topicsService.findAll();
  }

  @Post('suggestions')
  @ApiOperation({ summary: 'Generate AI topic suggestions' })
  generateSuggestions(@CurrentUser('userId') userId: string) {
    return this.topicsService.generateAISuggestions(userId);
  }

  @Get('google-trends')
  @ApiOperation({ summary: 'Fetch Google Trends results' })
  fetchGoogleTrends(@Query() query: GoogleTrendsQueryDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(query.limit as any, 10) || 10),
    );
    return this.topicsService.fetchGoogleTrends(
      query.geo || 'HK',
      query.timeRange || '24h',
      page,
      limit,
    );
  }

  @Get('all-news')
  @ApiOperation({ summary: 'Fetch trending news aggregated across all sources' })
  fetchAllTrendingNews(@Query() query: GoogleTrendsQueryDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(query.limit as any, 10) || 20),
    );
    return this.topicsService.fetchAllTrendingNews(
      query.geo || 'HK',
      page,
      limit,
    );
  }

  @Get('sina')
  @ApiOperation({ summary: 'Fetch trending news from Sina' })
  fetchSinaNews(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('sina', page, limit);
  }

  @Get('people')
  @ApiOperation({ summary: 'Fetch trending news from People' })
  fetchPeopleNews(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('people', page, limit);
  }

  @Get('bbc')
  @ApiOperation({ summary: 'Fetch trending news from BBC' })
  fetchBBCNews(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('bbc', page, limit);
  }

  @Get('chinanews')
  @ApiOperation({ summary: 'Fetch trending news from China News' })
  fetchChinanews(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('chinanews', page, limit);
  }

  @Get('guardian')
  @ApiOperation({ summary: 'Fetch trending news from The Guardian' })
  fetchGuardian(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('guardian', page, limit);
  }

  @Get('nytimes')
  @ApiOperation({ summary: 'Fetch trending news from The New York Times' })
  fetchNYTimes(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('nytimes', page, limit);
  }

  @Get('economist')
  @ApiOperation({ summary: 'Fetch trending news from The Economist' })
  fetchEconomist(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('economist', page, limit);
  }

  @Get('ft')
  @ApiOperation({ summary: 'Fetch trending news from Financial Times' })
  fetchFT(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('ft', page, limit);
  }

  @Get('zaobao')
  @ApiOperation({ summary: 'Fetch trending news from Lianhe Zaobao' })
  fetchZaobao(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('zaobao', page, limit);
  }

  @Get('weibo-hot')
  @ApiOperation({ summary: 'Fetch trending topics from Weibo' })
  fetchWeiboHot(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('weibo-hot', page, limit);
  }

  @Get('zhihu-hot')
  @ApiOperation({ summary: 'Fetch trending topics from Zhihu' })
  fetchZhihuHot(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('zhihu-hot', page, limit);
  }

  @Get('36kr')
  @ApiOperation({ summary: 'Fetch trending news from 36Kr' })
  fetch36kr(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('36kr', page, limit);
  }

  @Get('huxiu')
  @ApiOperation({ summary: 'Fetch trending news from Huxiu' })
  fetchHuxiu(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('huxiu', page, limit);
  }

  @Get('douban-movie')
  @ApiOperation({ summary: 'Fetch trending movies from Douban' })
  fetchDoubanMovie(@Query() query: SourcePaginationDto) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.topicsService.fetchNewsBySource('douban-movie', page, limit);
  }

  // ─── X (Twitter) 数据源 ───

  @Get('x-trends/woeids')
  @ApiOperation({ summary: 'List configurable X trend regions (WOEIDs)' })
  xTrendWoeids() {
    return this.twitterService.getWoeids();
  }

  @Get('x-trends')
  @ApiOperation({ summary: 'Fetch X (Twitter) trending topics by WOEID' })
  fetchXTrends(
    @CurrentUser('userId') userId: string,
    @Query('woeid') woeid: string,
    @Query() query: SourcePaginationDto,
  ) {
    const w = parseInt(woeid as any, 10) || 1;
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 10));
    return this.twitterService.fetchTrends(userId, w, page, limit);
  }

  @Get('x-accounts')
  @ApiOperation({ summary: 'Fetch latest tweets from all watched X accounts' })
  fetchXAccounts(
    @CurrentUser('userId') userId: string,
    @Query() query: SourcePaginationDto,
  ) {
    const page = Math.max(1, parseInt(query.page as any, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit as any, 10) || 20));
    return this.twitterService.fetchAggregatedAccounts(userId, page, limit);
  }

  @Get('x-accounts/:userName')
  @ApiOperation({ summary: 'Fetch latest tweets from a specific X account by userName' })
  fetchXAccountTweets(
    @CurrentUser('userId') userId: string,
    @Param('userName') userName: string,
    @Query('limit') limit: string,
  ) {
    // 不传 limit → 返回 API 一次给出的全部推文；传了则按该值切片
    const lim = limit ? Math.max(1, parseInt(limit as any, 10)) : undefined;
    return this.twitterService.fetchAccountTweets(
      userName,
      Number.isFinite(lim) ? lim : undefined,
      userId,
      true,
    );
  }

  @Get('x-watch')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List watched X accounts' })
  listXWatchAccounts() {
    return this.twitterService.listAccounts();
  }

  @Post('x-watch')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Add an X account to the watch list' })
  addXWatchAccount(@Body() body: { userName: string; displayName?: string; category?: string }) {
    return this.twitterService.addAccount(body.userName, body.displayName, body.category);
  }

  @Delete('x-watch/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Remove an X account from the watch list' })
  removeXWatchAccount(@Param('id') id: string) {
    return this.twitterService.removeAccount(id);
  }

  @Post('import-google-trend')
  @ApiOperation({ summary: 'Import a Google Trend item as a curated topic' })
  importGoogleTrend(@CurrentUser('userId') userId: string, @Body() data: any) {
    return this.topicsService.importFromGoogleTrends(userId, data);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import any trending item (e.g. X trend/tweet) as a curated topic' })
  importTopic(@CurrentUser('userId') userId: string, @Body() data: any) {
    return this.topicsService.importTopic(userId, data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a curated trending topic by id' })
  findOne(@Param('id') id: string) {
    if (this.SOURCE_KEYS.includes(id)) {
      throw new BadRequestException(
        `Invalid topic ID: '${id}' is a data source name`,
      );
    }
    if (!this.UUID_REGEX.test(id)) {
      throw new BadRequestException(`Unknown data source: ${id}`);
    }
    return this.topicsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a curated trending topic' })
  update(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.topicsService.update(id, dto, userId, role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a curated trending topic' })
  remove(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
  ) {
    return this.topicsService.remove(id, userId, role);
  }

  @Post(':id/adopt')
  @ApiOperation({ summary: 'Adopt a trending topic into a story' })
  adoptTopic(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.topicsService.adoptTopic(id, userId);
  }
}