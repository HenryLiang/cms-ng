import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoGenProviderName } from '@cms-ng/shared';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { Readable } from 'stream';
import { sanitizeForLog } from '../../../common/sanitize.utils';
import {
  TtsProvider,
  TtsRequest,
  TtsResult,
  WordTimestamp,
} from './tts-provider.interface';

/** V3 SSE 事件(HTTP 单向流式响应按行 JSON,可能带 "data:" 前缀) */
interface VolcTtsV3Event {
  code?: number;
  message?: string;
  /** 352=TTSResponse(音频);TTSSubtitle=字幕;152=SessionFinish;153=SessionFailed */
  event?: number | string;
  /** base64 音频分片(TTSResponse) */
  data?: string;
  /** 字幕句(TTSSubtitle):字/词级时间戳,秒,相对整个 session */
  sentence?: {
    text?: string;
    words?: Array<{ word: string; startTime: number; endTime: number }>;
  };
}

const EVENT_TTS_RESPONSE = 352;
const EVENT_SESSION_FAILED = 153;

/**
 * 火山引擎豆包语音合成大模型 · V3 HTTP 单向流式(SSE)。
 *
 * API 形态(2026-08 官方文档 docs/6561/1598757):
 * - POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
 * - 认证(两种,新控制台单 key 优先):
 *   X-Api-Key=VOLC_TTS_API_KEY;或旧版 X-Api-App-Id + X-Api-Access-Key
 * - X-Api-Resource-Id 决定模型版本:seed-tts-2.0(TTS 2.0,默认)
 * - audio_params.enable_subtitle=true → TTSSubtitle 事件返回字/词级
 *   时间戳(秒,相对 session,基于原文)→ 字幕逐词烧录无需降级
 * - ⚠️ 与 Ark(ARK_API_KEY)是两套凭证体系:语音技术产品线需单独开通
 *   (实测 2026-08:Ark 账号 129 个模型无语音类,/audio/speech 404,
 *   Ark key 作 X-Api-Key 打 openspeech 返回 401 Invalid X-Api-Key)
 *
 * 凭证未配置时工厂返回 null,L2 成片降级为无配音模式(字幕 + 画面)。
 */
@Injectable()
export class VolcengineTtsProvider implements TtsProvider {
  readonly name = VideoGenProviderName.VOLCENGINE;
  private readonly logger = new Logger(VolcengineTtsProvider.name);
  private readonly apiKey: string;
  private readonly appId: string;
  private readonly accessToken: string;
  private readonly resourceId: string;
  private readonly apiBase: string;
  private readonly voice: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('VOLC_TTS_API_KEY') || '';
    this.appId = config.get<string>('VOLC_TTS_APP_ID') || '';
    this.accessToken = config.get<string>('VOLC_TTS_ACCESS_TOKEN') || '';
    this.resourceId =
      config.get<string>('VOLC_TTS_RESOURCE_ID') || 'seed-tts-2.0';
    this.apiBase =
      config.get<string>('VOLC_TTS_API_BASE') ||
      'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
    this.voice =
      config.get<string>('VOLC_TTS_VOICE') || 'zh_female_cancan_mars_bigtts';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey || (this.appId && this.accessToken));
  }

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    // speech_rate ∈ [-50,100],0=原速,100=2 倍速;内部 speed 是倍率(1.0 原速)
    const speechRate = Math.round(
      Math.min(100, Math.max(-50, ((req.speed ?? 1) - 1) * 100)),
    );
    const body = {
      user: { uid: 'cms-ng-video' },
      req_params: {
        text: req.text,
        speaker: req.voiceId || this.voice,
        audio_params: {
          format: 'mp3',
          sample_rate: 24000,
          speech_rate: speechRate,
          enable_subtitle: true,
        },
      },
    };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Resource-Id': this.resourceId,
      'X-Api-Request-Id': randomUUID(),
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    } else {
      headers['X-Api-App-Id'] = this.appId;
      headers['X-Api-Access-Key'] = this.accessToken;
    }

    const resp = await axios.post<Readable>(this.apiBase, body, {
      headers,
      responseType: 'stream',
      timeout: 120_000,
    });
    const events = await this.readEvents(resp.data);

    const audioChunks: Buffer[] = [];
    const wordTimestamps: WordTimestamp[] = [];
    for (const ev of events) {
      if (
        ev.event === EVENT_SESSION_FAILED ||
        (ev.code != null && ev.code !== 0)
      ) {
        throw new Error(
          `火山 TTS 合成失败: code=${ev.code} event=${ev.event} ` +
            `msg=${ev.message ?? ''}`,
        );
      }
      if (ev.event === EVENT_TTS_RESPONSE && ev.data) {
        audioChunks.push(Buffer.from(ev.data, 'base64'));
      }
      if (ev.sentence?.words?.length) {
        for (const w of ev.sentence.words) {
          wordTimestamps.push({
            text: w.word,
            beginMs: Math.round(w.startTime * 1000),
            endMs: Math.round(w.endTime * 1000),
          });
        }
      }
    }
    if (!audioChunks.length) {
      throw new Error(
        `火山 TTS 未返回音频: ${JSON.stringify(sanitizeForLog({ events: events.length }))}`,
      );
    }
    const audio = Buffer.concat(audioChunks);
    const lastWord = wordTimestamps[wordTimestamps.length - 1];
    this.logger.log(
      `[synthesize] ${req.text.length} 字 → ${audio.length}B,` +
        `字幕词 ${wordTimestamps.length} 个`,
    );
    return {
      audio,
      // 词级时间戳的末词结束时间即真实时长;无字幕时返回 0 由调用方估算
      durationMs: lastWord?.endMs ?? 0,
      wordTimestamps: wordTimestamps.length ? wordTimestamps : undefined,
    };
  }

  /** SSE/JSON 行流 → 事件数组(兼容 "data: " 前缀与不完整尾行) */
  private async readEvents(stream: Readable): Promise<VolcTtsV3Event[]> {
    const raw = await new Promise<string>((resolve, reject) => {
      let buf = '';
      stream.on('data', (c: Buffer) => (buf += c.toString('utf8')));
      stream.on('end', () => resolve(buf));
      stream.on('error', reject);
    });
    const events: VolcTtsV3Event[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim().replace(/^data:\s*/, '');
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as VolcTtsV3Event);
      } catch {
        // 跳过非 JSON 行(SSE 注释/心跳等)
      }
    }
    return events;
  }
}
