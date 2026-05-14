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
    it('should return all articles', async () => {
      prisma.article.findMany.mockResolvedValue([mockArticle()]);

      const result = await service.findAll({});

      expect(prisma.article.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { updatedAt: 'desc' },
        include: expect.any(Object),
      });
      expect(result).toHaveLength(1);
    });

    it('should filter by authorId and storyId', async () => {
      prisma.article.findMany.mockResolvedValue([mockArticle()]);

      await service.findAll({ authorId: 'author-id', storyId: 'story-id' });

      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authorId: 'author-id', storyId: 'story-id' },
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

      const result = await service.update('article-id', 'author-id', { content: 'Updated' } as any);

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

      await service.update('article-id', 'author-id', { status: 'PUBLISHED' } as any);

      expect(prisma.articleVersion.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', 'author-id', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when author mismatch', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ authorId: 'other-id' }));

      await expect(service.update('article-id', 'author-id', {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete article when author matches', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
      prisma.article.delete.mockResolvedValue(mockArticle());

      const result = await service.remove('article-id', 'author-id');

      expect(prisma.article.delete).toHaveBeenCalledWith({ where: { id: 'article-id' } });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when article not found', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent', 'author-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when author mismatch', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ authorId: 'other-id' }));

      await expect(service.remove('article-id', 'author-id')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('AI operations', () => {
    beforeEach(() => {
      prisma.article.findUnique.mockResolvedValue(mockArticle());
    });

    it('aiRewrite should call aiService.rewriteText', async () => {
      aiService.rewriteText.mockResolvedValue('Rewritten');

      const result = await service.aiRewrite('article-id', 'author-id', { text: 'Hello' } as any);

      expect(aiService.rewriteText).toHaveBeenCalledWith('author-id', 'article-id', expect.any(Object));
      expect(result.result).toBe('Rewritten');
    });

    it('aiExpand should call aiService.expandText', async () => {
      aiService.expandText.mockResolvedValue('Expanded');

      const result = await service.aiExpand('article-id', 'author-id', { text: 'Hello' } as any);

      expect(result.result).toBe('Expanded');
    });

    it('aiCondense should call aiService.condenseText', async () => {
      aiService.condenseText.mockResolvedValue('Short');

      const result = await service.aiCondense('article-id', 'author-id', { text: 'Hello' } as any);

      expect(result.result).toBe('Short');
    });

    it('aiPolish should call aiService.polishText', async () => {
      aiService.polishText.mockResolvedValue('Polished');

      const result = await service.aiPolish('article-id', 'author-id', { text: 'Hello' } as any);

      expect(result.result).toBe('Polished');
    });

    it('aiHeadlines should call aiService.generateHeadlines', async () => {
      aiService.generateHeadlines.mockResolvedValue([{ title: 'H1', style: 's', reasoning: 'r' }]);

      const result = await service.aiHeadlines('article-id', 'author-id', {} as any);

      expect(result.headlines).toHaveLength(1);
    });

    it('aiExcerpt should call aiService.generateExcerpt', async () => {
      aiService.generateExcerpt.mockResolvedValue('Excerpt');

      const result = await service.aiExcerpt('article-id', 'author-id', {} as any);

      expect(result.excerpt).toBe('Excerpt');
    });

    it('aiChat should call aiService.chatWithAI', async () => {
      aiService.chatWithAI.mockResolvedValue('Reply');

      const result = await service.aiChat('article-id', 'author-id', { messages: [] } as any);

      expect(result.reply).toBe('Reply');
    });

    it('should throw ForbiddenException for AI ops when author mismatch', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ authorId: 'other-id' }));

      await expect(service.aiRewrite('article-id', 'author-id', { text: 'Hello' } as any)).rejects.toThrow(ForbiddenException);
    });
  });
});
