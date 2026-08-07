import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoGenProviderName } from '@cms-ng/shared';
import axios from 'axios';
import { sanitizeForLog } from '../../../common/sanitize.utils';
import {
  TtsProvider,
  TtsRequest,
  TtsResult,
  WordTimestamp,
} from './tts-provider.interface';

interface MinimaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

interface MinimaxT2aResponse {
  data?: { audio?: string; status?: number };
  extra_info?: { audio_length?: number };
  subtitle_file?: string;
  base_resp?: MinimaxBaseResp;
}

/** 字幕文件(JSONL)每行形态:{"text":"…","text_begin":0,"text_end":520} 毫秒 */
interface MinimaxSubtitleLine {
  text?: string;
  text_begin?: number;
  text_end?: number;
}

/**
 * MiniMax T2A v2 语音合成(视频管道配音)。
 *
 * API 形态(2026-08 官方文档):POST {base}/v1/t2a_v2,Bearer MINIMAX_API_KEY;
 * 国内站 api.minimaxi.com 需 GroupId query 参数。
 * ✅ subtitle_enable:true 返回 subtitle_file(JSONL URL),词级时间戳 —— 字幕方案关键支撑。
 * 音频默认 hex 编码内联返回(audio_setting.format=mp3)。
 * 注意:未实机验证(无 MiniMax 凭证),按官方文档契约编码,首次启用前需契约测试。
 */
@Injectable()
export class MinimaxTtsProvider implements TtsProvider {
  readonly name = VideoGenProviderName.MINIMAX;
  private readonly logger = new Logger(MinimaxTtsProvider.name);
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly groupId: string;
  private readonly model: string;
  private readonly voice: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('MINIMAX_API_KEY') || '';
    this.apiBase =
      config.get<string>('MINIMAX_BASE_URL') || 'https://api.minimax.io';
    this.groupId = config.get<string>('MINIMAX_GROUP_ID') || '';
    this.model = config.get<string>('MINIMAX_TTS_MODEL') || 'speech-02-hd';
    this.voice = config.get<string>('MINIMAX_TTS_VOICE') || 'male-qn-qingse';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const body = {
      model: this.model,
      text: req.text,
      stream: false,
      voice_setting: {
        voice_id: req.voiceId || this.voice,
        speed: req.speed ?? 1.0,
      },
      audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000 },
      subtitle_enable: true,
    };
    this.logger.log(
      `[synthesize] minimax t2a request: ${JSON.stringify(sanitizeForLog({ ...body, text: `${req.text.slice(0, 30)}…` }))}`,
    );
    const { data } = await axios.post<MinimaxT2aResponse>(
      `${this.apiBase}/v1/t2a_v2`,
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
        `MiniMax TTS 失败: status_code=${code} msg=${data?.base_resp?.status_msg ?? ''}`,
      );
    }
    if (!data?.data?.audio) {
      throw new Error(
        `MiniMax TTS 未返回音频: ${JSON.stringify(sanitizeForLog({ keys: Object.keys(data ?? {}) }))}`,
      );
    }
    const audio = Buffer.from(data.data.audio, 'hex');
    const wordTimestamps = data.subtitle_file
      ? await this.fetchWordTimestamps(data.subtitle_file).catch((err) => {
          // 字幕获取失败不阻塞配音主流程,降级为按句均摊
          this.logger.warn(
            `MiniMax 字幕文件获取失败(降级均摊): ${(err as Error)?.message ?? err}`,
          );
          return undefined;
        })
      : undefined;
    const durationMs = wordTimestamps?.length
      ? wordTimestamps[wordTimestamps.length - 1].endMs
      : Number(data.extra_info?.audio_length ?? 0);
    return { audio, durationMs, wordTimestamps };
  }

  private async fetchWordTimestamps(url: string): Promise<WordTimestamp[]> {
    const { data } = await axios.get<string>(url, {
      timeout: 30_000,
      responseType: 'text',
    });
    return String(data)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as MinimaxSubtitleLine)
      .filter(
        (l): l is Required<MinimaxSubtitleLine> =>
          typeof l.text === 'string' &&
          typeof l.text_begin === 'number' &&
          typeof l.text_end === 'number',
      )
      .map((l) => ({ text: l.text, beginMs: l.text_begin, endMs: l.text_end }));
  }

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
