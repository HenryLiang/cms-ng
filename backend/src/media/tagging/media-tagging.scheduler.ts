import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MediaTaggingService } from './media-tagging.service';

/**
 * 打标兜底定时任务:重扫 FAILED(退避重试)/ PENDING 超 10min(崩溃恢复)/
 * TAGGING 僵尸(进程崩溃卡死)。开关关闭时 service 内部整体跳过。
 */
@Injectable()
export class MediaTaggingScheduler {
  private readonly logger = new Logger(MediaTaggingScheduler.name);

  constructor(private readonly tagging: MediaTaggingService) {}

  /** 每 5 分钟扫一次(避开整点/半点,降低与其它周期任务撞车) */
  @Cron('*/5 * * * *')
  async sweepStale(): Promise<void> {
    if (!this.tagging.isEnabled()) return;
    try {
      await this.tagging.sweepStale();
    } catch (err) {
      this.logger.error(`打标兜底重扫失败: ${(err as Error)?.message ?? err}`);
    }
  }
}
