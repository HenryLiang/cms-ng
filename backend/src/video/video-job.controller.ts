import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CreateVideoJobDto,
  QueryVideoJobDto,
} from './dto/create-video-job.dto';
import { VideoJobService } from './video-job.service';

@ApiTags('video')
@ApiBearerAuth('bearer')
@Controller('video')
export class VideoJobController {
  constructor(private readonly jobs: VideoJobService) {}

  @Get('capability')
  @ApiOperation({ summary: '文生视频能力探测(前端入口显隐依据)' })
  capability() {
    return this.jobs.capability();
  }

  @Post('jobs')
  @ApiOperation({
    summary: '创建视频任务(L1:prompt→片段;L2:articleId→稿件成片)',
  })
  create(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateVideoJobDto,
  ) {
    return this.jobs.create(userId, dto, role);
  }

  @Get('jobs')
  @ApiOperation({ summary: '我的视频任务列表(分页/状态筛选)' })
  list(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryVideoJobDto,
  ) {
    return this.jobs.list(userId, query);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: '视频任务详情' })
  get(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.jobs.get(userId, id);
  }

  @Post('jobs/:id/retry')
  @ApiOperation({
    summary: '重试失败任务(上传失败复用 provider 结果,不重复扣费)',
  })
  retry(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.jobs.retry(userId, id);
  }

  @Post('jobs/:id/cancel')
  @ApiOperation({ summary: '取消进行中任务(provider 侧费用已发生,结果忽略)' })
  cancel(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.jobs.cancel(userId, id);
  }
}
