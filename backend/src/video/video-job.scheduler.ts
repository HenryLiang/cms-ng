import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { VideoJobService } from './video-job.service';

/**
 * 视频任务兜底定时任务:推进各进行中状态的任务(L1 提交/轮询;L2 脚本→分镜→
 * 素材→配音→合成逐状态续跑),清理上传/合成阶段僵尸(进程崩溃)。
 * 功能关闭时 service 内部整体跳过。
 */
@Injectable()
export class VideoJobScheduler {
  private readonly logger = new Logger(VideoJobScheduler.name);

  constructor(private readonly jobs: VideoJobService) {}

  /** 每分钟扫一次(错开整点/半点与其它周期任务) */
  @Cron('17 * * * * *')
  async sweep(): Promise<void> {
    if (!this.jobs.isEnabled()) return;
    try {
      await this.jobs.sweep();
    } catch (err) {
      this.logger.error(
        `视频任务兜底重扫失败: ${(err as Error)?.message ?? err}`,
      );
    }
  }
}
