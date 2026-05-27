import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { ArticleStatus, ContentLanguage } from '@cms-ng/shared';

export class CreateArticleDto {
  @IsUUID()
  storyId: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  content: string;

  @IsString()
  @IsOptional()
  excerpt?: string;

  @IsEnum(ArticleStatus)
  @IsOptional()
  status?: ArticleStatus;

  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsEnum(ContentLanguage)
  @IsOptional()
  contentLanguage?: ContentLanguage;
}
