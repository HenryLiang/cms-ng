jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';

describe('ArticlesController', () => {
  let controller: ArticlesController;
  let articlesService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    verifyAccess: jest.Mock;
    getReviewQueue: jest.Mock;
    getVersions: jest.Mock;
    rollback: jest.Mock;
    assignEditor: jest.Mock;
    submitReview: jest.Mock;
    aiRewrite: jest.Mock;
    aiExpand: jest.Mock;
    aiCondense: jest.Mock;
    aiPolish: jest.Mock;
    aiHeadlines: jest.Mock;
    aiExcerpt: jest.Mock;
    aiChat: jest.Mock;
    aiFactCheck: jest.Mock;
    aiReview: jest.Mock;
  };

  beforeEach(async () => {
    articlesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      verifyAccess: jest.fn(),
      getReviewQueue: jest.fn(),
      getVersions: jest.fn(),
      rollback: jest.fn(),
      assignEditor: jest.fn(),
      submitReview: jest.fn(),
      aiRewrite: jest.fn(),
      aiExpand: jest.fn(),
      aiCondense: jest.fn(),
      aiPolish: jest.fn(),
      aiHeadlines: jest.fn(),
      aiExcerpt: jest.fn(),
      aiChat: jest.fn(),
      aiFactCheck: jest.fn(),
      aiReview: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [{ provide: ArticlesService, useValue: articlesService }],
    }).compile();

    controller = module.get<ArticlesController>(ArticlesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockUser = { userId: 'author-id', role: 'REPORTER' };
  const mockAdmin = { userId: 'admin-id', role: 'ADMIN' };
  const mockArticle = (override?: any) => ({
    id: 'article-id',
    title: 'Test Article',
    authorId: 'author-id',
    editorId: null,
    ...override,
  });

  describe('create', () => {
    it('should call articlesService.create', async () => {
      articlesService.create.mockResolvedValue(mockArticle());

      const result = await controller.create('author-id', {
        title: 'Test',
        storyId: 's1',
      } as any);

      expect(articlesService.create).toHaveBeenCalledWith('author-id', {
        title: 'Test',
        storyId: 's1',
      });
      expect(result.title).toBe('Test Article');
    });
  });

  describe('findAll', () => {
    it('should call findAll with user and storyId filter', async () => {
      articlesService.findAll.mockResolvedValue({
        data: [mockArticle()],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });

      const result = await controller.findAll(mockUser, { storyId: 's1' });

      expect(articlesService.findAll).toHaveBeenCalledWith(mockUser, {
        storyId: 's1',
      });
      expect(result.data).toHaveLength(1);
    });

    it('should work without storyId filter', async () => {
      articlesService.findAll.mockResolvedValue({
        data: [mockArticle()],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });

      await controller.findAll(mockUser, {});

      expect(articlesService.findAll).toHaveBeenCalledWith(mockUser, {});
    });
  });

  describe('getReviewQueue', () => {
    it('should call getReviewQueue with editorId', async () => {
      articlesService.getReviewQueue.mockResolvedValue([mockArticle()]);

      const result = await controller.getReviewQueue('editor-id');

      expect(articlesService.getReviewQueue).toHaveBeenCalledWith('editor-id');
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return article when user is author', async () => {
      articlesService.verifyAccess.mockResolvedValue(undefined);
      articlesService.findOne.mockResolvedValue(
        mockArticle({ authorId: 'author-id' }),
      );

      const result = await controller.findOne('article-id', mockUser);

      expect(articlesService.verifyAccess).toHaveBeenCalledWith(
        'article-id',
        mockUser,
      );
      expect(articlesService.findOne).toHaveBeenCalledWith('article-id');
      expect(result.id).toBe('article-id');
    });

    it('should return article when user is admin', async () => {
      articlesService.verifyAccess.mockResolvedValue(undefined);
      articlesService.findOne.mockResolvedValue(
        mockArticle({ authorId: 'other-id' }),
      );

      const result = await controller.findOne('article-id', mockAdmin);

      expect(articlesService.verifyAccess).toHaveBeenCalledWith(
        'article-id',
        mockAdmin,
      );
      expect(result.id).toBe('article-id');
    });

    it('should throw ForbiddenException when no access', async () => {
      articlesService.verifyAccess.mockRejectedValue(new ForbiddenException());

      await expect(controller.findOne('article-id', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should verify access then update', async () => {
      articlesService.verifyAccess.mockResolvedValue(undefined);
      articlesService.update.mockResolvedValue(
        mockArticle({ title: 'Updated' }),
      );

      const result = await controller.update(mockUser, 'article-id', {
        title: 'Updated',
      });

      expect(articlesService.verifyAccess).toHaveBeenCalledWith(
        'article-id',
        mockUser,
      );
      expect(articlesService.update).toHaveBeenCalledWith('article-id', {
        title: 'Updated',
      });
      expect(result.title).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should verify access then remove', async () => {
      articlesService.verifyAccess.mockResolvedValue(undefined);
      articlesService.remove.mockResolvedValue({ success: true });

      const result = await controller.remove('article-id', mockUser);

      expect(articlesService.verifyAccess).toHaveBeenCalledWith(
        'article-id',
        mockUser,
      );
      expect(articlesService.remove).toHaveBeenCalledWith('article-id');
      expect(result.success).toBe(true);
    });
  });

  describe('getVersions', () => {
    it('should return versions when user has access', async () => {
      articlesService.verifyAccess.mockResolvedValue(undefined);
      articlesService.getVersions.mockResolvedValue([{ version: 1 }]);

      const result = await controller.getVersions('article-id', mockUser);

      expect(articlesService.verifyAccess).toHaveBeenCalledWith(
        'article-id',
        mockUser,
      );
      expect(articlesService.getVersions).toHaveBeenCalledWith('article-id');
      expect(result).toHaveLength(1);
    });

    it('should throw ForbiddenException when no access', async () => {
      articlesService.verifyAccess.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.getVersions('article-id', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('rollback', () => {
    it('should verify access then rollback', async () => {
      articlesService.verifyAccess.mockResolvedValue(undefined);
      articlesService.rollback.mockResolvedValue(mockArticle());

      const result = await controller.rollback(mockUser, 'article-id', '3');

      expect(articlesService.verifyAccess).toHaveBeenCalledWith(
        'article-id',
        mockUser,
      );
      expect(articlesService.rollback).toHaveBeenCalledWith('article-id', 3);
      expect(result.id).toBe('article-id');
    });
  });

  describe('assignEditor', () => {
    it('should call assignEditor', async () => {
      articlesService.assignEditor.mockResolvedValue(
        mockArticle({ editorId: 'editor-id' }),
      );

      const result = await controller.assignEditor('article-id', 'editor-id');

      expect(articlesService.assignEditor).toHaveBeenCalledWith(
        'article-id',
        'editor-id',
      );
      expect(result.editorId).toBe('editor-id');
    });
  });

  describe('submitReview', () => {
    it('should call submitReview with decision', async () => {
      articlesService.submitReview.mockResolvedValue({
        article: mockArticle(),
        decision: 'APPROVE',
      });

      const result = await controller.submitReview('article-id', 'editor-id', {
        decision: 'APPROVE',
        comment: 'Good',
      });

      expect(articlesService.submitReview).toHaveBeenCalledWith(
        'article-id',
        'editor-id',
        'APPROVE',
        'Good',
      );
      expect(result.decision).toBe('APPROVE');
    });
  });

  // ===== AI Operations =====
  const aiTests = [
    { name: 'aiRewrite', method: 'aiRewrite' as const, dto: { text: 'Hello' } },
    { name: 'aiExpand', method: 'aiExpand' as const, dto: { text: 'Hello' } },
    {
      name: 'aiCondense',
      method: 'aiCondense' as const,
      dto: { text: 'Hello' },
    },
    { name: 'aiPolish', method: 'aiPolish' as const, dto: { text: 'Hello' } },
    { name: 'aiHeadlines', method: 'aiHeadlines' as const, dto: { count: 3 } },
    {
      name: 'aiExcerpt',
      method: 'aiExcerpt' as const,
      dto: { maxLength: 100 },
    },
    { name: 'aiChat', method: 'aiChat' as const, dto: { messages: [] } },
    { name: 'aiFactCheck', method: 'aiFactCheck' as const, dto: {} },
    { name: 'aiReview', method: 'aiReview' as const, dto: {} },
  ];

  aiTests.forEach(({ name, method, dto }) => {
    describe(name, () => {
      it(`should call articlesService.${method}`, async () => {
        articlesService[method].mockResolvedValue({ result: 'AI output' });

        const result = await (controller as any)[method](
          mockUser,
          'article-id',
          dto as any,
        );

        expect(articlesService[method]).toHaveBeenCalledWith(
          'article-id',
          mockUser,
          dto,
        );
        expect(result.result).toBe('AI output');
      });
    });
  });
});
