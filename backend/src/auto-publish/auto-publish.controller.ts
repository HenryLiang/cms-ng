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
import { AutoPublishService } from './auto-publish.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryRunDto } from './dto/query-run.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@cms-ng/shared';

@Controller('auto-publish')
@Roles(UserRole.ADMIN, UserRole.EDITOR)
export class AutoPublishController {
  constructor(private readonly service: AutoPublishService) {}

  // ===== Task CRUD =====

  @Post('tasks')
  async create(@Request() req: any, @Body() dto: CreateTaskDto) {
    return this.service.createTask(req.user.userId, dto);
  }

  @Get('tasks')
  async findAll() {
    return this.service.findAll();
  }

  @Get('tasks/:id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch('tasks/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.service.update(id, dto);
  }

  @Delete('tasks/:id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('tasks/:id/toggle')
  @HttpCode(HttpStatus.OK)
  async toggle(@Param('id') id: string) {
    return this.service.toggleTask(id);
  }

  @Post('tasks/:id/run')
  @HttpCode(HttpStatus.OK)
  async manualRun(@Param('id') id: string) {
    return this.service.manualRun(id);
  }

  // ===== Run records =====

  @Get('runs')
  async findRuns(@Query() query: QueryRunDto) {
    return this.service.findRuns(query);
  }

  @Get('runs/:id')
  async findRunById(@Param('id') id: string) {
    return this.service.findRunById(id);
  }

  // ===== Article tracking =====

  @Get('runs/:runId/articles')
  async findRunArticles(@Param('runId') runId: string) {
    return this.service.findRunArticles(runId);
  }

  @Post('articles/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdrawArticle(@Param('id') id: string) {
    return this.service.withdrawArticle(id);
  }

  @Post('articles/:id/retry')
  @HttpCode(HttpStatus.OK)
  async retryArticle(@Param('id') id: string) {
    return this.service.retryArticle(id);
  }

  // ===== Global controls =====

  @Post('kill-switch')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async killSwitch(
    @Request() req: any,
    @Body('enable') enable: boolean,
    @Body('reason') reason?: string,
  ) {
    const operatorId = req.user?.userId || req.user?.id || 'unknown';
    return this.service.killSwitch(enable !== false, operatorId, reason);
  }

  @Get('stats')
  async getStats() {
    return this.service.getStats();
  }
}
