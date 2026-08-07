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

/** MiniMax API 响应(仅声明用到的字段) */
interface MinimaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

interface MinimaxSubmitResponse {
  task_id?: string | number;
  base_resp?: MinimaxBaseResp;
}

interface MinimaxQueryResponse {
  status?: string;
  file_id?: string | number;
  video_width?: number;
  video_height?: number;
  base_resp?: MinimaxBaseResp;
}

interface MinimaxFileResponse {
  file?: { download_url?: string };
  base_resp?: MinimaxBaseResp;
}

/**
 * MiniMax Hailuo(海螺)文生视频。
 *
 * API 形态(2026-08 官方文档核实):
 * - 提交:POST {base}/v1/video_generation
 *   { model: 'MiniMax-Hailuo-2.3', prompt, duration: 6|10, resolution: '768P'|'1080P',
 *     prompt_optimizer, first_frame_image? } → { task_id }
 * - 轮询:GET {base}/v1/query/video_generation?task_id= →
 *   status: Preparing|Queueing|Processing|Success|Fail,成功时 file_id
 * - 取文件:GET {base}/v1/files/retrieve?file_id= → file.download_url
 *   ⚠️ 下载 URL 仅 9 小时有效 —— 调用方必须 succeeded 后立即转存 COS
 * - base 默认 https://api.minimax.io(国内站 api.minimaxi.com 需 GroupId,
 *   以 query 参数 group_id 形式附加,由 MINIMAX_GROUP_ID 配置)
 */
@Injectable()
export class MinimaxHailuoProvider implements VideoGenProvider {
  readonly name = VideoGenProviderName.MINIMAX;
  /** Hailuo 2.3 无原生音频;L2 配音走 MiniMax TTS(t2a_v2) */
  readonly supportsNativeAudio = false;
  private readonly logger = new Logger(MinimaxHailuoProvider.name);
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly groupId: string;
  private readonly model: string;
  private readonly requestTimeoutMs = 60_000;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('MINIMAX_API_KEY') || '';
    this.apiBase =
      config.get<string>('MINIMAX_BASE_URL') || 'https://api.minimax.io';
    this.groupId = config.get<string>('MINIMAX_GROUP_ID') || '';
    this.model =
      config.get<string>('MINIMAX_VIDEO_MODEL') || 'MiniMax-Hailuo-2.3';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async submit(req: VideoGenSubmitRequest): Promise<VideoGenTaskHandle> {
    const body: Record<string, unknown> = {
      model: this.model,
      prompt: req.prompt,
      // 关闭 prompt 自动优化:分镜 prompt 由我们自己的 LLM 步骤生成,保持原样可控
      prompt_optimizer: false,
    };
    if (req.durationSec)
      body.duration = this.normalizeDuration(req.durationSec);
    // Hailuo 2.3 仅 768P/1080P 两档;480P 请求映射到就近的 768P
    if (req.resolution)
      body.resolution = req.resolution === '1080P' ? '1080P' : '768P';
    if (req.firstFrameUrl) body.first_frame_image = req.firstFrameUrl;
    this.logger.log(
      `[submit] hailuo request: ${JSON.stringify(sanitizeForLog(body))}`,
    );
    const { data } = await axios.post<MinimaxSubmitResponse>(
      `${this.apiBase}/v1/video_generation`,
      body,
      { headers: this.headers(), timeout: this.requestTimeoutMs },
    );
    this.assertBaseResp(data, 'submit');
    const taskId = data.task_id != null ? String(data.task_id) : undefined;
    if (!taskId) {
      throw new Error(
        `MiniMax submit 未返回 task_id: ${JSON.stringify(sanitizeForLog(data))}`,
      );
    }
    return { taskId };
  }

  async poll(taskId: string): Promise<VideoGenPollResult> {
    const { data } = await axios.get<MinimaxQueryResponse>(
      `${this.apiBase}/v1/query/video_generation`,
      {
        headers: this.headers(),
        params: this.withGroupId({ task_id: taskId }),
        timeout: this.requestTimeoutMs,
      },
    );
    this.assertBaseResp(data, 'poll');
    const status = String(data.status ?? '');
    switch (status) {
      case 'Success': {
        const fileId = data.file_id != null ? String(data.file_id) : '';
        const videoUrl = fileId ? await this.retrieveDownloadUrl(fileId) : '';
        return {
          state: 'succeeded',
          videoUrl,
          width: data.video_width ? Number(data.video_width) : undefined,
          height: data.video_height ? Number(data.video_height) : undefined,
        };
      }
      case 'Fail':
        return { state: 'failed', error: 'MiniMax video task failed' };
      case 'Preparing':
      case 'Queueing':
        return { state: 'pending' };
      case 'Processing':
      default:
        return { state: 'processing' };
    }
  }

  estimateCost(req: VideoGenSubmitRequest): number {
    // Hailuo-2.3 按条/按时长阶梯计价;此处为展示用粗估,实际扣费以计费配置为准。
    const seconds = req.durationSec ?? 6;
    const perSecond = req.resolution === '1080P' ? 0.8 : 0.5;
    return Number((seconds * perSecond).toFixed(2));
  }

  /** file_id → 临时下载 URL(9h 有效,调用方立即转存) */
  private async retrieveDownloadUrl(fileId: string): Promise<string> {
    const { data } = await axios.get<MinimaxFileResponse>(
      `${this.apiBase}/v1/files/retrieve`,
      {
        headers: this.headers(),
        params: this.withGroupId({ file_id: fileId }),
        timeout: this.requestTimeoutMs,
      },
    );
    this.assertBaseResp(data, 'files/retrieve');
    const url = data.file?.download_url;
    if (!url) {
      throw new Error(
        `MiniMax files/retrieve 未返回 download_url(file_id=${fileId})`,
      );
    }
    return url;
  }

  private assertBaseResp(
    data: { base_resp?: MinimaxBaseResp },
    op: string,
  ): void {
    const code = data.base_resp?.status_code;
    if (code !== undefined && code !== 0) {
      throw new Error(
        `MiniMax ${op} 失败: status_code=${code} msg=${data.base_resp?.status_msg ?? ''}`,
      );
    }
  }

  /** Hailuo 2.3 仅接受 6|10 秒档;其他时长收敛最近档(≤8→6,>8→10),避免 API 拒绝 */
  private normalizeDuration(durationSec: number): number {
    return durationSec <= 8 ? 6 : 10;
  }

  /** 国内站(api.minimaxi.com)要求 GroupId 作为 query 参数;国际站留空即可 */
  private withGroupId<T extends Record<string, unknown>>(params: T): T {
    if (!this.groupId) return params;
    return { ...params, GroupId: this.groupId };
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}
