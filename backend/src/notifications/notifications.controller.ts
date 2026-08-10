import { Controller, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type {
  ApiResponse,
  NotificationItem,
  NotificationList,
} from '@cms-ng/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('bearer')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '获取当前用户的最新站内通知与未读数' })
  @ApiOkResponse({ description: '通知列表与未读数，使用 ApiResponse 包装' })
  async list(
    @CurrentUser('userId') userId: string,
    @Query() query: QueryNotificationsDto,
  ): Promise<ApiResponse<NotificationList>> {
    return {
      success: true,
      data: await this.notifications.list(userId, query.limit ?? 20),
    };
  }

  @Patch('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: '将当前用户的全部未读通知标记为已读' })
  @ApiOkResponse({ description: '已标记为已读的通知数量' })
  async markAllRead(
    @CurrentUser('userId') userId: string,
  ): Promise<ApiResponse<{ updatedCount: number }>> {
    return {
      success: true,
      data: await this.notifications.markAllRead(userId),
    };
  }

  @Patch(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: '将当前用户的一条通知标记为已读' })
  @ApiParam({ name: 'id', description: '通知 ID' })
  @ApiOkResponse({ description: '更新后的通知，使用 ApiResponse 包装' })
  async markRead(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<ApiResponse<NotificationItem>> {
    return {
      success: true,
      data: await this.notifications.markRead(userId, id),
    };
  }
}
