import { VideoGenProviderName } from '@cms-ng/shared';

/** 词级时间戳(字幕烧录用) */
export interface WordTimestamp {
  text: string;
  beginMs: number;
  endMs: number;
}

export interface TtsRequest {
  text: string;
  /** 音色 ID;缺省用 provider 默认音色 */
  voiceId?: string;
  /** 语速倍率,1.0 为正常 */
  speed?: number;
}

export interface TtsResult {
  /** 音频二进制(mp3)—— 调用方负责转存 COS,不在 provider 内做(存储是底层共用能力) */
  audio: Buffer;
  durationMs: number;
  /** minimax 必有;volcengine 取决于接口能力(未返回则字幕按句均摊降级) */
  wordTimestamps?: WordTimestamp[];
}

export interface TtsProvider {
  readonly name: VideoGenProviderName;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

export const TTS_PROVIDER = 'TTS_PROVIDER';
