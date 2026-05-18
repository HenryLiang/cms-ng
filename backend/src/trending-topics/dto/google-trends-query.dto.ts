import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GoogleTrendsQueryDto {
  @IsString()
  @IsOptional()
  geo?: string = 'HK';

  @IsString()
  @IsOptional()
  timeRange?: string = '24h';

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;
}
