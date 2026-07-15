import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Pagination query DTO used by per-source fetch endpoints
 * (sina, people, bbc, chinanews, guardian, nytimes, economist, ft, zaobao,
 *  weibo-hot, zhihu-hot, 36kr, huxiu, douban-movie).
 *
 * Service layer clamps `page` to >= 1 and `limit` to [1, 50] regardless of
 * what the client sends; the DTO enforces a basic >= 1 floor so we never feed
 * non-positive numbers into the pagination math.
 */
export class SourcePaginationDto {
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
  page?: number = 1;

  @ApiProperty({
    description:
      'Maximum number of results to return (hard-capped at 50 by the service)',
    example: 10,
    minimum: 1,
    maximum: 50,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
