import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AutoPublishService } from './auto-publish.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryRunDto } from './dto/query-run.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@cms-ng/shared';

@ApiTags('auto-publish')
@ApiBearerAuth('bearer')
@Controller('auto-publish')
@Roles(UserRole.ADMIN, UserRole.EDITOR)
export class AutoPublishController {
  constructor(private readonly service: AutoPublishService) {}

  // ===== Task CRUD =====

  @Post('tasks')
  @ApiOperation({ summary: 'Create a new auto-publish task' })
  async create(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateTaskDto,
  ) {
    return this.service.createTask(req.user.userId, dto);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List all auto-publish tasks' })
  async findAll() {
    return this.service.findAll();
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'Get a single auto-publish task by id' })
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Update an auto-publish task' })
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.service.update(id, dto);
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Delete an auto-publish task' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('tasks/:id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle an auto-publish task active/paused' })
  async toggle(@Param('id') id: string) {
    return this.service.toggleTask(id);
  }

  @Post('tasks/:id/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger a task run' })
  async manualRun(@Param('id') id: string) {
    return this.service.manualRun(id);
  }

  // ===== Run records =====

  @Get('runs')
  @ApiOperation({ summary: 'List run records with optional filters' })
  async findRuns(@Query() query: QueryRunDto) {
    return this.service.findRuns(query);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get a single run record by id' })
  async findRunById(@Param('id') id: string) {
    return this.service.findRunById(id);
  }

  // ===== Article tracking =====

  @Get('runs/:runId/articles')
  @ApiOperation({ summary: 'List articles tracked under a given run' })
  async findRunArticles(@Param('runId') runId: string) {
    return this.service.findRunArticles(runId);
  }

  @Get('articles/:id/trace')
  @ApiOperation({
    summary: 'Get the execution trace for a single auto-publish article',
  })
  async findArticleTrace(@Param('id') id: string) {
    return this.service.findArticleTrace(id);
  }

  @Post('articles/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw a single auto-publish article' })
  async withdrawArticle(@Param('id') id: string) {
    return this.service.withdrawArticle(id);
  }

  @Post('articles/:id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed auto-publish article' })
  async retryArticle(@Param('id') id: string) {
    return this.service.retryArticle(id);
  }

  // ===== Global controls =====

  @Post('kill-switch')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle the global auto-publish kill switch (admin only)',
  })
  async killSwitch(
    @Request() req: { user: { userId?: string; id?: string } },
    @Body('enable') enable: boolean,
    @Body('reason') reason?: string,
  ) {
    const operatorId = req.user?.userId || req.user?.id || 'unknown';
    return this.service.killSwitch(enable !== false, operatorId, reason);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregate auto-publish stats' })
  async getStats() {
    return this.service.getStats();
  }
}
