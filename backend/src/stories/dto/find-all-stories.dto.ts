import { IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    description: '1-based page number for pagination',
    example: 1,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiProperty({
    description: 'Filter by workflow status',
    enum: ArticleStatus,
    example: ArticleStatus.DRAFT,
    required: false,
  })
  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @ApiProperty({
    description: 'Filter by content language',
    enum: ContentLanguage,
    example: ContentLanguage.ENGLISH,
    required: false,
  })
  @IsOptional()
  @IsEnum(ContentLanguage)
  contentLanguage?: ContentLanguage;

  @ApiProperty({
    description: 'Field to sort results by',
    enum: ['createdAt', 'updatedAt', 'priority', 'title'],
    example: 'createdAt',
    required: false,
  })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'priority', 'title'])
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'title';

  @ApiProperty({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    example: 'desc',
    required: false,
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
