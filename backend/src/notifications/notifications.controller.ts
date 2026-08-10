import { Controller, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('bearer')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '获取当前用户的最新站内通知与未读数' })
  list(
    @CurrentUser('userId') userId: string,
    @Query('limit') rawLimit?: string,
  ) {
    const parsed = Number(rawLimit);
    const limit = Number.isFinite(parsed)
      ? Math.min(50, Math.max(1, Math.floor(parsed)))
      : 20;
    return this.notifications.list(userId, limit);
  }

  @Patch('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: '将当前用户的全部未读通知标记为已读' })
  markAllRead(@CurrentUser('userId') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Patch(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: '将当前用户的一条通知标记为已读' })
  markRead(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id);
  }
}
