import { IsOptional, IsString } from 'class-validator';

export class FindPublicArticlesDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  storyId?: string;

  @IsOptional()
  page?: number | string;

  @IsOptional()
  pageSize?: number | string;
}
