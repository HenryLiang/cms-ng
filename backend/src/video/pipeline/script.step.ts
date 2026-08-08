import { Logger } from '@nestjs/common';
import type { VideoGenerationJob } from '@prisma/client';
import { VideoPipelineDeps, stripHtml } from './pipeline-deps';

const MAX_ARTICLE_CHARS = 8000;
const MIN_SCRIPT_CHARS = 30;

/**
 * 脚本 step:文章 → 口播脚本(LLM,经 CHAT_PROVIDER seam)。
 * 只读文章数据(Prisma 直查),不 import、不调用文章模块的任何服务/状态机。
 */
export class ScriptStep {
  private readonly logger = new Logger(ScriptStep.name);

  constructor(private readonly deps: VideoPipelineDeps) {}

  async run(job: VideoGenerationJob): Promise<string> {
    if (!job.articleId) throw new Error('L2 任务缺少 articleId');
    const article = await this.deps.prisma.article.findUnique({
      where: { id: job.articleId },
      select: { title: true, content: true },
    });
    if (!article) throw new Error(`来源文章不存在: ${job.articleId}`);

    const body = stripHtml(article.content).slice(0, MAX_ARTICLE_CHARS);
    if (body.length < 50) throw new Error('文章正文过短,无法生成口播脚本');

    const resp = await this.deps.chat.chatCompletion({
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            '你是短视频口播编剧。把给定文章改写成 60~90 秒的口语化中文旁白脚本。' +
            '要求:只输出旁白正文,不要标题/分镜/注释;句子短、口语化、有钩子开头;' +
            '不要出现"大家好""欢迎收看"等套话;不要输出 markdown。',
        },
        {
          role: 'user',
          content: `文章标题:${article.title}\n\n正文:\n${body}`,
        },
      ],
    });
    const script = resp.content.trim();
    if (script.length < MIN_SCRIPT_CHARS) {
      throw new Error(`LLM 口播脚本过短(${script.length} 字),视为契约失败`);
    }
    this.logger.log(`任务 ${job.id} 脚本生成完成:${script.length} 字`);
    return script;
  }
}
