import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoGenProviderName } from '@cms-ng/shared';
import axios from 'axios';
import { sanitizeForLog } from '../../../common/sanitize.utils';
import {
  ImageGenProvider,
  ImageGenRequest,
} from './image-gen-provider.interface';

interface SeedreamImageResponse {
  data?: Array<{ url?: string }>;
}

/** 画幅 → Seedream 像素尺寸(沿用文章配图链路验证过的 2K 档映射) */
const SIZE_BY_RATIO: Record<string, string> = {
  '16:9': '2848x1600',
  '9:16': '1600x2848',
  '1:1': '2048x2048',
};

/**
 * 火山引擎 Seedream 文生图(视频管道专用封装)。
 *
 * 与 ai.service.ts 文章配图链路的底层调用形态一致(POST /images/generations),
 * 但按解耦红线重新封装:不复用 AIService 函数,避免两条过程逻辑通过共享函数演化耦合。
 * 读取 SEEDREAM_API_KEY / SEEDREAM_API_BASE / SEEDREAM_MODEL(与文章配图同一组 env)。
 */
@Injectable()
export class VolcengineSeedreamProvider implements ImageGenProvider {
  readonly name = VideoGenProviderName.VOLCENGINE;
  private readonly logger = new Logger(VolcengineSeedreamProvider.name);
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('SEEDREAM_API_KEY') || '';
    this.apiBase =
      config.get<string>('SEEDREAM_API_BASE') ||
      'https://ark.cn-beijing.volces.com/api/v3';
    this.model =
      config.get<string>('SEEDREAM_MODEL') || 'doubao-seedream-5-0-260128';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(req: ImageGenRequest): Promise<{ imageUrl: string }> {
    const size = SIZE_BY_RATIO[req.aspectRatio ?? '9:16'] ?? '1600x2848';
    const body = {
      model: this.model,
      prompt: req.prompt,
      size,
      output_format: 'jpeg',
      watermark: false,
    };
    this.logger.log(
      `[generate] seedream request: ${JSON.stringify(sanitizeForLog(body))}`,
    );
    const { data } = await axios.post<SeedreamImageResponse>(
      `${this.apiBase}/images/generations`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120_000,
      },
    );
    const url = data?.data?.[0]?.url;
    if (!url) {
      throw new Error(
        `Seedream 未返回图片 URL: ${JSON.stringify(sanitizeForLog(data))}`,
      );
    }
    return { imageUrl: url };
  }
}
