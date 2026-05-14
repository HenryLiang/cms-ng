import { IsString, IsOptional } from 'class-validator';

export class GoogleTrendsQueryDto {
  @IsString()
  @IsOptional()
  geo?: string = 'HK';

  @IsString()
  @IsOptional()
  timeRange?: string = '24h';
}
