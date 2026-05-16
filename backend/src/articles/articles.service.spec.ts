import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

describe('ArticlesService', () => {
  let service: ArticlesService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let aiService: {
    rewriteText: jest.Mock;
    expandText: jest.Mock;
    condenseText: jest.Mock;
    polishText: jest.Mock;
    generateHeadlines: jest.Mock;
    generateExcerpt: jest.Mock;
    chatWithAI: jest.Mock;
    generateDraft: jest.Mock;
  };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    aiService = {
      rewriteText: jest.fn(),
      expandText: jest.fn(),
      condenseText: jest.fn(),
      polishText: jest.fn(),
      generateHeadlines: jest.fn(),
      generateExcerpt: jest.fn(),
      chatWithAI: jest.fn(),
      generateDraft: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AIService, useValue: aiService },
      ],
    }).compile();

    service = module.get<ArticlesService>(ArticlesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockArticle = (override?: any) => ({
    id: 'article-id',
    title: 'Test Article',
    subtitle: null,
    content: 'Content',
    excerpt: null,
    status: 'DRAFT',
    tags: '[]',
    platforms: '[]',
    aiGeneratedParts: '[]',
    version: 1,
    storyId: 'story-id',
    authorId: 'author-id',
    editorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'author-id', name: 'Author', email: 'a@example.com' },
    editor: null,
    story: { id: 'story-id', title: 'Story' },
    ...override,
  });

  describe('create', () => {
    it('should create article and first version snapshot', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 'story-id' });
      prisma.article.create.mockResolvedValue(mockArticle());
      prisma.articleVersion.create.mockResolvedValue({ id: 'version-id' });

      const result = await service.create('author-id', {
        storyId: 'story-id',
        title: 'Test Article',
        content: 'Content',
      } as any);

      expect(prisma.article.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storyId: 'story-id',
          title: 'Test Article',
          content: 'Content',
          authorId: 'author-id',
          version: 1,
        }),
        include: expect.any(Object),
      });
      expect(prisma.articleVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          articleId: 'article-id',
          title: 'Test Article',
          content: 'Content',
          version: 1,
        }),
      });
      expect(result.title).toBe('Test Article');
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.create('author-id', { storyId: 'bad' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all articles for admin', async () => {
      prisma.article.findMany.mockResolvedValue([mockArticle()]);

      const result = await service.findAll({ userId: 'admin-id', role: 'ADMIN' }, {});

      expect(prisma.article.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { updatedAt: 'desc' },
        include: expect.any(Object),
      });
      expect(result).toHaveLength(1);
    });

    it('should filter by storyId', async () => {
      prisma.article.findMany.mockResolvedValue([mockArticle()]);

      await service.findAll({ userId: 'author-id', role: 'ADMIN' }, { storyId: 'story-id' });

      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storyId: 'story-id' },
        }),
      );
    });

    it('should restrict reporter to own articles', async () => {
      prisma.article.findMany.mockResolvedValue([mockArticle()]);

      await service.findAll({ userId: 'author-id', role: 'REPORTER' }, {});

      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authorId: 'author-id' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return article with versions', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ versions: [] }));

      const result = await service.findOne('article-id');

      expect(prisma.article.findUnique).toHaveBeenCalledWith({
        where: { id: 'article-id' },
        include: expect.objectContaining({ versions: expect.any(Object) }),
      });
      expect(result.id).toBe('article-id');
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update article and create version when content changes', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.article.update.mockResolvedValue(mockArticle({ version: 2, content: 'Updated' }));
      prisma.articleVersion.create.mockResolvedValue({ id: 'v2' });

      const result = await service.update('article-id', { content: 'Updated' } as any);

      expect(prisma.article.update).toHaveBeenCalledWith({
        where: { id: 'article-id' },
        data: expect.objectContaining({ content: 'Updated', version: 2 }),
        include: expect.any(Object),
      });
      expect(prisma.articleVersion.create).toHaveBeenCalled();
      expect(result.version).toBe(2);
    });

    it('should not create version when content unchanged', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.article.update.mockResolvedValue(mockArticle());

      await service.update('article-id', { status: 'PUBLISHED' } as any);

      expect(prisma.articleVersion.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete article when found', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.article.delete.mockResolvedValue(mockArticle());

      const result = await service.remove('article-id');

      expect(prisma.article.delete).toHaveBeenCalledWith({ where: { id: 'article-id' } });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('AI operations', () => {
    const mockUser = { userId: 'author-id', role: 'REPORTER' };

    beforeEach(() => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
    });

    it('aiRewrite should call aiService.rewriteText', async () => {
      aiService.rewriteText.mockResolvedValue('Rewritten');

      const result = await service.aiRewrite('article-id', mockUser, { text: 'Hello' } as any);

      expect(aiService.rewriteText).toHaveBeenCalledWith('author-id', 'article-id', expect.any(Object));
      expect(result.result).toBe('Rewritten');
    });

    it('aiExpand should call aiService.expandText', async () => {
      aiService.expandText.mockResolvedValue('Expanded');

      const result = await service.aiExpand('article-id', mockUser, { text: 'Hello' } as any);

      expect(result.result).toBe('Expanded');
    });

    it('aiCondense should call aiService.condenseText', async () => {
      aiService.condenseText.mockResolvedValue('Short');

      const result = await service.aiCondense('article-id', mockUser, { text: 'Hello' } as any);

      expect(result.result).toBe('Short');
    });

    it('aiPolish should call aiService.polishText', async () => {
      aiService.polishText.mockResolvedValue('Polished');

      const result = await service.aiPolish('article-id', mockUser, { text: 'Hello' } as any);

      expect(result.result).toBe('Polished');
    });

    it('aiHeadlines should call aiService.generateHeadlines', async () => {
      aiService.generateHeadlines.mockResolvedValue([{ title: 'H1', style: 's', reasoning: 'r' }]);

      const result = await service.aiHeadlines('article-id', mockUser, {} as any);

      expect(result.headlines).toHaveLength(1);
    });

    it('aiExcerpt should call aiService.generateExcerpt', async () => {
      aiService.generateExcerpt.mockResolvedValue('Excerpt');

      const result = await service.aiExcerpt('article-id', mockUser, {} as any);

      expect(result.excerpt).toBe('Excerpt');
    });

    it('aiChat should call aiService.chatWithAI', async () => {
      aiService.chatWithAI.mockResolvedValue('Reply');

      const result = await service.aiChat('article-id', mockUser, { messages: [] } as any);

      expect(result.reply).toBe('Reply');
    });

    it('aiGenerateDraft should call aiService.generateDraft with story context', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 'story-id',
        title: 'Story Title',
        description: 'Story Desc',
        angle: 'Story Angle',
        tags: '["tag1"]',
      });
      aiService.generateDraft.mockResolvedValue({
        title: 'Draft Title',
        subtitle: 'Draft Subtitle',
        content: '<p>Draft content</p>',
      });

      const result = await service.aiGenerateDraft('article-id', mockUser, { instruction: 'Write intro' } as any);

      expect(aiService.generateDraft).toHaveBeenCalledWith('author-id', 'article-id', expect.objectContaining({
        storyTitle: 'Story Title',
        storyDescription: 'Story Desc',
        storyAngle: 'Story Angle',
        storyTags: ['tag1'],
        currentTitle: 'Test Article',
        instruction: 'Write intro',
      }));
      expect(result.title).toBe('Draft Title');
    });

    it('aiGenerateDraft should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.aiGenerateDraft('article-id', mockUser, {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for AI ops when author mismatch', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ authorId: 'other-id' }));

      await expect(service.aiRewrite('article-id', mockUser, { text: 'Hello' } as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('verifyAccess', () => {
    it('should allow admin access', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ authorId: 'other-id' }));

      await expect(service.verifyAccess('article-id', { userId: 'admin-id', role: 'ADMIN' })).resolves.toBeUndefined();
    });

    it('should allow author access', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ authorId: 'author-id' }));

      await expect(service.verifyAccess('article-id', { userId: 'author-id', role: 'REPORTER' })).resolves.toBeUndefined();
    });

    it('should allow editor access', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ authorId: 'other-id', editorId: 'editor-id' }));

      await expect(service.verifyAccess('article-id', { userId: 'editor-id', role: 'EDITOR' })).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(service.verifyAccess('nonexistent', { userId: 'user-id', role: 'REPORTER' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when no access', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ authorId: 'other-id', editorId: 'another-id' }));

      await expect(service.verifyAccess('article-id', { userId: 'user-id', role: 'REPORTER' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReviewQueue', () => {
    it('should return articles with PENDING_REVIEW or IN_REVIEW status', async () => {
      prisma.article.findMany.mockResolvedValue([mockArticle({ status: 'PENDING_REVIEW' })]);

      const result = await service.getReviewQueue('editor-id');

      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PENDING_REVIEW', 'IN_REVIEW'] },
            OR: [{ editorId: 'editor-id' }, { editorId: null }],
          }),
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('assignEditor', () => {
    it('should assign editor to article', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.user.findUnique.mockResolvedValue({ role: 'EDITOR' });
      prisma.article.update.mockResolvedValue(mockArticle({ editorId: 'editor-id' }));

      const result = await service.assignEditor('article-id', 'editor-id');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'editor-id' },
        select: { role: true },
      });
      expect(prisma.article.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { editorId: 'editor-id' },
        }),
      );
      expect(result.editorId).toBe('editor-id');
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(service.assignEditor('nonexistent', 'editor-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when editor not found', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.assignEditor('article-id', 'bad-editor')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not an editor', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.user.findUnique.mockResolvedValue({ role: 'REPORTER' });

      await expect(service.assignEditor('article-id', 'reporter-id')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('submitReview', () => {
    it('should APPROVE article', async () => {
      prisma.article.findUnique.mockResolvedValue({ id: 'article-id', status: 'IN_REVIEW', editorId: 'editor-id' });
      prisma.user.findUnique.mockResolvedValue({ role: 'EDITOR' });
      prisma.article.update.mockResolvedValue(mockArticle({ status: 'APPROVED', editorId: 'editor-id' }));

      const result = await service.submitReview('article-id', 'editor-id', 'APPROVE');

      expect(prisma.article.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
      expect(result.decision).toBe('APPROVE');
      expect(result.comment).toBeNull();
    });

    it('should REVISION article with comment', async () => {
      prisma.article.findUnique.mockResolvedValue({ id: 'article-id', status: 'IN_REVIEW', editorId: 'editor-id' });
      prisma.user.findUnique.mockResolvedValue({ role: 'EDITOR' });
      prisma.article.update.mockResolvedValue(mockArticle({ status: 'REVISION', editorId: 'editor-id' }));

      const result = await service.submitReview('article-id', 'editor-id', 'REVISION', 'Needs work');

      expect(result.decision).toBe('REVISION');
      expect(result.comment).toBe('Needs work');
    });

    it('should allow admin override for assigned article', async () => {
      prisma.article.findUnique.mockResolvedValue({ id: 'article-id', status: 'IN_REVIEW', editorId: 'editor-id' });
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.article.update.mockResolvedValue(mockArticle({ status: 'APPROVED' }));

      const result = await service.submitReview('article-id', 'admin-id', 'APPROVE');

      expect(result.decision).toBe('APPROVE');
    });

    it('should throw ForbiddenException when editor is assigned to another', async () => {
      prisma.article.findUnique.mockResolvedValue({ id: 'article-id', status: 'IN_REVIEW', editorId: 'other-editor' });
      prisma.user.findUnique.mockResolvedValue({ role: 'EDITOR' });

      await expect(service.submitReview('article-id', 'editor-id', 'APPROVE')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for invalid decision', async () => {
      prisma.article.findUnique.mockResolvedValue({ id: 'article-id', status: 'IN_REVIEW', editorId: null });

      await expect(service.submitReview('article-id', 'editor-id', 'INVALID' as any)).rejects.toThrow('Decision must be APPROVE or REVISION');
    });

    it('should throw BadRequestException for REVISION without comment', async () => {
      prisma.article.findUnique.mockResolvedValue({ id: 'article-id', status: 'IN_REVIEW', editorId: null });

      await expect(service.submitReview('article-id', 'editor-id', 'REVISION')).rejects.toThrow('Comment is required for revision');
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(service.submitReview('nonexistent', 'editor-id', 'APPROVE')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getVersions', () => {
    it('should return versions ordered by version desc', async () => {
      prisma.articleVersion.findMany.mockResolvedValue([{ version: 2 }, { version: 1 }]);

      const result = await service.getVersions('article-id');

      expect(prisma.articleVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { articleId: 'article-id' },
          orderBy: { version: 'desc' },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('rollback', () => {
    it('should rollback to version and create new version snapshot', async () => {
      prisma.articleVersion.findFirst.mockResolvedValue({ id: 'v1', version: 1, title: 'Old Title', content: 'Old Content' });
      prisma.article.findUnique.mockResolvedValue(mockArticle({ version: 3 }));
      prisma.article.update.mockResolvedValue(mockArticle({ version: 4, title: 'Old Title', content: 'Old Content' }));
      prisma.articleVersion.create.mockResolvedValue({ id: 'v4' });

      const result = await service.rollback('article-id', 1);

      expect(prisma.articleVersion.findFirst).toHaveBeenCalledWith({
        where: { articleId: 'article-id', version: 1 },
      });
      expect(prisma.article.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'Old Title', content: 'Old Content', version: 4 }),
        }),
      );
      expect(prisma.articleVersion.create).toHaveBeenCalled();
      expect(result.version).toBe(4);
    });

    it('should throw NotFoundException when version not found', async () => {
      prisma.articleVersion.findFirst.mockResolvedValue(null);

      await expect(service.rollback('article-id', 99)).rejects.toThrow('Version not found');
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.articleVersion.findFirst.mockResolvedValue({ id: 'v1', version: 1, title: 'T', content: 'C' });
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(service.rollback('article-id', 1)).rejects.toThrow(NotFoundException);
    });
  });
});
