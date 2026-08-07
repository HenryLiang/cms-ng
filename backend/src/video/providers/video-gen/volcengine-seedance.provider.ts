import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoGenProviderName } from '@cms-ng/shared';
import axios from 'axios';
import { sanitizeForLog } from '../../../common/sanitize.utils';
import {
  VideoGenPollResult,
  VideoGenProvider,
  VideoGenSubmitRequest,
  VideoGenTaskHandle,
} from './video-gen-provider.interface';

/** Ark 内容生成任务响应(仅声明用到的字段) */
interface ArkTaskCreateResponse {
  id?: string;
}

interface ArkTaskGetResponse {
  status?: string;
  content?: { video_url?: string };
  error?: { message?: string };
  usage?: { duration?: number | string };
}

/**
 * 火山引擎 Ark Seedance(即梦)文生视频。
 *
 * API 形态(2026-08 核实):
 * - 提交:POST {base}/contents/generations/tasks
 *   body: { model, content: [{ type: 'text', text: '<prompt> --ratio 9:16 --dur 5 ...' }] }
 *   生成参数以 `--` 后缀内嵌在 prompt 文本中(Ark 内容生成任务约定)
 * - 轮询:GET {base}/contents/generations/tasks/{id}
 *   返回 status: queued|running|succeeded|failed,成功时 content.video_url
 * - base 默认 https://ark.cn-beijing.volces.com/api/v3,Bearer ARK_API_KEY
 */
@Injectable()
export class VolcengineSeedanceProvider implements VideoGenProvider {
  readonly name = VideoGenProviderName.VOLCENGINE;
  private readonly logger = new Logger(VolcengineSeedanceProvider.name);
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly model: string;
  private readonly requestTimeoutMs = 60_000;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ARK_API_KEY') || '';
    this.apiBase =
      config.get<string>('ARK_BASE_URL') ||
      'https://ark.cn-beijing.volces.com/api/v3';
    this.model =
      config.get<string>('SEEDANCE_MODEL') || 'doubao-seedance-1-5-pro-251215';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async submit(req: VideoGenSubmitRequest): Promise<VideoGenTaskHandle> {
    const text = this.buildPromptText(req);
    const content: Array<Record<string, unknown>> = [{ type: 'text', text }];
    if (req.firstFrameUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: req.firstFrameUrl },
        role: 'first_frame',
      });
    }
    this.logger.log(
      `[submit] seedance request: ${JSON.stringify(sanitizeForLog({ model: this.model, content }))}`,
    );
    const { data } = await axios.post<ArkTaskCreateResponse>(
      `${this.apiBase}/contents/generations/tasks`,
      { model: this.model, content },
      {
        headers: this.headers(),
        timeout: this.requestTimeoutMs,
      },
    );
    const taskId = data?.id;
    if (!taskId) {
      throw new Error(
        `Seedance submit 未返回任务 id: ${JSON.stringify(sanitizeForLog(data))}`,
      );
    }
    return { taskId };
  }

  async poll(taskId: string): Promise<VideoGenPollResult> {
    const { data } = await axios.get<ArkTaskGetResponse>(
      `${this.apiBase}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      { headers: this.headers(), timeout: this.requestTimeoutMs },
    );
    const status = String(data?.status ?? '');
    switch (status) {
      case 'succeeded':
        return {
          state: 'succeeded',
          videoUrl: data?.content?.video_url,
          durationSec: data?.usage?.duration
            ? Number(data.usage.duration)
            : undefined,
        };
      case 'failed':
        return {
          state: 'failed',
          error: data?.error?.message || 'Seedance task failed',
        };
      case 'queued':
        return { state: 'pending' };
      case 'running':
      default:
        return { state: 'processing' };
    }
  }

  estimateCost(req: VideoGenSubmitRequest): number {
    // Seedance 按生成时长计费;1080P 单价更高。此处为展示用粗估,实际扣费以计费配置为准。
    const seconds = req.durationSec ?? 6;
    const perSecond = req.resolution === '1080P' ? 0.6 : 0.4;
    return Number((seconds * perSecond).toFixed(2));
  }

  /** 生成参数内嵌 prompt 文本(Ark 内容生成任务约定:`--ratio 9:16 --dur 5`) */
  private buildPromptText(req: VideoGenSubmitRequest): string {
    const parts = [req.prompt.trim()];
    if (req.aspectRatio) parts.push(`--ratio ${req.aspectRatio}`);
    if (req.durationSec) parts.push(`--dur ${req.durationSec}`);
    if (req.resolution) {
      parts.push(`--res ${req.resolution === '1080P' ? '1080p' : '768p'}`);
    }
    return parts.join(' ');
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}
