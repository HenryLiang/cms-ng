import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoGenProviderName } from '@cms-ng/shared';
import axios from 'axios';
import { sanitizeForLog } from '../../../common/sanitize.utils';
import {
  VideoGenDurationCapability,
  VideoGenParamCapabilities,
  VideoGenPollResult,
  VideoGenProvider,
  VideoGenSubmitRequest,
  VideoGenTaskHandle,
  VideoReference,
} from './video-gen-provider.interface';

/** Ark 内容生成任务响应(仅声明用到的字段) */
interface ArkTaskCreateResponse {
  id?: string;
}

interface ArkTaskGetResponse {
  status?: string;
  content?: { video_url?: string; last_frame_url?: string };
  error?: { message?: string };
  usage?: { duration?: number | string };
}

/**
 * 火山引擎 Ark Seedance(即梦)文生视频。
 *
 * API 形态(2026-08 核实):
 * - 提交:POST {base}/contents/generations/tasks
 *   body: { model, content: [...], generate_audio?, ...v2Params }
 *   content 数组:text 项 + 参考物项(2.x 带 role,见 paramCapabilities);
 *   1.x 生成参数以 `--` 后缀内嵌 prompt 文本,2.x 走顶层 body 参数
 * - 轮询:GET {base}/contents/generations/tasks/{id}
 *   返回 status: queued|running|succeeded|failed,成功时 content.video_url
 *   (return_last_frame=true 时另有 content.last_frame_url)
 * - base 默认 https://ark.cn-beijing.volces.com/api/v3,Bearer ARK_API_KEY
 */
@Injectable()
export class VolcengineSeedanceProvider implements VideoGenProvider {
  readonly name = VideoGenProviderName.VOLCENGINE;
  private readonly logger = new Logger(VolcengineSeedanceProvider.name);
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly model: string;
  /** 2.x 系(2.0/2.0-fast/2.0-mini/2.5):时长 4~15s 自由档,分辨率 480p/720p */
  private readonly isV2: boolean;
  /** 2.0-mini 轻量档:480p/720p 两档(与全系一致;1080P 已下线) */
  private readonly isV2Mini: boolean;
  private readonly requestTimeoutMs = 60_000;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ARK_API_KEY') || '';
    this.apiBase =
      config.get<string>('ARK_BASE_URL') ||
      'https://ark.cn-beijing.volces.com/api/v3';
    this.model =
      config.get<string>('SEEDANCE_MODEL') || 'doubao-seedance-1-5-pro-251215';
    this.isV2 = /seedance-2-/.test(this.model);
    this.isV2Mini = /seedance-2-\d+-mini/.test(this.model);
  }

  /** Seedance 1.5+/2.x 支持 generate_audio(1.0 系不支持) */
  get supportsNativeAudio(): boolean {
    return /seedance-(1-5|2-)/.test(this.model);
  }

  /** 时长能力:2.x 自由档 4~15s;1.x 仅 5/10 档(其他值收敛最近档)*/
  get durationCapabilities(): VideoGenDurationCapability {
    if (this.isV2) {
      return { mode: 'free', min: 4, max: 15 };
    }
    return { mode: 'fixed', min: 5, max: 10, allowed: [5, 10] };
  }

  /**
   * 多模态参考/可选参数能力(实测账号 /models 元数据 + 官方文档,PRD §18):
   * 2.x 全系 input_modalities=[text,image,video,audio] → 五种参考角色全支持,
   * 另有 seed/draft/return_last_frame;1.x 仅首帧图(无 role 概念,裸 image_url)。
   */
  get paramCapabilities(): VideoGenParamCapabilities {
    if (this.isV2) {
      return {
        referenceRoles: [
          'first_frame',
          'last_frame',
          'reference_image',
          'reference_video',
          'reference_audio',
        ],
        seed: true,
        // 2026-08-08 实测:mini 全模式(t2v/i2v/flf2v/r2v)均禁 draft(4×400);
        // 非 mini 2.x 按官方文档置 true(本账号无 pro 模型,未实测)
        draft: !this.isV2Mini,
        returnLastFrame: true,
        // 互斥约束(2026-08-08 实测 400,平台级文案未点名模型,推定 2.x 通用):
        // "first/last frame content cannot be mixed with reference media content"
        frameReferenceExclusive: true,
      };
    }
    return {
      referenceRoles: ['first_frame'],
      seed: false,
      draft: false,
      returnLastFrame: false,
    };
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async submit(req: VideoGenSubmitRequest): Promise<VideoGenTaskHandle> {
    const text = this.buildPromptText(req);
    const content: Array<Record<string, unknown>> = [{ type: 'text', text }];
    // 首帧:firstFrameUrl 与 references.first_frame 等价,references 优先;
    // 1.x 不支持 role 字段,首帧用裸 image_url(服务端按位置推断)
    const firstFrame =
      req.references?.find((r) => r.role === 'first_frame')?.url ??
      req.firstFrameUrl;
    if (firstFrame) {
      content.push({
        type: 'image_url',
        image_url: { url: firstFrame },
        ...(this.isV2 ? { role: 'first_frame' } : {}),
      });
    }
    // 其余参考角色仅 2.x 支持(service 层已按 paramCapabilities 校验,此处兜底跳过)
    if (this.isV2) {
      for (const ref of req.references ?? []) {
        if (ref.role === 'first_frame') continue; // 已并入上方首帧
        content.push(this.referenceContentItem(ref));
      }
    }
    // 原生音频:顶层 generate_audio 参数(仅 1.5+/2.x;1.0 系忽略该请求)
    const generateAudio = Boolean(
      req.generateAudio && this.supportsNativeAudio,
    );
    // 2.x 的 ratio/duration/resolution 是顶层 body 参数(官方文档);
    // prompt 内嵌 -- 后缀是 1.x 约定,2.x 下 --res 会被静默忽略(实测退化默认 720p)
    const v2Params: Record<string, unknown> = this.isV2
      ? {
          ...(req.aspectRatio ? { ratio: req.aspectRatio } : {}),
          ...(req.durationSec
            ? { duration: this.normalizeDuration(req.durationSec) }
            : {}),
          ...(req.resolution
            ? { resolution: this.resolutionParam(req.resolution) }
            : {}),
          ...(req.seed != null ? { seed: req.seed } : {}),
          ...(req.draft ? { draft: true } : {}),
          ...(req.returnLastFrame ? { return_last_frame: true } : {}),
        }
      : {};
    this.logger.log(
      `[submit] seedance request: ${JSON.stringify(sanitizeForLog({ model: this.model, generate_audio: generateAudio, ...v2Params, content }))}`,
    );
    let data: ArkTaskCreateResponse;
    try {
      ({ data } = await axios.post<ArkTaskCreateResponse>(
        `${this.apiBase}/contents/generations/tasks`,
        {
          model: this.model,
          content,
          ...(generateAudio ? { generate_audio: true } : {}),
          ...v2Params,
        },
        {
          headers: this.headers(),
          timeout: this.requestTimeoutMs,
        },
      ));
    } catch (err) {
      throw this.asArkError('submit', err);
    }
    const taskId = data?.id;
    if (!taskId) {
      throw new Error(
        `Seedance submit 未返回任务 id: ${JSON.stringify(sanitizeForLog(data))}`,
      );
    }
    return { taskId };
  }

  async poll(taskId: string): Promise<VideoGenPollResult> {
    let data: ArkTaskGetResponse;
    try {
      ({ data } = await axios.get<ArkTaskGetResponse>(
        `${this.apiBase}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
        { headers: this.headers(), timeout: this.requestTimeoutMs },
      ));
    } catch (err) {
      throw this.asArkError('poll', err);
    }
    const status = String(data?.status ?? '');
    switch (status) {
      case 'succeeded':
        return {
          state: 'succeeded',
          videoUrl: data?.content?.video_url,
          lastFrameUrl: data?.content?.last_frame_url ?? undefined,
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
    // Seedance 按生成时长计费;720P 单价高于 480P。此处为展示用粗估,实际扣费以计费配置为准。
    const seconds = req.durationSec ?? 6;
    const perSecond = req.resolution === '720P' ? 0.4 : 0.3;
    return Number((seconds * perSecond).toFixed(2));
  }

  /**
   * Ark 错误透出:axios 异常默认只有 "Request failed with status code 400",
   * 真正的参数原因在 response.data.error.message(如帧/参考互斥、flf2v 禁 draft)
   * —— 必须带出,否则任务失败原因无法定位(2026-08-08 e2e 实测踩坑)。
   */
  private asArkError(stage: 'submit' | 'poll', err: unknown): unknown {
    const resp = (
      err as {
        response?: {
          status?: number;
          data?: { error?: { message?: string } };
        };
      }
    )?.response;
    const detail = resp?.data?.error?.message;
    if (detail) {
      return new Error(
        `Seedance ${stage} 被 Ark 拒绝(HTTP ${resp?.status}): ${detail}`,
      );
    }
    return err;
  }

  /** 参考物 → content 数组项(2.x;角色与素材类型一一对应,PRD §18) */
  private referenceContentItem(ref: VideoReference): Record<string, unknown> {
    switch (ref.role) {
      case 'last_frame':
        return {
          type: 'image_url',
          image_url: { url: ref.url },
          role: 'last_frame',
        };
      case 'reference_image':
        return {
          type: 'image_url',
          image_url: { url: ref.url },
          role: 'reference_image',
        };
      case 'reference_video':
        return {
          type: 'video_url',
          video_url: { url: ref.url },
          role: 'reference_video',
        };
      case 'reference_audio':
        return {
          type: 'audio_url',
          audio_url: { url: ref.url },
          role: 'reference_audio',
        };
      default:
        // first_frame 在 submit 中单独处理;其余未知角色不进 content
        return {
          type: 'image_url',
          image_url: { url: ref.url },
          role: ref.role,
        };
    }
  }

  /** 1.x 约定:生成参数内嵌 prompt 文本(`--ratio 9:16 --dur 5`);2.x 走顶层 body 参数 */
  private buildPromptText(req: VideoGenSubmitRequest): string {
    if (this.isV2) return req.prompt.trim();
    const parts = [req.prompt.trim()];
    if (req.aspectRatio) parts.push(`--ratio ${req.aspectRatio}`);
    if (req.durationSec)
      parts.push(`--dur ${this.normalizeDuration(req.durationSec)}`);
    if (req.resolution) {
      parts.push(`--res ${this.resolutionParam(req.resolution)}`);
    }
    return parts.join(' ');
  }

  /**
   * 分辨率档位按版本映射:2.x 原生 480p/720p(480P->480p,720P->720p);
   * 1.x 无 480p/720p 档,统一回退 768p。存量 768P/1080P 值在 2.x 回落 720p、1.x 回落 768p。
   */
  private resolutionParam(resolution: '480P' | '720P'): string {
    if (!this.isV2) return '768p'; // 1.x 无 480p/720p 档,统一回退 768p
    return resolution === '480P' ? '480p' : '720p';
  }

  /**
   * Seedance 各版本支持的时长档位不同:
   * 1.0 系仅 5/10s(实测 6s 被 1.0-pro 拒绝)→ 收敛最近档;
   * 2.x 系支持 4~15s 自由档 → 取整并钳制到 [4,15]。
   */
  private normalizeDuration(durationSec: number): number {
    if (this.isV2) {
      return Math.min(15, Math.max(4, Math.round(durationSec)));
    }
    return durationSec <= 7 ? 5 : 10;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}
