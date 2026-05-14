import { IsString, IsOptional, IsInt, IsEnum, IsDateString } from 'class-validator';
import { ArticleStatus } from '@cms-ng/shared';

export class CreateStoryDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  angle?: string;

  @IsEnum(ArticleStatus)
  @IsOptional()
  status?: ArticleStatus;

  @IsInt()
  @IsOptional()
  priority?: number;

  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsDateString()
  @IsOptional()
  deadline?: string;
}
