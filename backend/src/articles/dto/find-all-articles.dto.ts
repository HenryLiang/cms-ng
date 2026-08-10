import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Query DTO for GET /articles.
 *
 * 分页参数在 service 层通过 common/pagination.ts 兜底, 这里只做
 * schema 校验 (>= 1 的整数, 可选)。search 与 storyId 单独接收。
 */
export class FindAllArticlesDto {
  @ApiProperty({
    description: 'Search article titles and full content',
    example: 'climate policy',
    maxLength: 200,
    required: false,
  })
  @Transform(
    ({ value }) => {
      const search: unknown = value;
      return typeof search === 'string' ? search.trim() : search;
    },
    { toClassOnly: true },
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

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
    description: 'Filter results to a specific story by its UUID',
    example: '8a3b1c52-7f1d-4d2e-9b1f-3a4b5c6d7e8f',
    required: false,
  })
  @IsOptional()
  @IsString()
  storyId?: string;
}
