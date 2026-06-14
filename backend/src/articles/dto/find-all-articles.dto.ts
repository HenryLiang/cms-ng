import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/**
 * Query DTO for GET /articles.
 *
 * 分页参数在 service 层通过 common/pagination.ts 兜底, 这里只做
 * schema 校验 (>= 1 的整数, 可选)。storyId 单独接收。
 */
export class FindAllArticlesDto {
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
  @IsString()
  storyId?: string;
}
