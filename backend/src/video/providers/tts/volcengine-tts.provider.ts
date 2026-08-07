import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoGenProviderName } from '@cms-ng/shared';
import axios from 'axios';
import { sanitizeForLog } from '../../../common/sanitize.utils';
import { TtsProvider, TtsRequest, TtsResult } from './tts-provider.interface';

interface VolcTtsResponse {
  code?: number;
  message?: string;
  /** base64 编码的音频 */
  data?: string;
  addition?: { duration?: string };
}

/**
 * 火山引擎豆包语音合成大模型 · HTTP 非流式接口。
 *
 * API 形态(2026-08 官方文档):
 * - POST https://openspeech.bytedance.com/api/v1/tts(同步返回 base64 音频)
 * - 认证头:X-Api-App-Key=VOLC_TTS_APP_ID,X-Api-Access-Key=VOLC_TTS_ACCESS_TOKEN,
 *   X-Api-Resource-Id=volc.service_type.10029(大模型语音合成)
 * - ⚠️ 与 Ark(ARK_API_KEY)是两套凭证体系:语音技术产品线需单独开通
 * - ⚠️ 词/句级时间戳:HTTP 非流式 V1 不返回 → 字幕按句均摊降级(见 PRD §8)
 *
 * 凭证未配置时工厂返回 null,L2 成片降级为无配音模式(字幕 + 画面)。
 */
@Injectable()
export class VolcengineTtsProvider implements TtsProvider {
  readonly name = VideoGenProviderName.VOLCENGINE;
  private readonly logger = new Logger(VolcengineTtsProvider.name);
  private readonly appId: string;
  private readonly accessToken: string;
  private readonly apiBase: string;
  private readonly voice: string;
  private readonly cluster: string;

  constructor(config: ConfigService) {
    this.appId = config.get<string>('VOLC_TTS_APP_ID') || '';
    this.accessToken = config.get<string>('VOLC_TTS_ACCESS_TOKEN') || '';
    this.apiBase =
      config.get<string>('VOLC_TTS_API_BASE') ||
      'https://openspeech.bytedance.com/api/v1/tts';
    this.voice =
      config.get<string>('VOLC_TTS_VOICE') || 'zh_female_cancan_mars_bigtts';
    this.cluster = config.get<string>('VOLC_TTS_CLUSTER') || 'volcano_tts';
  }

  isConfigured(): boolean {
    return Boolean(this.appId && this.accessToken);
  }

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const body = {
      app: {
        appid: this.appId,
        token: this.accessToken,
        cluster: this.cluster,
      },
      user: { uid: 'cms-ng-video' },
      audio: {
        voice_type: req.voiceId || this.voice,
        encoding: 'mp3',
        speed_ratio: req.speed ?? 1.0,
      },
      request: {
        reqid: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        text: req.text,
        operation: 'query',
      },
    };
    const { data } = await axios.post<VolcTtsResponse>(this.apiBase, body, {
      headers: {
        'X-Api-App-Key': this.appId,
        'X-Api-Access-Key': this.accessToken,
        'X-Api-Resource-Id': 'volc.service_type.10029',
        'Content-Type': 'application/json',
      },
      timeout: 60_000,
    });
    if (data?.code !== 3000 || !data?.data) {
      throw new Error(
        `火山 TTS 合成失败: code=${data?.code} msg=${data?.message ?? ''} ` +
          JSON.stringify(sanitizeForLog({ hasData: Boolean(data?.data) })),
      );
    }
    const audio = Buffer.from(data.data, 'base64');
    const durationMs = Number(data.addition?.duration ?? 0);
    return {
      audio,
      durationMs:
        Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0,
      // HTTP 非流式接口无词级时间戳;时长为 0 时由调用方按文本长度估算
    };
  }
}
