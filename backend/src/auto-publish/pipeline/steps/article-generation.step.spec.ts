jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

import { AIService } from '../../../ai/ai.service';
import { PipelineContext } from '../step.interface';
import { ArticleGenerationStep } from './article-generation.step';

describe('ArticleGenerationStep', () => {
  it('keeps the AI-generated tags on the draft that will be saved', async () => {
    const aiService = {
      generateDraft: jest.fn().mockResolvedValue({
        title: '香港创科发展提速',
        subtitle: '政策与产业协同推进',
        content: '<p>正文</p>',
        tags: ['香港', '创新科技', '产业政策'],
      }),
      generateExcerpt: jest.fn().mockResolvedValue('摘要'),
    };
    const step = new ArticleGenerationStep(aiService as unknown as AIService);
    const context = {
      taskId: 'task-id',
      runId: 'run-id',
      articleId: 'tracking-id',
      userId: 'user-id',
      topic: '香港创科',
      contentConfig: {
        style: 'standard',
        maxLength: 800,
        language: 'TRADITIONAL_CHINESE_HK',
      },
      publishConfig: { platform: 'WEBSITE' },
    } as PipelineContext;

    const result = await step.execute(context);

    expect(result.draft?.tags).toEqual(['香港', '创新科技', '产业政策']);
  });
});
