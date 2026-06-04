import { IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ArticleStatus, ContentLanguage } from '@cms-ng/shared';

/**
 * Query DTO for GET /stories.
 *
 * 支持:
 *  - 分页: page / pageSize
 *  - 筛选: status / contentLanguage
 *  - 排序: sortBy (Story 字段) + order ('asc' | 'desc')
 *
 * 默认值在 service 层兜底,这里只做 schema 校验。
 */
export class FindAllStoriesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @IsOptional()
  @IsEnum(ContentLanguage)
  contentLanguage?: ContentLanguage;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'priority', 'title'])
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'title';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
