import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoGenProviderName } from '@cms-ng/shared';
import axios from 'axios';
import { sanitizeForLog } from '../../../common/sanitize.utils';
import {
  ImageGenProvider,
  ImageGenRequest,
} from './image-gen-provider.interface';

interface MinimaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

interface MinimaxImageResponse {
  data?: { image_urls?: string[] };
  base_resp?: MinimaxBaseResp;
}

/**
 * MiniMax 文生图(视频管道分镜素材)。
 *
 * API 形态(2026-08 官方文档):POST {base}/v1/image_generation,
 * Bearer MINIMAX_API_KEY;国内站 api.minimaxi.com 需 GroupId query 参数。
 * 注意:未实机验证(无 MiniMax 凭证),按官方文档契约编码,首次启用前需契约测试。
 */
@Injectable()
export class MinimaxImageProvider implements ImageGenProvider {
  readonly name = VideoGenProviderName.MINIMAX;
  private readonly logger = new Logger(MinimaxImageProvider.name);
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly groupId: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('MINIMAX_API_KEY') || '';
    this.apiBase =
      config.get<string>('MINIMAX_BASE_URL') || 'https://api.minimax.io';
    this.groupId = config.get<string>('MINIMAX_GROUP_ID') || '';
    this.model = config.get<string>('MINIMAX_IMAGE_MODEL') || 'image-01';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(req: ImageGenRequest): Promise<{ imageUrl: string }> {
    const body = {
      model: this.model,
      prompt: req.prompt,
      aspect_ratio: req.aspectRatio ?? '9:16',
      response_format: 'url',
      n: 1,
    };
    this.logger.log(
      `[generate] minimax image request: ${JSON.stringify(sanitizeForLog(body))}`,
    );
    const { data } = await axios.post<MinimaxImageResponse>(
      `${this.apiBase}/v1/image_generation`,
      body,
      {
        headers: this.headers(),
        params: this.withGroupId({}),
        timeout: 120_000,
      },
    );
    const code = data?.base_resp?.status_code;
    if (code !== undefined && code !== 0) {
      throw new Error(
        `MiniMax 图片生成失败: status_code=${code} msg=${data?.base_resp?.status_msg ?? ''}`,
      );
    }
    const url = data?.data?.image_urls?.[0];
    if (!url) {
      throw new Error(
        `MiniMax 未返回图片 URL: ${JSON.stringify(sanitizeForLog(data))}`,
      );
    }
    return { imageUrl: url };
  }

  /** 国内站 api.minimaxi.com 需要 GroupId query 参数(与 hailuo provider 同约定) */
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
