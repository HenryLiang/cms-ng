import { ConfigService } from '@nestjs/config';
import type { ChatCompletionProvider } from '../../ai/providers';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../../storage/storage.service';
import type { ImageGenProvider } from '../providers/image-gen/image-gen-provider.interface';
import type { TtsProvider } from '../providers/tts/tts-provider.interface';
import type { VideoGenProvider } from '../providers/video-gen/video-gen-provider.interface';

/**
 * 管线 step 的底层能力依赖(注入共用,不含任何文章/auto-publish 过程逻辑)。
 * provider 均可空 —— 缺失时对应能力降级(无图/无配音),由 step 内部分支处理。
 */
export interface VideoPipelineDeps {
  prisma: PrismaService;
  config: ConfigService;
  /** LLM seam(CHAT_PROVIDER)—— 底层共用,仅做脚本/分镜文本生成 */
  chat: ChatCompletionProvider;
  videoGen: VideoGenProvider | null;
  imageGen: ImageGenProvider | null;
  tts: TtsProvider | null;
  storage: StorageService;
}

/** TipTap/HTML 正文 → 纯文本(喂 LLM 前的粗清洗) */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
