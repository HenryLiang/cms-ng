import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ArticleAccessService } from './article-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { UserRole } from '@cms-ng/shared';

describe('ArticleAccessService', () => {
  let service: ArticleAccessService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  const mockArticle = (override?: Partial<{ authorId: string; editorId: string | null }>) => ({
    id: 'article-id',
    authorId: 'author-id',
    editorId: null,
    ...override,
  });

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticleAccessService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ArticleAccessService>(ArticleAccessService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===== checkAccess =====
  describe('checkAccess', () => {
    it('should allow ADMIN regardless of authorship', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ authorId: 'other-id' }));

      await expect(
        service.checkAccess('article-id', { userId: 'admin-id', role: UserRole.ADMIN }),
      ).resolves.toBeUndefined();
      expect(prisma.article.findUnique).toHaveBeenCalledWith({
        where: { id: 'article-id' },
        select: { authorId: true, editorId: true },
      });
    });

    it('should allow the author', async () => {
      prisma.article.findUnique.mockResolvedValue(mockArticle({ authorId: 'author-id' }));

      await expect(
        service.checkAccess('article-id', { userId: 'author-id', role: UserRole.REPORTER }),
      ).resolves.toBeUndefined();
    });

    it('should allow the assigned editor', async () => {
      prisma.article.findUnique.mockResolvedValue(
        mockArticle({ authorId: 'other-id', editorId: 'editor-id' }),
      );

      await expect(
        service.checkAccess('article-id', { userId: 'editor-id', role: UserRole.EDITOR }),
      ).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when the article does not exist', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(
        service.checkAccess('nonexistent', { userId: 'user-id', role: UserRole.REPORTER }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is neither admin/author/editor', async () => {
      prisma.article.findUnique.mockResolvedValue(
        mockArticle({ authorId: 'other-id', editorId: 'another-id' }),
      );

      await expect(
        service.checkAccess('article-id', { userId: 'user-id', role: UserRole.REPORTER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use the provided custom error message on Forbidden', async () => {
      prisma.article.findUnique.mockResolvedValue(
        mockArticle({ authorId: 'other-id', editorId: 'another-id' }),
      );

      await expect(
        service.checkAccess(
          'article-id',
          { userId: 'user-id', role: UserRole.REPORTER },
          { errorMessage: 'You do not have permission to modify this article' },
        ),
      ).rejects.toThrow(
        new ForbiddenException('You do not have permission to modify this article'),
      );
    });

    it('should default to "access" error message when none provided', async () => {
      prisma.article.findUnique.mockResolvedValue(
        mockArticle({ authorId: 'other-id', editorId: 'another-id' }),
      );

      await expect(
        service.checkAccess('article-id', { userId: 'user-id', role: UserRole.REPORTER }),
      ).rejects.toThrow(
        new ForbiddenException('You do not have permission to access this article'),
      );
    });
  });

  // ===== findAndCheckAccess =====
  describe('findAndCheckAccess', () => {
    it('should return the article with the requested includes when admin', async () => {
      const full = { ...mockArticle(), author: { id: 'author-id', name: 'A' } };
      prisma.article.findUnique.mockResolvedValue(full);

      const result = await service.findAndCheckAccess(
        'article-id',
        { userId: 'admin-id', role: UserRole.ADMIN },
        { include: { author: { select: { id: true, name: true } } } },
      );

      expect(result).toBe(full);
      expect(prisma.article.findUnique).toHaveBeenCalledWith({
        where: { id: 'article-id' },
        include: { author: { select: { id: true, name: true } } },
      });
    });

    it('should return the article for the author', async () => {
      const full = mockArticle({ authorId: 'author-id' });
      prisma.article.findUnique.mockResolvedValue(full);

      const result = await service.findAndCheckAccess(
        'article-id',
        { userId: 'author-id', role: UserRole.REPORTER },
        { include: {} },
      );

      expect(result).toBe(full);
    });

    it('should throw NotFoundException when article does not exist', async () => {
      prisma.article.findUnique.mockResolvedValue(null);

      await expect(
        service.findAndCheckAccess(
          'nonexistent',
          { userId: 'user-id', role: UserRole.REPORTER },
          { include: {} },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user has no access', async () => {
      prisma.article.findUnique.mockResolvedValue(
        mockArticle({ authorId: 'other-id', editorId: 'another-id' }),
      );

      await expect(
        service.findAndCheckAccess(
          'article-id',
          { userId: 'user-id', role: UserRole.REPORTER },
          { include: {} },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use the provided custom error message', async () => {
      prisma.article.findUnique.mockResolvedValue(
        mockArticle({ authorId: 'other-id', editorId: 'another-id' }),
      );

      await expect(
        service.findAndCheckAccess(
          'article-id',
          { userId: 'user-id', role: UserRole.REPORTER },
          { include: {}, errorMessage: 'custom deny' },
        ),
      ).rejects.toThrow(new ForbiddenException('custom deny'));
    });
  });
});
