import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@cms-ng/shared';

export interface ArticleAccessUser {
  userId: string;
  role: string;
}

export interface CheckAccessOptions {
  /**
   * Override the ForbiddenException message. Default: "You do not have
   * permission to access this article".
   */
  errorMessage?: string;
}

export interface FindAndCheckAccessOptions<I extends Prisma.ArticleInclude>
  extends CheckAccessOptions {
  include: I;
}

/**
 * Single source of truth for "can this user read or modify this article?".
 *
 * Access rule (mirrors what was duplicated in articles.service.ts and
 * channels.service.ts):
 *   - ADMIN: always allowed
 *   - otherwise: must be the article's author OR its assigned editor
 *
 * Throws:
 *   - NotFoundException  when the article does not exist
 *   - ForbiddenException when the user is not allowed
 *
 * Why: previously this exact check was copy-pasted in 3 places (articles
 * service's verifyAccess / verifyAccessAndGet, and channels service's
 * verifyAccess). Centralising removes the drift risk and gives us one
 * place to evolve the rule (e.g. add reviewers, workspace membership).
 */
@Injectable()
export class ArticleAccessService {
  constructor(private prisma: PrismaService) {}

  /**
   * Verify that the user can access the article. Returns void; throws on
   * failure. Use this when the caller only needs the yes/no answer.
   */
  async checkAccess(
    articleId: string,
    user: ArticleAccessUser,
    options: CheckAccessOptions = {},
  ): Promise<void> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { authorId: true, editorId: true },
    });
    if (!article) throw new NotFoundException('Article not found');

    this.assertCanAccess(article.authorId, article.editorId, user, options);
  }

  /**
   * Verify access and return the full article (with caller-specified
   * relations) in a single DB round-trip. Use this when the caller needs
   * the article data after passing the access check.
   */
  async findAndCheckAccess<I extends Prisma.ArticleInclude>(
    articleId: string,
    user: ArticleAccessUser,
    options: FindAndCheckAccessOptions<I>,
  ): Promise<Prisma.ArticleGetPayload<{ include: I }>> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: options.include,
    });
    if (!article) throw new NotFoundException('Article not found');

    this.assertCanAccess(article.authorId, article.editorId, user, options);
    return article as Prisma.ArticleGetPayload<{ include: I }>;
  }

  private assertCanAccess(
    authorId: string,
    editorId: string | null,
    user: ArticleAccessUser,
    options: CheckAccessOptions,
  ): void {
    const canAccess =
      user.role === UserRole.ADMIN ||
      authorId === user.userId ||
      editorId === user.userId;

    if (!canAccess) {
      throw new ForbiddenException(
        options.errorMessage ??
          'You do not have permission to access this article',
      );
    }
  }
}
